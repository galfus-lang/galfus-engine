use crate::error::RealmResult;
use crate::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};

/// Platform-specific thread-safety requirement for Realm implementations.
///
/// Native GPU handles can cross the engine's synchronization boundary, while browser WebGPU
/// handles are bound to the JavaScript main thread and intentionally do not implement `Send` or
/// `Sync`.
#[cfg(not(target_arch = "wasm32"))]
pub trait RealmThreadBound: Send + Sync {}

#[cfg(not(target_arch = "wasm32"))]
impl<T: Send + Sync> RealmThreadBound for T {}

#[cfg(target_arch = "wasm32")]
pub trait RealmThreadBound {}

#[cfg(target_arch = "wasm32")]
impl<T> RealmThreadBound for T {}

/// Core contract defining a graphics-producing Realm.
///
/// A Realm represents a scene or domain-specific graphics producer (e.g. 2D HUD, 3D World).
/// The Multiverse interacts with Realms strictly through this contract, without knowing
/// their internal structure or shader details.
pub trait Realm: RealmThreadBound + 'static {
    /// Returns the logical identifier of the realm.
    fn id(&self) -> u32;

    /// Returns the category of the realm.
    fn kind(&self) -> RealmKind;

    /// Prepares the realm state once per frame (e.g. animation updates, culling preparation).
    fn prepare(&mut self, context: &RealmPrepareContext<'_>) -> RealmResult<()>;

    /// Executes rendering for a specific invocation (e.g. portal camera pass, main camera view).
    fn render(&mut self, context: &RealmInvocationContext<'_>) -> RealmResult<()>;

    /// Clears all entities, lights, emitters, and scene resources, resetting the realm to an empty state.
    fn clear(&mut self) -> RealmResult<()> {
        Ok(())
    }

    /// Releases all GPU resources, pipelines, and allocations held by the realm.
    fn destroy(&mut self) -> RealmResult<()> {
        Ok(())
    }

    /// Returns a list of logical texture IDs currently referenced by the realm's materials or entities.
    fn referenced_texture_ids(&self) -> Vec<u32> {
        Vec::new()
    }

    /// Returns a reference for downcasting to a concrete Realm type.
    fn as_any(&self) -> &dyn std::any::Any;

    /// Returns a mutable reference for downcasting to a concrete Realm type.
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any;
}
