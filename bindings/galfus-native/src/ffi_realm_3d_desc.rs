use std::f32::consts::FRAC_PI_4;

use galfus_realm_3d_resources::camera::{Camera3D, CameraKind3D, CameraLookAt3D};
use galfus_realm_3d_resources::environment::{
    BloomConfig3D, EnvironmentRealm3D, FogMode3D, OutlineConfig3D, SkyboxConfig3D, SkyboxMode3D,
    SsaoConfig3D,
};
use galfus_realm_3d_resources::geometry::Geometry3D;
use galfus_realm_3d_resources::light::Light3D;
use galfus_realm_3d_resources::material::{Material3D, SurfaceType3D};
use galfus_realm_3d_resources::model::{InstancedModel3D, Model3D};
use galfus_realm_3d_resources::particle::{EmissionShape3D, ParticleEmitter3D};
use galfus_realm_3d_resources::transform::Transform3D;
use glam::{Quat, Vec3, Vec4};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform3DDesc {
    pub position: Option<[f32; 3]>,
    pub rotation: Option<[f32; 4]>,
    pub scale: Option<[f32; 3]>,
}

impl From<Transform3DDesc> for Transform3D {
    fn from(d: Transform3DDesc) -> Self {
        let pos = d
            .position
            .map(|p| Vec3::new(p[0], p[1], p[2]))
            .unwrap_or(Vec3::ZERO);
        let rot = d
            .rotation
            .map(|r| Quat::from_xyzw(r[0], r[1], r[2], r[3]))
            .unwrap_or(Quat::IDENTITY);
        let scale = d
            .scale
            .map(|s| Vec3::new(s[0], s[1], s[2]))
            .unwrap_or(Vec3::ONE);
        Transform3D::new(pos, rot, scale)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camera3DDesc {
    pub kind: Option<String>,
    pub fov_y: Option<f32>,
    pub near: Option<f32>,
    pub far: Option<f32>,
    pub ortho_scale: Option<f32>,
    pub camera_slot: Option<u32>,
    pub look_at: Option<CameraLookAt3DDesc>,
}

/// Host descriptor for an optional camera look-at point and preferred up direction.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraLookAt3DDesc {
    pub target: [f32; 3],
    pub up: Option<[f32; 3]>,
}

impl CameraLookAt3DDesc {
    pub fn into_vectors(self) -> (Vec3, Vec3) {
        (
            Vec3::from_array(self.target),
            self.up.map(Vec3::from_array).unwrap_or(Vec3::Y),
        )
    }
}

impl From<CameraLookAt3D> for CameraLookAt3DDesc {
    fn from(value: CameraLookAt3D) -> Self {
        Self {
            target: value.target.to_array(),
            up: Some(value.up.to_array()),
        }
    }
}

/// Host response for the current optional camera look-at configuration.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraLookAt3DStateDesc {
    pub enabled: bool,
    pub target: Option<[f32; 3]>,
    pub up: Option<[f32; 3]>,
}

impl From<Option<CameraLookAt3D>> for CameraLookAt3DStateDesc {
    fn from(value: Option<CameraLookAt3D>) -> Self {
        match value {
            Some(look_at) => Self {
                enabled: true,
                target: Some(look_at.target.to_array()),
                up: Some(look_at.up.to_array()),
            },
            None => Self {
                enabled: false,
                target: None,
                up: None,
            },
        }
    }
}

