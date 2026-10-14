//! Galfus Realm 3D Resources
//!
//! Core 3D data types, GPU Pod/Zeroable uniforms, meshes, and components
//! designed for use within `Realm3DContext` and forward/deferred shading.

pub mod camera;
pub mod environment;
pub mod geometry;
pub mod light;
pub mod material;
pub mod model;
pub mod transform;

pub use camera::{Camera3D, Camera3DUniform, CameraKind3D};
pub use environment::{Environment3DUniform, EnvironmentRealm3D, FogMode3D};
pub use geometry::{Geometry3D, Vertex3D};
pub use light::{Light3D, Light3DUniform, LightKind3D};
pub use material::{Material3D, Material3DUniform, SurfaceType3D};
pub use model::{Model3D, Model3DUniform};
pub use transform::Transform3D;
