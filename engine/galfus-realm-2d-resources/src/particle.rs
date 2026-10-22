//! 2D Particle emitter and simulation components.

use glam::{Mat4, Vec2, Vec4};
use serde::{Deserialize, Serialize};

/// 2D geometric shape from which particles are spawned.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EmissionShape2D {
    /// All particles spawn at the emitter origin.
    #[default]
    Point,
    /// Particles spawn randomly within or on the edge of a circle.
    Circle { radius: f32 },
    /// Particles spawn randomly within a rectangle.
    Rectangle { extents: [f32; 2] },
    /// Particles spawn along a directed line segment.
    Line { direction: [f32; 2], length: f32 },
}

/// Configuration descriptor for a 2D particle emitter entity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleEmitter2D {
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
    pub direction: Vec2,
    /// Angle spread cone in radians `[0.0..TAU]`.
    pub spread_angle_rad: f32,
    /// Constant acceleration vector (e.g. gravity `[0.0, -9.8]`).
    pub gravity: Vec2,
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
    pub emission_shape: EmissionShape2D,
    /// Z-sorting layer for 2D batch ordering.
    pub z_layer: i32,
    /// Whether particles cast 2D dynamic shadows.
    pub cast_shadow: bool,
    /// Whether particles receive 2D dynamic shadows.
    pub receive_shadow: bool,
    /// Active simulation state flag.
    pub active: bool,
}

impl Default for ParticleEmitter2D {
    fn default() -> Self {
        Self {
            label: None,
            material_id: None,
            max_particles: 500,
            spawn_rate: 60.0,
            lifetime_range: [1.0, 2.0],
            speed_range: [2.0, 5.0],
            direction: Vec2::new(0.0, 1.0),
            spread_angle_rad: std::f32::consts::FRAC_PI_4,
            gravity: Vec2::ZERO,
            drag: 0.0,
            start_size_range: [0.3, 0.5],
            end_size_range: [0.0, 0.1],
            start_color: Vec4::ONE,
            end_color: Vec4::new(1.0, 1.0, 1.0, 0.0),
            rotation_speed_range: [-1.0, 1.0],
            uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
            emission_shape: EmissionShape2D::Point,
            z_layer: 1,
            cast_shadow: false,
            receive_shadow: false,
            active: true,
        }
    }
}

/// Individual particle instance state in the simulation pool.
#[derive(Debug, Clone)]
pub struct Particle2D {
    pub position: Vec2,
    pub velocity: Vec2,
    pub rotation: f32,
    pub rotation_speed: f32,
    pub start_size: f32,
    pub end_size: f32,
    pub start_color: Vec4,
    pub end_color: Vec4,
    pub age: f32,
    pub lifetime: f32,
}

/// Runtime simulation state managing the active particle pool and emission timing.
#[derive(Debug, Clone)]
pub struct ParticleEmitterState2D {
    pub particles: Vec<Particle2D>,
    spawn_accumulator: f32,
    rng_state: u64,
}

impl Default for ParticleEmitterState2D {
    fn default() -> Self {
        Self {
            particles: Vec::new(),
            spawn_accumulator: 0.0,
            rng_state: 0x853c49e6748fea9b,
        }
    }
}

impl ParticleEmitterState2D {
    /// Creates a new simulation state with preallocated particle capacity.
    pub fn new(capacity: usize) -> Self {
        Self {
            particles: Vec::with_capacity(capacity),
            spawn_accumulator: 0.0,
            rng_state: 0x853c49e6748fea9b,
        }
    }

    /// Advances the simulation by `dt` seconds, updating physics and spawning new particles.
    pub fn update(&mut self, dt: f32, emitter_pos: Vec2, cfg: &ParticleEmitter2D) {
        if dt <= 0.0 {
            return;
        }

        // 1. Update existing particles
        let drag_factor = (1.0 - cfg.drag * dt).clamp(0.0, 1.0);
        let gravity_delta = cfg.gravity * dt;

        self.particles.retain_mut(|p| {
            p.age += dt;
            if p.age >= p.lifetime {
                return false;
            }
            p.velocity += gravity_delta;
            p.velocity *= drag_factor;
            p.position += p.velocity * dt;
            p.rotation += p.rotation_speed * dt;
            true
        });

        // 2. Spawn new particles
        if cfg.active && cfg.spawn_rate > 0.0 {
            self.spawn_accumulator += cfg.spawn_rate * dt;
            let count = self.spawn_accumulator.floor() as u32;
            if count > 0 {
                self.spawn_accumulator -= count as f32;
                let available = (cfg.max_particles as usize).saturating_sub(self.particles.len());
                let spawn_count = (count as usize).min(available);
                for _ in 0..spawn_count {
                    self.spawn_one(emitter_pos, cfg);
                }
            }
        }
    }

