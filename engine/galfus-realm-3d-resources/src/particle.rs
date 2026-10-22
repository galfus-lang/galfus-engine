//! 3D Particle emitter and simulation components.

use std::f32::consts::TAU;

use bytemuck::{Pod, Zeroable};
use glam::{Quat, Vec3, Vec4};
use serde::{Deserialize, Serialize};

/// 3D geometric shape from which particles are spawned.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EmissionShape3D {
    /// All particles spawn at the emitter origin.
    #[default]
    Point,
    /// Particles spawn randomly within or on the surface of a sphere.
    Sphere { radius: f32 },
    /// Particles spawn randomly within an axis-aligned box.
    Box { extents: [f32; 3] },
    /// Particles spawn within a cone radiating outwards.
    Cone {
        angle_rad: f32,
        radius: f32,
        height: f32,
    },
    /// Particles spawn randomly within a cylinder along the Y axis.
    Cylinder { radius: f32, height: f32 },
}

/// GPU-ready layout for individual 3D particle billboard instances.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable, PartialEq)]
pub struct Particle3DInstance {
    /// World-space position of particle center.
    pub position: [f32; 3],
    /// Current rendered size (diameter) in world units.
    pub size: f32,
    /// RGBA interpolated color tint.
    pub color: [f32; 4],
    /// 2D in-plane billboard rotation in radians.
    pub rotation: f32,
    /// 16-byte alignment padding.
    pub _pad: [f32; 3],
}

/// Configuration descriptor for a 3D particle emitter entity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleEmitter3D {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Logical material ID used to render the particles.
    pub material_id: Option<u32>,
    /// Maximum capacity of active particles in the simulation pool.
    pub max_particles: u32,
    /// Continuous spawn rate in particles per second.
    pub spawn_rate: f32,
    /// Lifespan range `[min, max]` in seconds.
    pub lifetime_range: [f32; 2],
    /// Initial launch speed range `[min, max]`.
    pub speed_range: [f32; 2],
    /// Base directional launch vector (normalized internally).
    pub direction: Vec3,
    /// Angle spread cone in radians `[0.0..PI]`.
    pub spread_angle_rad: f32,
    /// Constant acceleration vector (e.g. gravity `[0.0, -9.81, 0.0]`).
    pub gravity: Vec3,
    /// Linear damping coefficient `[0.0..1.0]` applied to velocity per second.
    pub drag: f32,
    /// Initial particle size range `[min, max]`.
    pub start_size_range: [f32; 2],
    /// Final particle size range `[min, max]`.
    pub end_size_range: [f32; 2],
    /// Initial particle RGBA color tint.
    pub start_color: Vec4,
    /// Final particle RGBA color tint at the end of its life.
    pub end_color: Vec4,
    /// Initial angular velocity range `[min, max]` in radians per second.
    pub rotation_speed_range: [f32; 2],
    /// UV coordinates crop rectangle `[u, v, width, height]` for atlas textures.
    pub uv_rect: Vec4,
    /// Geometric emission region.
    #[serde(default)]
    pub emission_shape: EmissionShape3D,
    /// Active simulation state flag.
    pub active: bool,
}

impl Default for ParticleEmitter3D {
    fn default() -> Self {
        Self {
            label: None,
            material_id: None,
            max_particles: 1000,
            spawn_rate: 120.0,
            lifetime_range: [1.0, 2.5],
            speed_range: [2.0, 6.0],
            direction: Vec3::Y,
            spread_angle_rad: std::f32::consts::FRAC_PI_4,
            gravity: Vec3::new(0.0, -9.81, 0.0),
            drag: 0.0,
            start_size_range: [0.2, 0.4],
            end_size_range: [0.0, 0.05],
            start_color: Vec4::ONE,
            end_color: Vec4::new(1.0, 1.0, 1.0, 0.0),
            rotation_speed_range: [-2.0, 2.0],
            uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
            emission_shape: EmissionShape3D::Point,
            active: true,
        }
    }
}

