//! # Galfus Multiverse
//!
//! Graph orchestrator for Realms, Targets, and Invocation scheduling.
//!
//! The Multiverse:
//! - Tracks declared Targets (Windows, Offscreen Textures).
//! - Manages Realm instances through abstract [`galfus_realm_core::Realm`] contracts.
//! - Schedules multi-invocation passes with dependency resolution (e.g. portal recursion, HUD overlays).
//! - Compiles deterministic execution schedules via [`resolve`](MultiverseContext::resolve) and dispatches them via [`dispatch`](MultiverseContext::dispatch).

pub mod context;
pub mod error;
pub(crate) mod postprocess;
pub mod resolver;
pub mod schedule;
pub mod types;

pub use context::{ConnectorHandler, ConnectorInvocationContext, MultiverseContext};
pub use error::{MultiverseError, MultiverseResult};
pub use schedule::{
    MultiverseSchedule, ResolvedConnectorStep, ResolvedInvocationStep, TargetExecutionBlock,
};
pub use types::{
    ConnectorDesc, ConnectorEffect, InvocationDesc, InvocationFilter, TargetDesc, TargetKind,
    TargetTextureBinding, ViewportRect,
};
