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
    ///
    /// Implementations must make this operation idempotent.
    fn clear(&mut self) -> RealmResult<()> {
        Ok(())
    }

    /// Releases all GPU resources, pipelines, and allocations held by the realm.
    ///
    /// The default implementation clears the realm. Implementations that own additional
    /// resources must release them and remain idempotent so failed shutdowns can be retried.
    fn destroy(&mut self) -> RealmResult<()> {
        self.clear()
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

#[cfg(test)]
mod tests {
    use super::*;

    struct ClearOnlyRealm {
        clear_calls: u32,
    }

    impl Realm for ClearOnlyRealm {
        fn id(&self) -> u32 {
            1
        }

        fn kind(&self) -> RealmKind {
            RealmKind::Custom
        }

        fn prepare(&mut self, _context: &RealmPrepareContext<'_>) -> RealmResult<()> {
            Ok(())
        }

        fn render(&mut self, _context: &RealmInvocationContext<'_>) -> RealmResult<()> {
            Ok(())
        }

        fn clear(&mut self) -> RealmResult<()> {
            self.clear_calls += 1;
            Ok(())
        }

        fn as_any(&self) -> &dyn std::any::Any {
            self
        }

        fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
            self
        }
    }

    #[test]
    fn default_destroy_clears_the_realm() {
        let mut realm = ClearOnlyRealm { clear_calls: 0 };

        realm.destroy().unwrap();

        assert_eq!(realm.clear_calls, 1);
    }
}
