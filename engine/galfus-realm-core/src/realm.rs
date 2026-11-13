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

    /// Performs a 2D hit test against colliders in the realm using a world coordinate point.
    fn pick_2d(
        &self,
        _camera_slot: Option<u32>,
        _world_pos: glam::Vec2,
    ) -> Option<crate::collision::HitResult2D> {
        None
    }

    /// Performs a 3D raycast picking hit test against colliders in the realm.
    fn pick_3d(
        &self,
        _camera_slot: Option<u32>,
        _ray: crate::collision::Ray3D,
    ) -> Option<crate::collision::HitResult3D> {
        None
    }

    /// Converts a viewport position to world coordinates for 2D picking.
    fn viewport_point_2d(
        &self,
        _camera_slot: Option<u32>,
        _position: glam::Vec2,
        _size: glam::Vec2,
    ) -> Option<glam::Vec2> {
        None
    }

    /// Builds a world-space picking ray and its maximum distance for a viewport position.
    fn viewport_ray_3d(
        &self,
        _camera_slot: Option<u32>,
        _position: glam::Vec2,
        _size: glam::Vec2,
    ) -> Option<(crate::collision::Ray3D, f32)> {
        None
    }

    /// Picks a ray with a maximum distance.
    fn pick_3d_with_limit(
        &self,
        camera_slot: Option<u32>,
        ray: crate::collision::Ray3D,
        max_distance: f32,
    ) -> Option<crate::collision::HitResult3D> {
        self.pick_3d(camera_slot, ray)
            .filter(|hit| hit.distance <= max_distance)
    }

    /// Returns whether a collider still exists and is eligible for interaction.
    fn has_interactive_collider(&self, _model_id: u32, _collider_id: u32) -> bool {
        false
    }

    /// Whether a model's sub-element remains eligible in this presented snapshot.
    fn has_interactive_element(&self, _model_id: u32, _element_id: u32) -> bool {
        false
    }

    /// Applies a pointer wheel delta to a UI element and its scrollable ancestors.
    fn scroll_ui_element(&mut self, _model_id: u32, _element_id: u32, _delta: [f32; 2]) {}

    /// Returns whether a collider is registered on a model, including inactive colliders.
    fn has_collider(&self, model_id: u32, collider_id: u32) -> bool {
        self.has_interactive_collider(model_id, collider_id)
    }

    /// Returns whether a collider supplies usable UV coordinates for a presentation surface.
    fn supports_interaction_surface(&self, _model_id: u32, _collider_id: u32) -> bool {
        false
    }

    /// Captures immutable collider and camera state for a successfully presented frame.
    /// Realms without interaction can return `None`.
    fn snapshot_interaction(&self) -> Option<Box<dyn Realm>> {
        None
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
