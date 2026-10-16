use galfus_realm_2d_resources::{
    Camera2D, EmissionShape2D, Light2D, Material2D, ParticleEmitter2D, Shadow2DConfig, Shape2D,
    ShapeKind2D, Sprite2D, SurfaceType2D, Transform2D,
};
use glam::{Vec2, Vec3, Vec4};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform2DDesc {
    pub position: [f32; 2],
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_scale_2d")]
    pub scale: [f32; 2],
    #[serde(default)]
    pub z_layer: i32,
}

fn default_scale_2d() -> [f32; 2] {
    [1.0, 1.0]
}

impl From<Transform2DDesc> for Transform2D {
    fn from(d: Transform2DDesc) -> Self {
        Transform2D {
            position: Vec2::new(d.position[0], d.position[1]),
            rotation: d.rotation,
            scale: Vec2::new(d.scale[0], d.scale[1]),
            z_layer: d.z_layer,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camera2DDesc {
    pub ortho_scale: f32,
    #[serde(default = "default_near_2d")]
    pub near: f32,
    #[serde(default = "default_far_2d")]
    pub far: f32,
    #[serde(default = "default_layer_mask_2d")]
    pub layer_mask: u32,
    #[serde(default)]
    pub order: i32,
    #[serde(default)]
    pub camera_slot: u32,
    #[serde(default = "default_true")]
    pub active: bool,
}

fn default_near_2d() -> f32 {
    -1000.0
}
fn default_far_2d() -> f32 {
    1000.0
}
fn default_layer_mask_2d() -> u32 {
    u32::MAX
}
pub(crate) fn default_true() -> bool {
    true
}

impl From<Camera2DDesc> for Camera2D {
    fn from(d: Camera2DDesc) -> Self {
        Camera2D {
            ortho_scale: d.ortho_scale,
            near: d.near,
            far: d.far,
            layer_mask: d.layer_mask,
            order: d.order,
            camera_slot: d.camera_slot,
            active: d.active,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Material2DDesc {
    #[serde(default = "default_color_2d")]
    pub base_color: [f32; 4],
    #[serde(default = "default_surface_type_2d")]
    pub surface_type: String,
    pub texture_id: Option<u32>,
    pub alpha_cutoff: Option<f32>,
    pub shader_effect: Option<String>,
    pub custom_params: Option<[[f32; 4]; 4]>,
}

fn default_color_2d() -> [f32; 4] {
    [1.0, 1.0, 1.0, 1.0]
}
fn default_surface_type_2d() -> String {
    "transparent".to_string()
}

impl From<Material2DDesc> for Material2D {
    fn from(d: Material2DDesc) -> Self {
        let surface_type = match d.surface_type.to_lowercase().as_str() {
            "opaque" => SurfaceType2D::Opaque,
            "masked" => SurfaceType2D::Masked,
            "additive" => SurfaceType2D::Additive,
            _ => SurfaceType2D::Transparent,
        };
        let custom_params = match d.custom_params {
            Some(p) => [
                Vec4::from_slice(&p[0]),
                Vec4::from_slice(&p[1]),
                Vec4::from_slice(&p[2]),
                Vec4::from_slice(&p[3]),
            ],
            None => [Vec4::ZERO; 4],
        };
        Material2D {
            label: None,
            surface_type,
            base_color: Vec4::from_slice(&d.base_color),
            texture_id: d.texture_id,
            alpha_cutoff: d.alpha_cutoff.unwrap_or(0.5),
            shader_effect: d.shader_effect,
            custom_params,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sprite2DDesc {
    pub dimensions: [f32; 2],
    pub pivot: Option<[f32; 2]>,
    pub uv_rect: Option<[f32; 4]>,
    pub material_id: Option<u32>,
    #[serde(default = "default_true")]
    pub cast_shadow: bool,
    #[serde(default = "default_true")]
    pub receive_shadow: bool,
    #[serde(default)]
    pub occluder_only: bool,
    pub shadow_height: Option<f32>,
    pub shadow_layer_mask: Option<u32>,
    pub height_range: Option<[f32; 2]>,
}

impl From<Sprite2DDesc> for Sprite2D {
    fn from(d: Sprite2DDesc) -> Self {
        Sprite2D {
            label: None,
            dimensions: Vec2::new(d.dimensions[0], d.dimensions[1]),
            pivot: d
                .pivot
                .map(|p| Vec2::new(p[0], p[1]))
                .unwrap_or(Vec2::new(0.5, 0.5)),
            uv_rect: d
                .uv_rect
                .map(|u| Vec4::from_slice(&u))
                .unwrap_or(Vec4::new(0.0, 0.0, 1.0, 1.0)),
            material_id: d.material_id,
            cast_shadow: d.cast_shadow,
            receive_shadow: d.receive_shadow,
            occluder_only: d.occluder_only,
            shadow_height: d.shadow_height.unwrap_or(1.0),
            shadow_layer_mask: d.shadow_layer_mask.unwrap_or(u32::MAX),
            height_range: d.height_range,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shape2DDesc {
    pub kind: String,
    pub size: Option<[f32; 2]>,
    pub radius: Option<f32>,
    pub segments: Option<u32>,
    pub vertices: Option<Vec<[f32; 2]>>,
    pub material_id: Option<u32>,
    #[serde(default = "default_true")]
    pub cast_shadow: bool,
    #[serde(default = "default_true")]
    pub receive_shadow: bool,
    #[serde(default)]
    pub occluder_only: bool,
    pub shadow_height: Option<f32>,
    pub shadow_layer_mask: Option<u32>,
    pub height_range: Option<[f32; 2]>,
}

impl From<Shape2DDesc> for Shape2D {
    fn from(d: Shape2DDesc) -> Self {
        let kind = match d.kind.to_lowercase().as_str() {
            "circle" => ShapeKind2D::Circle {
                radius: d.radius.unwrap_or(1.0),
                segments: d.segments.unwrap_or(24),
            },
            "polygon" => ShapeKind2D::Polygon {
                vertices: d
                    .vertices
                    .unwrap_or_default()
                    .into_iter()
                    .map(|v| Vec2::new(v[0], v[1]))
                    .collect(),
            },
            _ => ShapeKind2D::Rectangle {
                size: d.size.map(|s| Vec2::new(s[0], s[1])).unwrap_or(Vec2::ONE),
            },
        };

        Shape2D {
            label: None,
            kind,
            material_id: d.material_id,
            cast_shadow: d.cast_shadow,
            receive_shadow: d.receive_shadow,
            occluder_only: d.occluder_only,
            shadow_height: d.shadow_height.unwrap_or(1.0),
            shadow_layer_mask: d.shadow_layer_mask.unwrap_or(u32::MAX),
            height_range: d.height_range,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Light2DDesc {
    #[serde(default)]
    pub position: Option<[f32; 2]>,
    #[serde(default)]
    pub z: Option<f32>,
    pub color: [f32; 3],
    pub intensity: f32,
    pub range: f32,
    pub light_radius: Option<f32>,
    pub shadow_layer_mask: Option<u32>,
    #[serde(default = "default_true")]
    pub cast_shadow: bool,
    #[serde(default = "default_true")]
    pub active: bool,
}

impl From<Light2DDesc> for Light2D {
    fn from(d: Light2DDesc) -> Self {
        Light2D {
            label: None,
            position: d
                .position
                .map(|p| Vec2::new(p[0], p[1]))
                .unwrap_or(Vec2::ZERO),
            z: d.z.unwrap_or(0.0),
            color: Vec3::new(d.color[0], d.color[1], d.color[2]),
            intensity: d.intensity,
            range: d.range,
            light_radius: d.light_radius.unwrap_or(0.25),
            shadow_layer_mask: d.shadow_layer_mask.unwrap_or(u32::MAX),
            cast_shadow: d.cast_shadow,
            active: d.active,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shadow2DConfigDesc {
    pub shadow_contact_offset: Option<f32>,
    pub ambient: Option<f32>,
    pub light_radius: Option<f32>,
    pub angular_resolution: Option<u32>,
}

impl From<Shadow2DConfigDesc> for Shadow2DConfig {
    fn from(d: Shadow2DConfigDesc) -> Self {
        let mut cfg = Shadow2DConfig::default();
        if let Some(v) = d.shadow_contact_offset {
            cfg.shadow_contact_offset = v;
        }
        if let Some(v) = d.ambient {
            cfg.ambient = v;
        }
        if let Some(v) = d.light_radius {
            cfg.light_radius = v;
        }
        if let Some(v) = d.angular_resolution {
            cfg.angular_resolution = v;
        }
        cfg.sanitized()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmissionShape2DDesc {
    #[serde(rename = "type")]
    pub kind: String,
    pub radius: Option<f32>,
    pub extents: Option<[f32; 2]>,
    pub direction: Option<[f32; 2]>,
    pub length: Option<f32>,
}

impl From<EmissionShape2DDesc> for EmissionShape2D {
    fn from(d: EmissionShape2DDesc) -> Self {
        match d.kind.to_lowercase().as_str() {
            "circle" => EmissionShape2D::Circle {
                radius: d.radius.unwrap_or(1.0),
            },
            "rectangle" => EmissionShape2D::Rectangle {
                extents: d.extents.unwrap_or([1.0, 1.0]),
            },
            "line" => EmissionShape2D::Line {
                direction: d.direction.unwrap_or([1.0, 0.0]),
                length: d.length.unwrap_or(1.0),
            },
            _ => EmissionShape2D::Point,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleEmitter2DDesc {
    pub material_id: Option<u32>,
    pub max_particles: Option<u32>,
    pub spawn_rate: Option<f32>,
    pub lifetime_range: Option<[f32; 2]>,
    pub speed_range: Option<[f32; 2]>,
    pub direction: Option<[f32; 2]>,
    pub spread_angle_rad: Option<f32>,
    pub gravity: Option<[f32; 2]>,
    pub drag: Option<f32>,
    pub start_size_range: Option<[f32; 2]>,
    pub end_size_range: Option<[f32; 2]>,
    pub start_color: Option<[f32; 4]>,
    pub end_color: Option<[f32; 4]>,
    pub rotation_speed_range: Option<[f32; 2]>,
    pub uv_rect: Option<[f32; 4]>,
    pub emission_shape: Option<EmissionShape2DDesc>,
    pub z_layer: Option<i32>,
    #[serde(default)]
    pub cast_shadow: bool,
    #[serde(default)]
    pub receive_shadow: bool,
    #[serde(default = "default_true")]
    pub active: bool,
}

impl From<ParticleEmitter2DDesc> for ParticleEmitter2D {
    fn from(d: ParticleEmitter2DDesc) -> Self {
        let def = ParticleEmitter2D::default();
        ParticleEmitter2D {
            label: None,
            material_id: d.material_id,
            max_particles: d.max_particles.unwrap_or(def.max_particles),
            spawn_rate: d.spawn_rate.unwrap_or(def.spawn_rate),
            lifetime_range: d.lifetime_range.unwrap_or(def.lifetime_range),
            speed_range: d.speed_range.unwrap_or(def.speed_range),
            direction: d
                .direction
                .map(|v| Vec2::new(v[0], v[1]))
                .unwrap_or(def.direction),
            spread_angle_rad: d.spread_angle_rad.unwrap_or(def.spread_angle_rad),
            gravity: d
                .gravity
                .map(|v| Vec2::new(v[0], v[1]))
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
                .map(EmissionShape2D::from)
                .unwrap_or(def.emission_shape),
            z_layer: d.z_layer.unwrap_or(def.z_layer),
            cast_shadow: d.cast_shadow,
            receive_shadow: d.receive_shadow,
            active: d.active,
        }
    }
}
