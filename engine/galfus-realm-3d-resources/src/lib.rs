//! Galfus Realm 3D Resources
//!
//! Core 3D data types, GPU Pod/Zeroable uniforms, meshes, and components
//! designed for use within `Realm3DContext` and forward/deferred shading.

pub mod aabb;
pub mod camera;
pub mod environment;
pub mod frustum;
pub mod geometry;
pub mod light;
pub mod material;
pub mod model;
pub mod particle;
pub mod portal;
pub mod primitives;
pub mod transform;

pub use aabb::Aabb;
pub use camera::{Camera3D, Camera3DUniform, CameraKind3D};
pub use environment::{BloomConfig3D, Environment3DUniform, EnvironmentRealm3D, FogMode3D};
pub use frustum::Frustum;
pub use geometry::{Geometry3D, Vertex3D};
pub use light::{Light3D, Light3DUniform, LightKind3D};
pub use material::{Material3D, Material3DUniform, SurfaceType3D, TextureSampler3D};
pub use model::{InstanceData3D, InstancedModel3D, Model3D, Model3DUniform};
pub use particle::{
    EmissionShape3D, Particle3D, Particle3DInstance, ParticleEmitter3D, ParticleEmitterState3D,
};
pub use portal::Portal3D;
pub use transform::Transform3D;
