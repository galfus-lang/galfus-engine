//! Multiverse interaction and pointer dispatch extensions.

use crate::context::MultiverseContext;
use crate::interaction::{InteractionEvent, InteractionPointerEvent};

impl MultiverseContext {
    /// Dispatches a platform pointer event into the interaction system, performing hit-testing
    /// against active invocations and enqueuing logical model interaction events.
    pub fn handle_pointer_event(&mut self, event: &InteractionPointerEvent) {
        let Self {
            interaction,
            window_sizes,
            targets,
            invocations,
            realms,
            ..
        } = self;

        interaction.handle_event(event, window_sizes, targets, invocations, realms);
    }

    /// Drains all accumulated interaction events from the Multiverse interaction system.
    pub fn poll_interaction_events(&mut self) -> Vec<InteractionEvent> {
        self.interaction.poll_events()
    }
}
