pub mod event;
pub mod mapping;
pub mod types;

pub use event::GamepadEvent;
#[cfg(not(target_arch = "wasm32"))]
pub use mapping::{map_gilrs_axis, map_gilrs_button};
pub use mapping::{map_w3c_axis_index, map_w3c_button_index};
pub use types::{GamepadAxis, GamepadButton, GamepadButtonState, GamepadInfo};