/// Internal individual particle in the CPU simulation pool.
#[derive(Debug, Clone)]
pub struct Particle3D {
    pub position: Vec3,
    pub velocity: Vec3,
    pub age: f32,
    pub lifetime: f32,
    pub start_size: f32,
    pub end_size: f32,
    pub start_color: Vec4,
    pub end_color: Vec4,
    pub rotation: f32,
    pub rotation_speed: f32,
}

/// Simulation state and active pool for a 3D particle emitter.
#[derive(Debug, Clone)]
pub struct ParticleEmitterState3D {
    pub particles: Vec<Particle3D>,
    spawn_acc: f32,
    rng: u64,
}

impl Default for ParticleEmitterState3D {
    fn default() -> Self {
        Self {
            particles: Vec::new(),
            spawn_acc: 0.0,
            rng: 0x8543_9124_u64,
        }
    }
}

impl ParticleEmitterState3D {
    pub fn new() -> Self {
        Self::default()
    }

    #[inline]
    fn rand_f32(&mut self) -> f32 {
        self.rng = self.rng.wrapping_mul(6364136223846793005).wrapping_add(1);
        ((self.rng >> 32) as u32 as f32) / (u32::MAX as f32)
    }

    #[inline]
    fn rand_range(&mut self, range: [f32; 2]) -> f32 {
        range[0] + self.rand_f32() * (range[1] - range[0])
    }

    /// Spawns a single particle given emitter properties and world transform.
    pub fn spawn_particle(
        &mut self,
        emitter: &ParticleEmitter3D,
        world_pos: Vec3,
        world_rot: Quat,
    ) {
        let lifetime = self.rand_range(emitter.lifetime_range).max(0.05);
        let speed = self.rand_range(emitter.speed_range);
        let start_size = self.rand_range(emitter.start_size_range);
        let end_size = self.rand_range(emitter.end_size_range);
        let rotation = self.rand_f32() * TAU;
        let rotation_speed = self.rand_range(emitter.rotation_speed_range);

        // Emission offset
        let local_offset = match &emitter.emission_shape {
            EmissionShape3D::Point => Vec3::ZERO,
            EmissionShape3D::Sphere { radius } => {
                let theta = self.rand_f32() * TAU;
                let phi = (self.rand_f32() * 2.0 - 1.0).acos();
                let r = self.rand_f32().cbrt() * *radius;
                Vec3::new(
                    r * phi.sin() * theta.cos(),
                    r * phi.cos(),
                    r * phi.sin() * theta.sin(),
                )
            }
            EmissionShape3D::Box { extents } => Vec3::new(
                (self.rand_f32() - 0.5) * extents[0],
                (self.rand_f32() - 0.5) * extents[1],
                (self.rand_f32() - 0.5) * extents[2],
            ),
            EmissionShape3D::Cone { radius, height, .. } => {
                let h_frac = self.rand_f32();
                let r = h_frac * *radius * self.rand_f32().sqrt();
                let theta = self.rand_f32() * TAU;
                Vec3::new(r * theta.cos(), h_frac * *height, r * theta.sin())
            }
            EmissionShape3D::Cylinder { radius, height } => {
                let r = *radius * self.rand_f32().sqrt();
                let theta = self.rand_f32() * TAU;
                let y = (self.rand_f32() - 0.5) * *height;
                Vec3::new(r * theta.cos(), y, r * theta.sin())
            }
        };

        // Direction with cone spread
        let base_dir = emitter.direction.normalize_or_zero();
        let spread = emitter.spread_angle_rad.clamp(0.0, std::f32::consts::PI);

        let launch_dir = if spread > 1e-4 {
            let cos_angle = 1.0 - self.rand_f32() * (1.0 - spread.cos());
            let sin_angle = (1.0 - cos_angle * cos_angle).max(0.0).sqrt();
            let phi = self.rand_f32() * TAU;

            // Coordinate frame around base_dir
            let up = if base_dir.y.abs() < 0.99 {
                Vec3::Y
            } else {
                Vec3::Z
            };
            let tangent = base_dir.cross(up).normalize();
            let bitangent = base_dir.cross(tangent);

            (base_dir * cos_angle + (tangent * phi.cos() + bitangent * phi.sin()) * sin_angle)
                .normalize()
        } else {
            base_dir
        };

        let world_dir = world_rot * launch_dir;
        let spawn_pos = world_pos + world_rot * local_offset;

        self.particles.push(Particle3D {
            position: spawn_pos,
            velocity: world_dir * speed,
            age: 0.0,
            lifetime,
            start_size,
            end_size,
            start_color: emitter.start_color,
            end_color: emitter.end_color,
            rotation,
            rotation_speed,
        });
    }

