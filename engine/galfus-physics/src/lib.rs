//! # Galfus Physics
//!
//! Autonomous 2D and 3D native physics simulation engine powered by Rapier.

pub(crate) mod events;
pub mod types;
pub mod world_2d;
pub mod world_3d;

#[cfg(test)]
mod tests;

pub use types::*;
pub use world_2d::PhysicsWorld2D;
pub use world_3d::PhysicsWorld3D;
