//! Multiverse interaction and pointer dispatch extensions.

use crate::context::MultiverseContext;
use crate::error::{MultiverseError, MultiverseResult};
use crate::interaction::{InteractionEvent, InteractionPointerEvent, InteractionSurface};
use crate::types::{InvocationDesc, TargetDesc, TargetTextureBinding};
use galfus_realm_core::Realm;
use glam::UVec2;
use std::collections::HashMap;
use std::sync::Arc;

/// Immutable interaction state captured after a successful frame submission.
pub(crate) struct InteractionFrame {
    window_sizes: HashMap<u32, UVec2>,
    targets: HashMap<u32, TargetDesc>,
    invocations: HashMap<u32, InvocationDesc>,
    realms: HashMap<u32, Box<dyn Realm>>,
    bindings: Vec<TargetTextureBinding>,
    surfaces: HashMap<(u32, u32), InteractionSurface>,
    cut_edges: Vec<(u32, u32)>,
}

impl InteractionFrame {
    pub(crate) fn accepts(
        &self,
        window_id: u32,
        target: galfus_core::interaction::InteractionTarget,
    ) -> bool {
        let routing = crate::interaction_routing::InteractionRouting {
            window_sizes: &self.window_sizes,
            targets: &self.targets,
            invocations: &self.invocations,
            realms: &self.realms,
            bindings: &self.bindings,
            surfaces: &self.surfaces,
            cut_edges: &self.cut_edges,
        };
        self.realms.get(&target.realm_id).is_some_and(|realm| {
            realm.has_interactive_collider(target.model_id, target.collider_id)
                && target
                    .element_id
                    .is_none_or(|id| realm.has_interactive_element(target.model_id, id))
        }) && routing.realm_is_presented(window_id, target.realm_id, target.presentation_target_id)
    }
}

impl MultiverseContext {
    /// Dispatches a platform pointer event into the interaction system, performing hit-testing
    /// against active invocations and enqueuing logical model interaction events.
    pub fn handle_pointer_event(&mut self, event: &InteractionPointerEvent) {
        self.interaction.reconcile(&self.interaction_frames);
        let window_id = match event {
            InteractionPointerEvent::Move { window_id, .. }
            | InteractionPointerEvent::Button { window_id, .. }
            | InteractionPointerEvent::Scroll { window_id, .. }
            | InteractionPointerEvent::Leave { window_id, .. }
            | InteractionPointerEvent::Cancel { window_id, .. } => *window_id,
        };
        let Some(frame) = self.interaction_frames.get(&window_id) else {
            return;
        };
        let hit = self.interaction.handle_event(
            event,
            &frame.window_sizes,
            &frame.targets,
            &frame.invocations,
            &frame.realms,
            &frame.bindings,
            &frame.cut_edges,
            &frame.surfaces,
        );
        if let (InteractionPointerEvent::Scroll { delta, .. }, Some(hit)) = (event, hit)
            && let Some(element_id) = hit.element_id
            && let Some(realm) = self.realms.get_mut(&hit.realm_id)
        {
            realm.scroll_ui_element(hit.model_id, element_id, *delta);
        }
    }

    /// Drains all accumulated interaction events from the Multiverse interaction system.
    pub fn poll_interaction_events(&mut self) -> Vec<InteractionEvent> {
        self.interaction.reconcile(&self.interaction_frames);
        self.interaction.poll_events()
    }

    #[allow(clippy::arc_with_non_send_sync)] // Shared across windows; native realms may be thread-safe.
    pub fn publish_interaction_frame(&mut self, presented_windows: &[u32]) {
        if presented_windows.is_empty() {
            return;
        }
        let Some(schedule) = &self.cached_schedule else {
            return;
        };
        let active_realms: std::collections::HashSet<_> = schedule
            .target_blocks
            .iter()
            .flat_map(|block| {
                block
                    .invocations
                    .iter()
                    .map(|invocation| invocation.realm_id)
            })
            .collect();
        let realms = self
            .realms
            .iter()
            .filter(|(id, _)| active_realms.contains(id))
            .filter_map(|(&id, realm)| realm.snapshot_interaction().map(|snapshot| (id, snapshot)))
            .collect();
        let surfaces = self.interaction.capture_surfaces(&self.realms);
        let frame = Arc::new(InteractionFrame {
            window_sizes: self.window_sizes.clone(),
            targets: self.targets.clone(),
            invocations: self.invocations.clone(),
            realms,
            bindings: self.bindings.clone(),
            surfaces,
            cut_edges: schedule.soft_cut_edges.clone(),
        });
        for &window_id in presented_windows {
            self.interaction_frames
                .insert(window_id, Arc::clone(&frame));
        }
    }

    /// Routes hits on a collider into the texture target bound to its realm slot.
    pub fn connect_interaction_surface(
        &mut self,
        surface: InteractionSurface,
    ) -> MultiverseResult<()> {
        galfus_core::id::validate_host_logical_id(surface.realm_id)?;
        galfus_core::id::validate_host_logical_id(surface.model_id)?;
        galfus_core::id::validate_host_logical_id(surface.collider_id)?;
        let realm = self
            .realms
            .get(&surface.realm_id)
            .ok_or(MultiverseError::RealmNotFound(surface.realm_id))?;
        if !realm.has_collider(surface.model_id, surface.collider_id) {
            return Err(MultiverseError::InvalidConfig(
                "Interaction surface requires a collider attached to its model".into(),
            ));
        }
        if !realm.supports_interaction_surface(surface.model_id, surface.collider_id) {
            return Err(MultiverseError::InvalidConfig(
                "Interaction surface requires collider UV coordinates".into(),
            ));
        }
        if !self
            .bindings
            .iter()
            .any(|binding| binding.realm_id == surface.realm_id && binding.slot == surface.slot)
        {
            return Err(MultiverseError::InvalidConfig(
                "Interaction surface requires a bound texture slot".into(),
            ));
        }
        self.interaction.connect_surface(surface);
        Ok(())
    }

    /// Stops forwarding hits from a collider to a texture target.
    pub fn disconnect_interaction_surface(
        &mut self,
        realm_id: u32,
        collider_id: u32,
    ) -> MultiverseResult<()> {
        galfus_core::id::validate_host_logical_id(realm_id)?;
        galfus_core::id::validate_host_logical_id(collider_id)?;
        self.interaction.disconnect_surface(realm_id, collider_id);
        Ok(())
    }
}