    /// Triggers an immediate burst of `count` particles.
    pub fn burst(
        &mut self,
        emitter: &ParticleEmitter3D,
        count: u32,
        world_pos: Vec3,
        world_rot: Quat,
    ) {
        let room = (emitter.max_particles as usize).saturating_sub(self.particles.len());
        let to_spawn = (count as usize).min(room);
        for _ in 0..to_spawn {
            self.spawn_particle(emitter, world_pos, world_rot);
        }
    }

    /// Advances simulation by `dt` seconds and spawns continuous particles.
    pub fn update(
        &mut self,
        emitter: &ParticleEmitter3D,
        dt: f32,
        world_pos: Vec3,
        world_rot: Quat,
    ) {
        let dt = dt.clamp(0.0, 0.1);

        // 1. Update existing particles
        let drag_factor = (1.0 - emitter.drag * dt).max(0.0);
        let gravity_step = emitter.gravity * dt;

        self.particles.retain_mut(|p| {
            p.age += dt;
            if p.age >= p.lifetime {
                return false;
            }
            p.velocity = (p.velocity + gravity_step) * drag_factor;
            p.position += p.velocity * dt;
            p.rotation += p.rotation_speed * dt;
            true
        });

        // 2. Spawn continuous particles
        if emitter.active && emitter.spawn_rate > 0.0 {
            self.spawn_acc += emitter.spawn_rate * dt;
            let count = self.spawn_acc.floor() as usize;
            self.spawn_acc -= count as f32;

            let room = (emitter.max_particles as usize).saturating_sub(self.particles.len());
            let spawn_count = count.min(room);
            for _ in 0..spawn_count {
                self.spawn_particle(emitter, world_pos, world_rot);
            }
        }
    }

    /// Generates GPU instance data for all currently active particles.
    pub fn build_instances(&self) -> Vec<Particle3DInstance> {
        let mut instances = Vec::with_capacity(self.particles.len());

        for p in &self.particles {
            let t = (p.age / p.lifetime).clamp(0.0, 1.0);
            let size = p.start_size + (p.end_size - p.start_size) * t;
            let color = p.start_color.lerp(p.end_color, t);

            instances.push(Particle3DInstance {
                position: p.position.to_array(),
                size,
                color: color.to_array(),
                rotation: p.rotation,
                _pad: [0.0; 3],
            });
        }

        instances
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_particle_emitter_lifecycle() {
        let emitter = ParticleEmitter3D::default();
        let mut state = ParticleEmitterState3D::new();

        assert_eq!(state.particles.len(), 0);
        state.update(&emitter, 0.1, Vec3::ZERO, Quat::IDENTITY);
        assert!(!state.particles.is_empty());

        let instances = state.build_instances();
        assert_eq!(instances.len(), state.particles.len());
    }

    #[test]
    fn test_particle_burst() {
        let emitter = ParticleEmitter3D {
            max_particles: 50,
            ..Default::default()
        };
        let mut state = ParticleEmitterState3D::new();
        state.burst(&emitter, 30, Vec3::ZERO, Quat::IDENTITY);
        assert_eq!(state.particles.len(), 30);

        // Burst exceeding max capacity
        state.burst(&emitter, 50, Vec3::ZERO, Quat::IDENTITY);
        assert_eq!(state.particles.len(), 50);
    }
}
