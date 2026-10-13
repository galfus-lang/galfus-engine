use crate::error::RealmResult;
use crate::realm::Realm;
use crate::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};
use glam::UVec4;

/// A simple test/mock Realm that clears or tints its render target with a solid color.
///
/// Useful for testing graph scheduling, split-screen viewports, offscreen render targets,
/// and connector post-processing pipelines without requiring geometry or scene assets.
pub struct ColorRealm {
    id: u32,
    color: [f32; 4],
    render_count: u64,
    last_viewport: Option<UVec4>,
}

impl ColorRealm {
    /// Creates a new `ColorRealm` with a logical ID and RGBA color `[r, g, b, a]`.
    pub fn new(id: u32, color: [f32; 4]) -> Self {
        Self {
            id,
            color,
            render_count: 0,
            last_viewport: None,
        }
    }

    /// Updates the active RGBA color.
    pub fn set_color(&mut self, color: [f32; 4]) {
        self.color = color;
    }

    /// Returns the current RGBA color.
    pub fn color(&self) -> [f32; 4] {
        self.color
    }

    /// Returns the total number of render passes executed by this realm.
    pub fn render_count(&self) -> u64 {
        self.render_count
    }

    /// Returns the viewport coordinates from the last render invocation.
    pub fn last_viewport(&self) -> Option<UVec4> {
        self.last_viewport
    }
}

impl Realm for ColorRealm {
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        RealmKind::Custom
    }

    fn prepare(&mut self, _context: &RealmPrepareContext) -> RealmResult<()> {
        Ok(())
    }

    fn render(&mut self, context: &RealmInvocationContext) -> RealmResult<()> {
        self.render_count = self.render_count.saturating_add(1);
        self.last_viewport = Some(context.viewport);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_color_realm_lifecycle() {
        let mut realm = ColorRealm::new(42, [0.1, 0.2, 0.3, 1.0]);
        assert_eq!(realm.id(), 42);
        assert_eq!(realm.kind(), RealmKind::Custom);
        assert_eq!(realm.color(), [0.1, 0.2, 0.3, 1.0]);
        assert_eq!(realm.render_count(), 0);
        assert_eq!(realm.last_viewport(), None);

        realm.set_color([0.5, 0.6, 0.7, 1.0]);
        assert_eq!(realm.color(), [0.5, 0.6, 0.7, 1.0]);

        let prep = RealmPrepareContext {
            frame_id: 1,
            delta_time: 0.016,
        };
        assert!(realm.prepare(&prep).is_ok());

        let inv = RealmInvocationContext {
            frame_id: 1,
            invocation_id: 10,
            target_id: 100,
            camera_id: None,
            viewport: UVec4::new(0, 0, 800, 600),
        };
        assert!(realm.render(&inv).is_ok());
        assert_eq!(realm.render_count(), 1);
        assert_eq!(realm.last_viewport(), Some(UVec4::new(0, 0, 800, 600)));
    }
}
