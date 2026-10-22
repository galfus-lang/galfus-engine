pub mod event;
pub mod types;

#[cfg(all(not(target_arch = "wasm32"), feature = "native"))]
pub(crate) mod mapping;

pub use event::KeyboardEvent;
pub use types::{KeyCode, KeyState, LogicalKey, ModifiersState, NamedKey};
