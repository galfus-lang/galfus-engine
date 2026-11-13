//! Window and viewport routing for the shared interaction system.

use crate::interaction_routing::InteractionRouting;
use galfus_core::interaction::InteractionSystem;
pub use galfus_core::interaction::{
    InteractionButtonState, InteractionEvent, InteractionPointerEvent, InteractionType,
};
use glam::Vec2;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Maps a collider's UVs to a texture bound in the same realm.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionSurface {
    pub realm_id: u32,
    pub model_id: u32,
    pub collider_id: u32,
    pub slot: String,
    /// Set when the collider's V axis points upward while texture coordinates point downward.
    #[serde(default)]
    pub flip_y: bool,
}

/// Routes window events to realms and delegates pointer state to the core.
#[derive(Default)]
pub struct MultiverseInteractionSystem {
    inner: InteractionSystem,
    surfaces: HashMap<(u32, u32), InteractionSurface>,
}

impl MultiverseInteractionSystem {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn poll_events(&mut self) -> Vec<InteractionEvent> {
        self.inner.poll_events()
    }
    pub fn cancel_window(&mut self, window_id: u32) {
        self.inner.cancel_window(window_id);
    }
    pub(crate) fn reconcile(
        &mut self,
        frames: &HashMap<u32, std::sync::Arc<crate::context_interaction::InteractionFrame>>,
    ) {
        self.inner.reconcile(|window_id, target| {
            frames
                .get(&window_id)
                .is_some_and(|frame| frame.accepts(window_id, target))
        });
    }
    #[allow(clippy::too_many_arguments)]
    pub fn handle_event(
        &mut self,
        event: &InteractionPointerEvent,
        window_sizes: &HashMap<u32, glam::UVec2>,
        targets: &HashMap<u32, crate::types::TargetDesc>,
        invocations: &HashMap<u32, crate::types::InvocationDesc>,
        realms: &HashMap<u32, Box<dyn galfus_realm_core::Realm>>,
        bindings: &[crate::types::TargetTextureBinding],
        cut_edges: &[(u32, u32)],
        surfaces: &HashMap<(u32, u32), InteractionSurface>,
    ) -> Option<galfus_core::interaction::InteractionHit> {
        let coordinates = match event {
            InteractionPointerEvent::Move {
                window_id,
                position,
                ..
            }
            | InteractionPointerEvent::Button {
                window_id,
                position,
                ..
            }
            | InteractionPointerEvent::Scroll {
                window_id,
                position,
                ..
            } => Some((*window_id, Vec2::from(*position))),
            InteractionPointerEvent::Leave { .. } | InteractionPointerEvent::Cancel { .. } => None,
        };
        let routing = InteractionRouting {
            window_sizes,
            targets,
            invocations,
            realms,
            bindings,
            surfaces,
            cut_edges,
        };
        let hit = coordinates.and_then(|(window, position)| routing.pick_window(window, position));
        self.inner.handle_event(event, hit);
        hit
    }

    pub(crate) fn connect_surface(&mut self, surface: InteractionSurface) {
        self.surfaces
            .insert((surface.realm_id, surface.collider_id), surface);
    }

    pub(crate) fn capture_surfaces(
        &mut self,
        realms: &HashMap<u32, Box<dyn galfus_realm_core::Realm>>,
    ) -> HashMap<(u32, u32), InteractionSurface> {
        self.surfaces.retain(|_, surface| {
            realms.get(&surface.realm_id).is_some_and(|realm| {
                realm.supports_interaction_surface(surface.model_id, surface.collider_id)
            })
        });
        self.surfaces.clone()
    }

    pub(crate) fn disconnect_surface(&mut self, realm_id: u32, collider_id: u32) {
        self.surfaces.remove(&(realm_id, collider_id));
    }

    pub(crate) fn disconnect_slot(&mut self, realm_id: u32, slot: &str) {
        self.surfaces
            .retain(|_, surface| surface.realm_id != realm_id || surface.slot != slot);
    }

    pub(crate) fn disconnect_realm(&mut self, realm_id: u32) {
        self.surfaces
            .retain(|_, surface| surface.realm_id != realm_id);
    }
}
