# galfus-platform

Environment normalization, native window lifecycle, input event processing, audio services, and platform capability discovery.

## Responsibilities

- **Window Lifecycle & Surface Adapters**: Desktop window creation, resize management, and surface attachment via `winit`, as well as complete headless operating modes.
- **Unified Event Normalization**: Normalizes OS-specific input and window events into structured `PlatformEvent` types covering keyboard, mouse, pointer, touch, and gamepad inputs.
- **Platform Capability Detection**: Queries runtime operating system features and surfaces capabilities (e.g. multi-window support, cursor locking, gamepad connectivity, audio availability).
- **Audio Playback Engine**: Loads supported audio bytes into `kira` static sounds and controls playback, panning, volume, looping, and simple spatial attenuation on native targets.

## Capabilities & Powers

- **Desktop Window Management**:
  - Full control over window creation, title, dimensions, visibility, decorations, and cursor capture/locking.
  - Reentrant surface binding to `wgpu::Surface` for presentation in the multiverse.
- **Headless Operating Mode**:
  - Allows the engine to run without a desktop display server (X11/Wayland/Windows Desktop) for CI testing, automated test suites, and offscreen cloud rendering.
- **Normalized Input Pipeline**:
  - Keyboard: Normalizes physical scan codes and logical keys (including character mappings and named navigation keys).
  - Pointer & Mouse: High-precision cursor positions, deltas, wheel scrolling, button states, and touch pressure extraction.
  - Gamepad (W3C Standard): Normalizes gamepad axes and buttons to the W3C Standard Gamepad layout with configurable stick deadzones.
- **Integrated Audio Subsystem**:
  - Decodes WAV, MP3, OGG, and FLAC bytes supported by `kira`'s static-sound loader.
  - Provides positional playback, volume adjustments, and loop controls on native targets. The wasm implementation currently supplies compatibility no-ops for audio operations.

## Invariants & Design Principles

- **Host-Driven Execution**: Does not hijack or dictate the main loop. The host application pumps events on its own cadence (`platformPumpEvents()`).
- **Main-Thread Enforcement**: Strictly enforces main-thread execution for OS windowing APIs, preventing platform-specific threading crashes.
- **Decoupled from Render Logic**: Contains zero scene or rendering logic; outputs pure events and presentation surface handles.
