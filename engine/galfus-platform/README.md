# galfus-platform

Environment normalization, surface adapters, input event dispatch, and platform capability discovery.

## Responsibilities

- **Window & Surface Adapters**: Desktop surface integration via `winit`, canvas abstractions for web environments, and headless operation modes.
- **Event Normalization**: Unified event representation for keyboard, mouse/pointer, touch, gamepad, and window lifecycle transitions.
- **Capability Discovery**: Exposes explicit platform capabilities and limitations (e.g. multi-window support, user-gesture audio restrictions, headless support).
- **Audio Service Adapters**: Interfaces to native desktop audio backends and Web Audio.

## Invariants & Non-Goals

- **Host-Driven**: Does not own or dictate the main loop or update cadence. The host polls or processes events at its discretion.
- **Thread Affinity Aware**: Respects platform-specific thread constraints (e.g. main-thread requirements for desktop windowing).
- **Graphics Agnostic**: Does not manage GPU devices, shaders, render pipelines, or scene state.
