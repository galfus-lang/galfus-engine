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
pub mod context_interaction;
pub mod error;
pub(crate) mod executor;
pub mod interaction;
#[cfg(test)]
mod interaction_frame_tests;
#[cfg(test)]
mod interaction_mock_tests;
#[cfg(test)]
mod interaction_realms_tests;
mod interaction_routing;
#[cfg(test)]
mod interaction_ui_tests;
pub(crate) mod postprocess;
pub mod resolver;
pub mod schedule;
pub mod screen_effect;
pub(crate) mod smaa;
pub(crate) mod taa;
pub mod types;

pub use context::MultiverseContext;
pub use error::{MultiverseError, MultiverseResult};
pub use interaction::{
    InteractionButtonState, InteractionEvent, InteractionPointerEvent, InteractionSurface,
    InteractionType, MultiverseInteractionSystem,
};
pub use schedule::{MultiverseSchedule, ResolvedInvocationStep, TargetExecutionBlock};
pub use screen_effect::{
    BUILTIN_BLIT_SNIPPET, BUILTIN_SEPIA_SNIPPET, SCREEN_EFFECT_TEMPLATE, compose_screen_effect,
};
pub use types::{
    AnchorX, AnchorY, AntiAliasingMode, InvocationDesc, InvocationFilter, TargetDesc, TargetKind,
    TargetTextureBinding, UnitValue, ViewportRect,
};