    /// Triggers an immediate burst of `count` particles.
    pub fn burst(&mut self, count: u32, emitter_pos: Vec2, cfg: &ParticleEmitter2D) {
        let available = (cfg.max_particles as usize).saturating_sub(self.particles.len());
        let spawn_count = (count as usize).min(available);
        for _ in 0..spawn_count {
            self.spawn_one(emitter_pos, cfg);
        }
    }

    /// Clears all currently active particles in the emitter.
    pub fn clear(&mut self) {
        self.particles.clear();
        self.spawn_accumulator = 0.0;
    }

    /// Spawns a single particle into the pool based on the emitter configuration.
    fn spawn_one(&mut self, emitter_pos: Vec2, cfg: &ParticleEmitter2D) {
        let lifetime = self.lerp_rng(cfg.lifetime_range[0], cfg.lifetime_range[1]);
        let speed = self.lerp_rng(cfg.speed_range[0], cfg.speed_range[1]);
        let start_size = self.lerp_rng(cfg.start_size_range[0], cfg.start_size_range[1]);
        let end_size = self.lerp_rng(cfg.end_size_range[0], cfg.end_size_range[1]);
        let rotation_speed =
            self.lerp_rng(cfg.rotation_speed_range[0], cfg.rotation_speed_range[1]);

        // Launch angle
        let base_angle = cfg.direction.y.atan2(cfg.direction.x);
        let spread_offset = (self.next_f32() - 0.5) * cfg.spread_angle_rad;
        let final_angle = base_angle + spread_offset;
        let velocity = Vec2::new(final_angle.cos(), final_angle.sin()) * speed;

        // Origin offset from emission shape
        let offset = match cfg.emission_shape {
            EmissionShape2D::Point => Vec2::ZERO,
            EmissionShape2D::Circle { radius } => {
                let r = radius * self.next_f32().sqrt();
                let theta = self.next_f32() * std::f32::consts::TAU;
                Vec2::new(r * theta.cos(), r * theta.sin())
            }
            EmissionShape2D::Rectangle { extents } => Vec2::new(
                (self.next_f32() - 0.5) * extents[0],
                (self.next_f32() - 0.5) * extents[1],
            ),
            EmissionShape2D::Line { direction, length } => {
                let dir = Vec2::new(direction[0], direction[1]).normalize_or_zero();
                dir * ((self.next_f32() - 0.5) * length)
            }
        };

        let rotation = self.next_f32() * std::f32::consts::TAU;

        self.particles.push(Particle2D {
            position: emitter_pos + offset,
            velocity,
            rotation,
            rotation_speed,
            start_size,
            end_size,
            start_color: cfg.start_color,
            end_color: cfg.end_color,
            age: 0.0,
            lifetime: lifetime.max(0.001),
        });
    }

    /// Fast LCG pseudo-random number generator for deterministic particle generation.
    fn next_f32(&mut self) -> f32 {
        self.rng_state = self
            .rng_state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let x = (self.rng_state >> 32) as u32;
        (x as f32) / (u32::MAX as f32)
    }

    fn lerp_rng(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.next_f32()
    }
}

/// Computes the 2D affine model matrix for an active particle instance quad.
pub fn compute_particle_matrix(position: Vec2, rotation: f32, size: f32, z_layer: i32) -> Mat4 {
    let z_depth = z_layer as f32 * 0.001;
    let (sin, cos) = rotation.sin_cos();
    Mat4::from_cols(
        glam::Vec4::new(cos * size, sin * size, 0.0, 0.0),
        glam::Vec4::new(-sin * size, cos * size, 0.0, 0.0),
        glam::Vec4::new(0.0, 0.0, 1.0, 0.0),
        glam::Vec4::new(position.x, position.y, z_depth, 1.0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_particle_emitter_lifecycle() {
        let cfg = ParticleEmitter2D {
            max_particles: 10,
            spawn_rate: 10.0,
            lifetime_range: [0.5, 0.5],
            speed_range: [2.0, 2.0],
            direction: Vec2::new(1.0, 0.0),
            spread_angle_rad: 0.0,
            ..Default::default()
        };

        let mut state = ParticleEmitterState2D::new(10);
        state.update(0.1, Vec2::ZERO, &cfg); // spawns 1 particle
        assert_eq!(state.particles.len(), 1);

        let p = &state.particles[0];
        assert!(p.velocity.x > 1.9);

        // Advance past lifetime
        state.update(0.6, Vec2::ZERO, &cfg);
        // Old particle dies, new ones spawn
        assert!(state.particles.iter().all(|p| p.age < 0.5));
    }

    #[test]
    fn test_particle_burst() {
        let cfg = ParticleEmitter2D {
            max_particles: 50,
            spawn_rate: 0.0,
            ..Default::default()
        };
        let mut state = ParticleEmitterState2D::new(50);
        state.burst(25, Vec2::ZERO, &cfg);
        assert_eq!(state.particles.len(), 25);
    }
}
