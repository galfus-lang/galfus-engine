use std::os::raw::c_char;

use galfus_realm_3d::Realm3DContext;
use galfus_realm_3d_resources::camera::{Camera3D, CameraKind3D};
use galfus_realm_3d_resources::environment::{EnvironmentRealm3D, FogMode3D, OutlineConfig3D};
use galfus_realm_3d_resources::geometry::{Geometry3D, Vertex3D};
use galfus_realm_3d_resources::light::Light3D;
use galfus_realm_3d_resources::material::{Material3D, SurfaceType3D};
use galfus_realm_3d_resources::model::Model3D;
use galfus_realm_3d_resources::transform::Transform3D;
use glam::{Quat, Vec3, Vec4};
use serde::Deserialize;

use crate::ffi::{from_c_str, set_last_error};
use crate::state::with_multiverse_mut;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Transform3DDesc {
    position: Option<[f32; 3]>,
    rotation: Option<[f32; 4]>,
    scale: Option<[f32; 3]>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Camera3DDesc {
    kind: Option<String>,
    fov_y: Option<f32>,
    near: Option<f32>,
    far: Option<f32>,
    ortho_scale: Option<f32>,
    camera_slot: Option<u32>,
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
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Vertex3DDesc {
    position: [f32; 3],
    normal: [f32; 3],
    uv: [f32; 2],
    tangent: Option<[f32; 4]>,
    joints: Option<[u32; 4]>,
    weights: Option<[f32; 4]>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Geometry3DDesc {
    primitive: Option<String>,
    size: Option<f32>,
    radius: Option<f32>,
    subdivisions: Option<u32>,
    vertices: Option<Vec<Vertex3DDesc>>,
    indices: Option<Vec<u32>>,
}

impl From<Geometry3DDesc> for Geometry3D {
    fn from(d: Geometry3DDesc) -> Self {
        match d.primitive.as_deref() {
            Some("cube") => Geometry3D::cube(d.size.unwrap_or(1.0)),
            Some("plane") => Geometry3D::plane(d.size.unwrap_or(1.0), d.size.unwrap_or(1.0)),
            Some("sphere") => Geometry3D::sphere(
                d.radius.unwrap_or(1.0),
                d.subdivisions.unwrap_or(32),
                d.subdivisions.unwrap_or(16),
            ),
            _ => {
                let vertices = d
                    .vertices
                    .unwrap_or_default()
                    .into_iter()
                    .map(|v| Vertex3D {
                        position: v.position,
                        normal: v.normal,
                        uv: v.uv,
                        tangent: v.tangent.unwrap_or([1.0, 0.0, 0.0, 1.0]),
                        joints: v.joints.unwrap_or([0, 0, 0, 0]),
                        weights: v.weights.unwrap_or([1.0, 0.0, 0.0, 0.0]),
                    })
                    .collect();
                let indices = d.indices.unwrap_or_default();
                Geometry3D::new(vertices, indices, None)
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Material3DDesc {
    surface_type: Option<String>,
    base_color: Option<[f32; 4]>,
    emissive_color: Option<[f32; 4]>,
    roughness: Option<f32>,
    metallic: Option<f32>,
    reflectance: Option<f32>,
    albedo_texture_id: Option<u32>,
    normal_texture_id: Option<u32>,
    shader_effect: Option<String>,
    custom_params: Option<Vec<[f32; 4]>>,
}

impl From<Material3DDesc> for Material3D {
    fn from(d: Material3DDesc) -> Self {
        let surface_type = match d.surface_type.as_deref() {
            Some("transparent") => SurfaceType3D::Transparent,
            Some("masked") => SurfaceType3D::Masked,
            _ => SurfaceType3D::Opaque,
        };
        let mut custom_params = [Vec4::ZERO; 4];
        if let Some(params) = d.custom_params {
            for (idx, p) in params.into_iter().take(4).enumerate() {
                custom_params[idx] = Vec4::new(p[0], p[1], p[2], p[3]);
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
            albedo_texture_id: d.albedo_texture_id,
            normal_texture_id: d.normal_texture_id,
            metallic_roughness_texture_id: None,
            emissive_texture_id: None,
            shader_effect: d.shader_effect,
            custom_params,
            label: None,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Model3DDesc {
    geometry_id: u32,
    material_id: u32,
    cast_shadow: Option<bool>,
    receive_shadow: Option<bool>,
    cast_outline: Option<bool>,
    outline_color: Option<[f32; 4]>,
    bone_offset: Option<u32>,
    bone_count: Option<u32>,
    active: Option<bool>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Light3DDesc {
    kind: Option<String>,
    color: Option<[f32; 3]>,
    intensity: Option<f32>,
    range: Option<f32>,
    #[serde(alias = "innerAngle", alias = "spotInnerAngle")]
    spot_inner_angle_rad: Option<f32>,
    #[serde(alias = "outerAngle", alias = "spotOuterAngle")]
    spot_outer_angle_rad: Option<f32>,
    cast_shadow: Option<bool>,
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

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SkyboxConfig3DDesc {
    mode: Option<String>,
    sky_color: Option<[f32; 4]>,
    horizon_color: Option<[f32; 4]>,
    ground_color: Option<[f32; 4]>,
    sun_direction: Option<[f32; 4]>,
    sun_color: Option<[f32; 4]>,
    intensity: Option<f32>,
    sun_size: Option<f32>,
}

impl From<SkyboxConfig3DDesc> for galfus_realm_3d_resources::environment::SkyboxConfig3D {
    fn from(d: SkyboxConfig3DDesc) -> Self {
        use galfus_realm_3d_resources::environment::SkyboxMode3D;
        let mode = match d.mode.as_deref() {
            Some("procedural") => SkyboxMode3D::Procedural,
            Some("cubemap") => SkyboxMode3D::Cubemap,
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
            intensity: d.intensity.unwrap_or(1.0),
            sun_size: d.sun_size.unwrap_or(0.04),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutlineConfig3DDesc {
    enabled: Option<bool>,
    width: Option<f32>,
    threshold: Option<f32>,
    strength: Option<f32>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentRealm3DDesc {
    ambient_color: Option<[f32; 4]>,
    clear_color: Option<[f32; 4]>,
    fog_color: Option<[f32; 4]>,
    fog_mode: Option<String>,
    fog_start: Option<f32>,
    fog_end: Option<f32>,
    fog_density: Option<f32>,
    exposure: Option<f32>,
    skybox: Option<SkyboxConfig3DDesc>,
    outline: Option<OutlineConfig3DDesc>,
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
        }
    }
}

/// Creates and registers a new 3D Realm in the Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create(realm_id: u32) -> i32 {
    let realm = Box::new(Realm3DContext::new(realm_id));
    match with_multiverse_mut(|mv| mv.register_realm(realm).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys and unregisters a 3D Realm from the Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.unregister_realm(realm_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D Camera in the 3D Realm.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_camera(
    realm_id: u32,
    camera_id: u32,
    camera_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let cam_desc: Camera3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(camera_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Camera3DDesc: {e}"));
                return -1;
            }
        };

    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_camera(camera_id, cam_desc.into(), trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Camera in the 3D Realm.
///
/// # Safety
/// `transform_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_camera_transform(
    realm_id: u32,
    camera_id: u32,
    transform_json: *const c_char,
) -> i32 {
    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_camera_transform(camera_id, trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D Geometry in the 3D Realm.
///
/// # Safety
/// `geometry_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_geometry(
    realm_id: u32,
    geometry_id: u32,
    geometry_json: *const c_char,
) -> i32 {
    let geom_desc: Geometry3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(geometry_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Geometry3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_geometry(geometry_id, geom_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D Material in the 3D Realm.
///
/// # Safety
/// `material_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_material(
    realm_id: u32,
    material_id: u32,
    material_json: *const c_char,
) -> i32 {
    let mat_desc: Material3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(material_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Material3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_material(material_id, mat_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D Model in the 3D Realm.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_model(
    realm_id: u32,
    model_id: u32,
    model_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let model_desc: Model3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(model_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Model3DDesc: {e}"));
                return -1;
            }
        };

    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_model(model_id, model_desc.into(), trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Model in the 3D Realm.
///
/// # Safety
/// `transform_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_model_transform(
    realm_id: u32,
    model_id: u32,
    transform_json: *const c_char,
) -> i32 {
    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_model_transform(model_id, trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D Light in the 3D Realm.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_light(
    realm_id: u32,
    light_id: u32,
    light_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let light_desc: Light3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(light_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Light3DDesc: {e}"));
                return -1;
            }
        };

    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_light(light_id, light_desc.into(), trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Light in the 3D Realm.
///
/// # Safety
/// `transform_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_light_transform(
    realm_id: u32,
    light_id: u32,
    transform_json: *const c_char,
) -> i32 {
    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_light_transform(light_id, trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the atmospheric Environment in the 3D Realm.
///
/// # Safety
/// `environment_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_environment(
    realm_id: u32,
    environment_json: *const c_char,
) -> i32 {
    let env_desc: EnvironmentRealm3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(environment_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid EnvironmentRealm3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm.set_environment(env_desc.into());
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Uploads bone transform matrices (array of 16-element floats) for skeletal skinning.
///
/// # Safety
/// `matrices_json` must be a valid, null-terminated UTF-8 string representing `number[]`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_update_bones(
    realm_id: u32,
    model_id: u32,
    matrices_json: *const c_char,
) -> i32 {
    let floats: Vec<f32> = match serde_json::from_str(match unsafe { from_c_str(matrices_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    }) {
        Ok(f) => f,
        Err(e) => {
            set_last_error(&format!("Invalid matrices JSON: {e}"));
            return -1;
        }
    };

    if !floats.len().is_multiple_of(16) {
        set_last_error("Matrices array length must be a multiple of 16");
        return -1;
    }

    let matrices: Vec<glam::Mat4> = floats
        .as_chunks::<16>()
        .0
        .iter()
        .map(glam::Mat4::from_cols_array)
        .collect();

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .update_model_bones(model_id, &matrices)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
