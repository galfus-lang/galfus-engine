#![allow(clippy::missing_safety_doc)]

use std::ffi::c_char;

use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::{
    Camera2D, Light2D, Material2D, Shadow2DConfig, Shape2D, ShapeKind2D, Sprite2D, SurfaceType2D,
    Transform2D,
};
use glam::{Vec2, Vec3, Vec4};
use serde::Deserialize;

use crate::ffi::{from_c_str, set_last_error};
use crate::state::with_multiverse_mut;

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
fn default_true() -> bool {
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

/// Creates and registers a new 2D Realm in the Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_create(realm_id: u32) -> i32 {
    let realm = Box::new(Realm2DContext::new(realm_id));
    match with_multiverse_mut(|mv| mv.register_realm(realm).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys and unregisters a 2D Realm from the Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.unregister_realm(realm_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

unsafe fn parse_transform_2d(transform_json: *const c_char) -> Result<Transform2D, String> {
    if transform_json.is_null() {
        return Err("Transform JSON pointer is null".to_string());
    }
    let s = unsafe { from_c_str(transform_json) }.map_err(|e| e.to_string())?;
    let d: Transform2DDesc =
        serde_json::from_str(s).map_err(|e| format!("Invalid Transform2DDesc: {e}"))?;
    Ok(d.into())
}

/// Registers or updates a 2D Camera in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_camera(
    realm_id: u32,
    camera_id: u32,
    camera_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let cam_desc: Camera2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(camera_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Camera2DDesc: {e}"));
                return -1;
            }
        };
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_camera(camera_id, cam_desc.into(), trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Camera in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_camera_transform(
    realm_id: u32,
    camera_id: u32,
    transform_json: *const c_char,
) -> i32 {
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_camera_transform(camera_id, trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a Material in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_material(
    realm_id: u32,
    material_id: u32,
    material_json: *const c_char,
) -> i32 {
    let mat_desc: Material2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(material_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Material2DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_material(material_id, mat_desc.into());
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a Sprite in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_sprite(
    realm_id: u32,
    sprite_id: u32,
    sprite_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let sprite_desc: Sprite2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(sprite_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Sprite2DDesc: {e}"));
                return -1;
            }
        };
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_sprite(sprite_id, sprite_desc.into(), trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Sprite in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_sprite_transform(
    realm_id: u32,
    sprite_id: u32,
    transform_json: *const c_char,
) -> i32 {
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_sprite_transform(sprite_id, trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a Vector Shape in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_shape(
    realm_id: u32,
    shape_id: u32,
    shape_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let shape_desc: Shape2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(shape_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Shape2DDesc: {e}"));
                return -1;
            }
        };
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_shape(shape_id, shape_desc.into(), trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Shape in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_shape_transform(
    realm_id: u32,
    shape_id: u32,
    transform_json: *const c_char,
) -> i32 {
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_shape_transform(shape_id, trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 2D Light in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_light(
    realm_id: u32,
    light_id: u32,
    light_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let light_desc: Light2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(light_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Light2DDesc: {e}"));
                return -1;
            }
        };
    let mut light: Light2D = light_desc.into();
    if let Ok(trans) = unsafe { parse_transform_2d(transform_json) } {
        light.position = trans.position;
        light.z = trans.z_layer as f32;
    }

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_light(light_id, light);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Light in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_light_transform(
    realm_id: u32,
    light_id: u32,
    transform_json: *const c_char,
) -> i32 {
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_light_transform(light_id, trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Configures global 2D soft shadow parameters.
///
/// # Safety
/// `config_json` must be a valid, null-terminated C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_shadow_config(
    realm_id: u32,
    config_json: *const c_char,
) -> i32 {
    let cfg_desc: Shadow2DConfigDesc =
        match serde_json::from_str(match unsafe { from_c_str(config_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Shadow2DConfigDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_shadow_config(cfg_desc.into());
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
