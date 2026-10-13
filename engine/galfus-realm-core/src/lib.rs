//! # Galfus Realm Core
//!
//! Foundational contracts, types, and error definitions for Realms.
//!
//! A Realm is an autonomous graphics-producing unit (e.g. 2D scene, 3D world).
//! This crate defines the abstract interface that the Multiverse uses to
//! coordinate execution without depending on concrete implementations.

pub mod error;
pub mod realm;
pub mod types;

pub use error::{RealmError, RealmResult};
pub use realm::Realm;
pub use types::{RealmInvocationContext, RealmKind, RealmPrepareContext};
