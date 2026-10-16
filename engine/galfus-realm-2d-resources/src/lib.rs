//! Galfus Realm 2D Resources
//!
//! Provides the core data types and GPU buffer representations for 2D rendering,
//! including transforms, orthographic cameras, materials, sprites, shapes, 2D dynamic lights,
//! and polar soft shadow configurations.

pub mod camera;
pub mod light;
pub mod material;
pub mod particle;
pub mod shadow;
pub mod shape;
pub mod sprite;
pub mod transform;

pub use camera::{Camera2D, Camera2DUniform};
pub use light::{Light2D, Light2DUniform};
pub use material::{Material2D, Material2DUniform, SurfaceType2D};
pub use particle::{
    EmissionShape2D, Particle2D, ParticleEmitter2D, ParticleEmitterState2D, compute_particle_matrix,
};
pub use shadow::{Occluder2D, OccluderEdge2D, OccluderSilhouette2D, Shadow2DConfig};
pub use shape::{Shape2D, ShapeKind2D};
pub use sprite::Sprite2D;
pub use transform::Transform2D;