impl From<Camera3DDesc> for Camera3D {
    fn from(d: Camera3DDesc) -> Self {
        let kind = match d.kind.as_deref() {
            Some("orthographic") => CameraKind3D::Orthographic,
            _ => CameraKind3D::Perspective,
        };
        Camera3D {
            kind,
            fov_y: d.fov_y.unwrap_or(60.0).to_radians(),
            near: d.near.unwrap_or(0.1),
            far: d.far.unwrap_or(1000.0),
            ortho_scale: d.ortho_scale.unwrap_or(10.0),
            camera_slot: d.camera_slot.unwrap_or(0),
            active: true,
            look_at: None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Geometry3DDesc {
    pub primitive: Option<String>,
    pub size: Option<f32>,
    pub radius: Option<f32>,
    pub subdivisions: Option<u32>,
}

impl From<Geometry3DDesc> for Geometry3D {
    fn from(d: Geometry3DDesc) -> Self {
        match d.primitive.as_deref() {
            Some("cube") => Geometry3D::cube(d.size.unwrap_or(1.0)),
            Some("plane") => Geometry3D::plane(d.size.unwrap_or(1.0), d.size.unwrap_or(1.0)),
            Some("quad") => Geometry3D::quad(d.size.unwrap_or(1.0), d.size.unwrap_or(1.0)),
            Some("sphere") => Geometry3D::sphere(
                d.radius.unwrap_or(1.0),
                d.subdivisions.unwrap_or(32),
                d.subdivisions.unwrap_or(16),
            ),
            Some("cylinder") => Geometry3D::cylinder(
                d.radius.unwrap_or(1.0),
                d.size.unwrap_or(2.0),
                d.subdivisions.unwrap_or(32),
            ),
            Some("capsule") => Geometry3D::capsule(
                d.radius.unwrap_or(0.5),
                d.size.unwrap_or(1.5),
                d.subdivisions.unwrap_or(8),
                d.subdivisions.unwrap_or(32),
            ),
            Some("pyramid") => Geometry3D::pyramid(
                d.size.unwrap_or(1.0),
                d.size.unwrap_or(1.0),
                d.size.unwrap_or(1.5),
            ),
            Some("torus") => Geometry3D::torus(
                d.radius.unwrap_or(1.0),
                d.radius.unwrap_or(1.0) * 0.3,
                d.subdivisions.unwrap_or(32),
                d.subdivisions.unwrap_or(16),
            ),
            _ => Geometry3D::new(Vec::new(), Vec::new(), None),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Material3DDesc {
    pub surface_type: Option<String>,
    pub base_color: Option<[f32; 4]>,
    pub emissive_color: Option<[f32; 4]>,
    pub roughness: Option<f32>,
    pub metallic: Option<f32>,
    pub reflectance: Option<f32>,
    pub refraction_index: Option<f32>,
    pub refraction_distortion: Option<f32>,
    pub albedo_texture_id: Option<u32>,
    pub normal_texture_id: Option<u32>,
    pub metallic_roughness_texture_id: Option<u32>,
    pub occlusion_texture_id: Option<u32>,
    pub emissive_texture_id: Option<u32>,
    pub texture_slots: Option<Vec<Option<u32>>>,
    pub sampler_index: Option<u32>,
    pub shader_effect: Option<String>,
    pub custom_params: Option<Vec<[f32; 4]>>,
}

impl From<Material3DDesc> for Material3D {
    fn from(d: Material3DDesc) -> Self {
        let surface_type = match d.surface_type.as_deref() {
            Some("additive") => SurfaceType3D::Additive,
            Some("transparent") => SurfaceType3D::Transparent,
            Some("masked") => SurfaceType3D::Masked,
            Some("refractive") => SurfaceType3D::Refractive,
            Some("mirror") => SurfaceType3D::Mirror,
            Some("portal") => SurfaceType3D::Portal,
            _ => SurfaceType3D::Opaque,
        };
        let mut custom_params = [Vec4::ZERO; 4];
        if let Some(params) = d.custom_params {
            for (idx, p) in params.into_iter().take(4).enumerate() {
                custom_params[idx] = Vec4::new(p[0], p[1], p[2], p[3]);
            }
        }
        let mut texture_slots = [None; 8];
        if let Some(slots) = d.texture_slots {
            for (idx, slot) in slots.into_iter().take(8).enumerate() {
                texture_slots[idx] = slot;
            }
        }
        Material3D {
            surface_type,
            base_color: d
                .base_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::ONE),
            emissive_color: d
                .emissive_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::ZERO),
            roughness: d.roughness.unwrap_or(0.5),
            metallic: d.metallic.unwrap_or(0.0),
            reflectance: d.reflectance.unwrap_or(0.5),
            refraction_index: d.refraction_index.unwrap_or(1.5),
            refraction_distortion: d.refraction_distortion.unwrap_or(0.05),
            albedo_texture_id: d.albedo_texture_id,
            normal_texture_id: d.normal_texture_id,
            metallic_roughness_texture_id: d.metallic_roughness_texture_id,
            occlusion_texture_id: d.occlusion_texture_id,
            emissive_texture_id: d.emissive_texture_id,
            texture_slots,
            sampler_index: d.sampler_index.unwrap_or(0),
            shader_effect: d.shader_effect,
            custom_params,
            label: None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model3DDesc {
    pub geometry_id: u32,
    pub material_id: u32,
    pub cast_shadow: Option<bool>,
    pub receive_shadow: Option<bool>,
    pub cast_outline: Option<bool>,
    pub outline_color: Option<[f32; 4]>,
    pub bone_offset: Option<u32>,
    pub bone_count: Option<u32>,
    pub active: Option<bool>,
}

impl From<Model3DDesc> for Model3D {
    fn from(d: Model3DDesc) -> Self {
        Model3D {
            geometry_id: d.geometry_id,
            material_id: d.material_id,
            cast_shadow: d.cast_shadow.unwrap_or(true),
            receive_shadow: d.receive_shadow.unwrap_or(true),
            cast_outline: d.cast_outline.unwrap_or(false),
            outline_color: d
                .outline_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(1.0, 1.0, 1.0, 1.0)),
            bone_offset: d.bone_offset.unwrap_or(0),
            bone_count: d.bone_count.unwrap_or(0),
            active: d.active.unwrap_or(true),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstancedModel3DDesc {
    pub geometry_id: u32,
    pub material_id: u32,
    pub capacity: Option<u32>,
    pub cast_shadow: Option<bool>,
    pub receive_shadow: Option<bool>,
    pub active: Option<bool>,
}

impl From<InstancedModel3DDesc> for InstancedModel3D {
    fn from(d: InstancedModel3DDesc) -> Self {
        InstancedModel3D {
            geometry_id: d.geometry_id,
            material_id: d.material_id,
            capacity: d.capacity.unwrap_or(0),
            cast_shadow: d.cast_shadow.unwrap_or(true),
            receive_shadow: d.receive_shadow.unwrap_or(true),
            active: d.active.unwrap_or(true),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Light3DDesc {
    pub kind: Option<String>,
    pub color: Option<[f32; 3]>,
    pub intensity: Option<f32>,
    pub range: Option<f32>,
    #[serde(alias = "innerAngle", alias = "spotInnerAngle")]
    pub spot_inner_angle_rad: Option<f32>,
    #[serde(alias = "outerAngle", alias = "spotOuterAngle")]
    pub spot_outer_angle_rad: Option<f32>,
    pub cast_shadow: Option<bool>,
}

impl From<Light3DDesc> for Light3D {
    fn from(d: Light3DDesc) -> Self {
        let color = d
            .color
            .map(|c| Vec3::new(c[0], c[1], c[2]))
            .unwrap_or(Vec3::ONE);
        let intensity = d.intensity.unwrap_or(1.0);
        let cast_shadow = d.cast_shadow.unwrap_or(false);
        match d.kind.as_deref() {
            Some("point") => Light3D::point(color, intensity, d.range.unwrap_or(10.0), cast_shadow),
            Some("spot") => Light3D::spot(
                color,
                intensity,
                d.range.unwrap_or(10.0),
                d.spot_inner_angle_rad.unwrap_or(0.3),
                d.spot_outer_angle_rad.unwrap_or(0.5),
                cast_shadow,
            ),
            _ => Light3D::directional(color, intensity, cast_shadow),
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkyboxConfig3DDesc {
    pub mode: Option<String>,
    pub sky_color: Option<[f32; 4]>,
    pub horizon_color: Option<[f32; 4]>,
    pub ground_color: Option<[f32; 4]>,
    pub sun_direction: Option<[f32; 4]>,
    pub sun_color: Option<[f32; 4]>,
    pub intensity: Option<f32>,
    pub sun_size: Option<f32>,
    pub rotation: Option<f32>,
    pub texture_id: Option<u32>,
}

impl From<SkyboxConfig3DDesc> for SkyboxConfig3D {
    fn from(d: SkyboxConfig3DDesc) -> Self {
        let mode = match d.mode.as_deref() {
            Some("procedural") => SkyboxMode3D::Procedural,
            Some("cubemap") | Some("panoramic") => SkyboxMode3D::Cubemap,
            _ => SkyboxMode3D::None,
        };
        Self {
            mode,
            sky_color: d
                .sky_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.2, 0.45, 0.8, 1.0)),
            horizon_color: d
                .horizon_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.65, 0.75, 0.85, 1.0)),
            ground_color: d
                .ground_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.08, 0.08, 0.1, 1.0)),
            sun_direction: d
                .sun_direction
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.5, 0.75, 0.4, 0.0)),
            sun_color: d
                .sun_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(1.0, 0.95, 0.8, 2.0)),
            rotation: d.rotation.unwrap_or(0.0),
            texture_id: d.texture_id,
            intensity: d.intensity.unwrap_or(1.0),
            sun_size: d.sun_size.unwrap_or(0.04),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineConfig3DDesc {
    pub enabled: Option<bool>,
    pub width: Option<f32>,
    pub threshold: Option<f32>,
    pub strength: Option<f32>,
}

impl From<OutlineConfig3DDesc> for OutlineConfig3D {
    fn from(d: OutlineConfig3DDesc) -> Self {
        OutlineConfig3D {
            enabled: d.enabled.unwrap_or(true),
            width: d.width.unwrap_or(1.5),
            threshold: d.threshold.unwrap_or(0.2),
            strength: d.strength.unwrap_or(1.0),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsaoConfig3DDesc {
    pub enabled: Option<bool>,
    pub radius: Option<f32>,
    pub bias: Option<f32>,
    pub power: Option<f32>,
    pub intensity: Option<f32>,
    pub blur_radius: Option<u32>,
}

impl From<SsaoConfig3DDesc> for SsaoConfig3D {
    fn from(d: SsaoConfig3DDesc) -> Self {
        Self {
            enabled: d.enabled.unwrap_or(false),
            radius: d.radius.unwrap_or(0.5),
            bias: d.bias.unwrap_or(0.025),
            power: d.power.unwrap_or(1.5),
            intensity: d.intensity.unwrap_or(1.0),
            blur_radius: d.blur_radius.unwrap_or(2),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BloomConfig3DDesc {
    pub enabled: Option<bool>,
    pub threshold: Option<f32>,
    pub knee: Option<f32>,
    pub intensity: Option<f32>,
    pub scatter: Option<f32>,
}

impl From<BloomConfig3DDesc> for BloomConfig3D {
    fn from(d: BloomConfig3DDesc) -> Self {
        Self {
            enabled: d.enabled.unwrap_or(false),
            threshold: d.threshold.unwrap_or(1.0),
            knee: d.knee.unwrap_or(0.5),
            intensity: d.intensity.unwrap_or(0.8),
            scatter: d.scatter.unwrap_or(0.7),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRealm3DDesc {
    pub ambient_color: Option<[f32; 4]>,
    pub clear_color: Option<[f32; 4]>,
    pub fog_color: Option<[f32; 4]>,
    pub fog_mode: Option<String>,
    pub fog_start: Option<f32>,
    pub fog_end: Option<f32>,
    pub fog_density: Option<f32>,
    pub exposure: Option<f32>,
    pub skybox: Option<SkyboxConfig3DDesc>,
    pub outline: Option<OutlineConfig3DDesc>,
    pub ssao: Option<SsaoConfig3DDesc>,
    pub bloom: Option<BloomConfig3DDesc>,
}

impl From<EnvironmentRealm3DDesc> for EnvironmentRealm3D {
    fn from(d: EnvironmentRealm3DDesc) -> Self {
        let fog_mode = match d.fog_mode.as_deref() {
            Some("linear") => FogMode3D::Linear,
            Some("exponential") => FogMode3D::Exponential,
            _ => FogMode3D::None,
        };
        EnvironmentRealm3D {
            ambient_color: d
                .ambient_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.05, 0.05, 0.05, 1.0)),
            clear_color: d
                .clear_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.01, 0.01, 0.02, 1.0)),
            fog_color: d
                .fog_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(Vec4::new(0.5, 0.6, 0.7, 1.0)),
            fog_mode,
            fog_start: d.fog_start.unwrap_or(10.0),
            fog_end: d.fog_end.unwrap_or(100.0),
            fog_density: d.fog_density.unwrap_or(0.02),
            exposure: d.exposure.unwrap_or(1.0),
            skybox: d.skybox.map(Into::into).unwrap_or_default(),
            outline: d.outline.map(Into::into).unwrap_or_default(),
            ssao: d.ssao.map(Into::into).unwrap_or_default(),
            bloom: d.bloom.map(Into::into).unwrap_or_default(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct EmissionShape3DDesc {
    #[serde(rename = "type")]
    pub kind: String,
    pub radius: Option<f32>,
    pub extents: Option<[f32; 3]>,
    pub angle_rad: Option<f32>,
    pub height: Option<f32>,
}

impl From<EmissionShape3DDesc> for EmissionShape3D {
    fn from(d: EmissionShape3DDesc) -> Self {
        match d.kind.to_lowercase().as_str() {
            "sphere" => EmissionShape3D::Sphere {
                radius: d.radius.unwrap_or(1.0),
            },
            "box" => EmissionShape3D::Box {
                extents: d.extents.unwrap_or([1.0, 1.0, 1.0]),
            },
            "cone" => EmissionShape3D::Cone {
                angle_rad: d.angle_rad.unwrap_or(FRAC_PI_4),
                radius: d.radius.unwrap_or(1.0),
                height: d.height.unwrap_or(1.0),
            },
            "cylinder" => EmissionShape3D::Cylinder {
                radius: d.radius.unwrap_or(1.0),
                height: d.height.unwrap_or(1.0),
            },
            _ => EmissionShape3D::Point,
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleEmitter3DDesc {
    pub label: Option<String>,
    pub material_id: Option<u32>,
    pub max_particles: Option<u32>,
    pub spawn_rate: Option<f32>,
    pub lifetime_range: Option<[f32; 2]>,
    pub speed_range: Option<[f32; 2]>,
    pub direction: Option<[f32; 3]>,
    pub spread_angle_rad: Option<f32>,
    pub gravity: Option<[f32; 3]>,
    pub drag: Option<f32>,
    pub start_size_range: Option<[f32; 2]>,
    pub end_size_range: Option<[f32; 2]>,
    pub start_color: Option<[f32; 4]>,
    pub end_color: Option<[f32; 4]>,
    pub rotation_speed_range: Option<[f32; 2]>,
    pub uv_rect: Option<[f32; 4]>,
    pub emission_shape: Option<EmissionShape3DDesc>,
    #[serde(default = "default_true")]
    pub active: bool,
}

impl From<ParticleEmitter3DDesc> for ParticleEmitter3D {
    fn from(d: ParticleEmitter3DDesc) -> Self {
        let def = ParticleEmitter3D::default();
        ParticleEmitter3D {
            label: d.label,
            material_id: d.material_id,
            max_particles: d.max_particles.unwrap_or(def.max_particles),
            spawn_rate: d.spawn_rate.unwrap_or(def.spawn_rate),
            lifetime_range: d.lifetime_range.unwrap_or(def.lifetime_range),
            speed_range: d.speed_range.unwrap_or(def.speed_range),
            direction: d
                .direction
                .map(|v| Vec3::new(v[0], v[1], v[2]))
                .unwrap_or(def.direction),
            spread_angle_rad: d.spread_angle_rad.unwrap_or(def.spread_angle_rad),
            gravity: d
                .gravity
                .map(|g| Vec3::new(g[0], g[1], g[2]))
                .unwrap_or(def.gravity),
            drag: d.drag.unwrap_or(def.drag),
            start_size_range: d.start_size_range.unwrap_or(def.start_size_range),
            end_size_range: d.end_size_range.unwrap_or(def.end_size_range),
            start_color: d
                .start_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(def.start_color),
            end_color: d
                .end_color
                .map(|c| Vec4::new(c[0], c[1], c[2], c[3]))
                .unwrap_or(def.end_color),
            rotation_speed_range: d.rotation_speed_range.unwrap_or(def.rotation_speed_range),
            uv_rect: d
                .uv_rect
                .map(|r| Vec4::new(r[0], r[1], r[2], r[3]))
                .unwrap_or(def.uv_rect),
            emission_shape: d
                .emission_shape
                .map(Into::into)
                .unwrap_or(EmissionShape3D::Point),
            active: d.active,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Portal3DDesc {
    pub model_id: u32,
    pub exit_transform: Option<Transform3DDesc>,
    pub active: Option<bool>,
    pub resolution_scale: Option<f32>,
}

impl From<Portal3DDesc> for galfus_realm_3d_resources::portal::Portal3D {
    fn from(d: Portal3DDesc) -> Self {
        Self {
            model_id: d.model_id,
            exit_transform: d.exit_transform.map(Into::into),
            active: d.active.unwrap_or(true),
            resolution_scale: d.resolution_scale.unwrap_or(1.0),
        }
    }
}
