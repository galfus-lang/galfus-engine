//! Core Realm3DContext managing 3D entities, GPU buffers, and rendering with Reverse-Z.

use std::collections::BTreeMap;

use galfus_realm_3d_resources::camera::Camera3D;
use galfus_realm_3d_resources::environment::EnvironmentRealm3D;
use galfus_realm_3d_resources::geometry::Geometry3D;
use galfus_realm_3d_resources::light::Light3D;
use galfus_realm_3d_resources::material::Material3D;
use galfus_realm_3d_resources::particle::{ParticleEmitter3D, ParticleEmitterState3D};
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::RealmError;
use glam::UVec2;

use crate::pipeline::Pipeline3D;
use crate::shadow::{ShadowMap3D, ShadowPipeline3D};
use crate::types::{GpuMeshBuffers, GpuModelEntry, SceneGpuBuffers};

#[inline]
pub(crate) fn not_found(realm_id: u32, kind: &str, id: u32) -> RealmError {
    RealmError::ResourceNotFound(realm_id, format!("{kind} {id} not found"))
}

/// Autonomous 3D Realm managing 3D scenes, entities, Reverse-Z rendering, and lighting.
pub struct Realm3DContext {
    pub id: u32,
    pub cameras: BTreeMap<u32, (Camera3D, Transform3D)>,
    pub materials: BTreeMap<u32, (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>)>,
    pub geometries: BTreeMap<u32, (Geometry3D, Option<GpuMeshBuffers>)>,
    pub models: BTreeMap<u32, GpuModelEntry>,
    pub lights: BTreeMap<u32, (Light3D, Transform3D)>,
    pub environment: EnvironmentRealm3D,

    pub(crate) pipeline: Option<Pipeline3D>,
    pub(crate) shadow_pipeline: Option<ShadowPipeline3D>,
    pub(crate) shadow_map: Option<ShadowMap3D>,
    pub(crate) skybox_pipeline: Option<crate::skybox::SkyboxPipeline3D>,
    pub(crate) post_pipelines: crate::postprocess::PostProcessPipelines,
    pub(crate) light_cull_pipeline: Option<crate::light_cull::LightCullingPipeline3D>,
    pub(crate) gizmos: crate::gizmo::GizmoSystem3D,
    pub emitters: BTreeMap<u32, (ParticleEmitter3D, Transform3D, ParticleEmitterState3D)>,
    pub portals: BTreeMap<u32, galfus_realm_3d_resources::portal::Portal3D>,
    pub(crate) particle_renderer: Option<crate::particle::ParticleRenderer3D>,
    pub(crate) refraction_pipeline: Option<crate::refraction::RefractionPipeline3D>,
    pub(crate) portal_pipeline: Option<crate::portal::PortalPipeline3D>,
    pub(crate) scene_buffers: Option<SceneGpuBuffers>,
    pub(crate) depth_texture: Option<(wgpu::Texture, wgpu::TextureView, UVec2)>,
    pub(crate) model_bones: BTreeMap<u32, Vec<glam::Mat4>>,
    pub(crate) bones: Vec<glam::Mat4>,
    pub(crate) total_time: f32,
    pub dirty: bool,
}

impl Realm3DContext {
    /// Creates a new `Realm3DContext` with a logical host ID.
    pub fn new(id: u32) -> Self {
        Self {
            id,
            cameras: BTreeMap::new(),
            materials: BTreeMap::new(),
            geometries: BTreeMap::new(),
            models: BTreeMap::new(),
            lights: BTreeMap::new(),
            environment: EnvironmentRealm3D::default(),
            pipeline: None,
            shadow_pipeline: None,
            shadow_map: None,
            skybox_pipeline: None,
            post_pipelines: crate::postprocess::PostProcessPipelines::new(),
            light_cull_pipeline: None,
            gizmos: crate::gizmo::GizmoSystem3D::new(),
            emitters: BTreeMap::new(),
            portals: BTreeMap::new(),
            particle_renderer: None,
            refraction_pipeline: None,
            portal_pipeline: None,
            scene_buffers: None,
            depth_texture: None,
            model_bones: BTreeMap::new(),
            bones: Vec::new(),
            total_time: 0.0,
            dirty: true,
        }
    }
}
