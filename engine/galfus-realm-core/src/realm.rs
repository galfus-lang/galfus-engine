use crate::error::RealmResult;
use crate::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};

/// Core contract defining a graphics-producing Realm.
///
/// A Realm represents a scene or domain-specific graphics producer (e.g. 2D HUD, 3D World).
/// The Multiverse interacts with Realms strictly through this contract, without knowing
/// their internal structure or shader details.
pub trait Realm: Send + Sync {
    /// Returns the logical identifier of the realm.
    fn id(&self) -> u32;

    /// Returns the category of the realm.
    fn kind(&self) -> RealmKind;

    /// Prepares the realm state once per frame (e.g. animation updates, culling preparation).
    fn prepare(&mut self, context: &RealmPrepareContext) -> RealmResult<()>;

    /// Executes rendering for a specific invocation (e.g. portal camera pass, main camera view).
    fn render(&mut self, context: &RealmInvocationContext) -> RealmResult<()>;
}
