pub mod event;
pub mod types;

#[cfg(all(not(target_arch = "wasm32"), feature = "native"))]
pub(crate) mod mapping;

pub use event::PointerEvent;
pub use types::{PointerButton, PointerButtonState, PointerType, ScrollDelta};

