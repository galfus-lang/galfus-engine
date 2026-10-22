//! Browser and WebAssembly packaging for the full Galfus Engine API.
//!
//! JavaScript-facing bindings are generated from the shared native API and exposed through the
//! generated `GalfusBrowser` TypeScript facade.

/// Full engine API (platform, multiverse, realms, animation, and resources) for WebAssembly.
#[cfg(target_arch = "wasm32")]
pub use galfus_native::{wasm_attach::*, wasm_bind::*};
