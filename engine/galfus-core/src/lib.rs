//! # Galfus Core
//!
//! Foundational, domain-neutral machinery for the Galfus Engine.
//!
//! This crate provides:
//! - **Generational Handles**: Safe slot indexing with stale detection and namespace isolation ([`handle::Handle`], [`handle::GenerationalPool`]).
//! - **Host Logical ID Policy**: Explicit reservation rules rejecting host IDs in the upper 65535 range ([`id::validate_host_logical_id`], [`id::LogicalId`]).
//! - **Deterministic Content IDs**: Collision-checked 64-bit content hashes ([`id::ContentId`]).
//! - **Core Errors**: Unified, domain-agnostic error primitives ([`error::CoreError`]).

pub mod error;
pub mod handle;
pub mod id;

pub use error::{CoreError, CoreResult};
pub use handle::{GenerationalPool, Handle};
pub use id::{
    ContentId, LogicalId, RESERVED_LOGICAL_ID_COUNT, RESERVED_RANGE_END, RESERVED_RANGE_START,
    is_reserved_logical_id, validate_host_logical_id,
};
