# galfus-animation

Autonomous transition, curve easing, and property animation system for the Galfus Engine.

## Responsibilities

- **Universal Interpolation Engine**: Evaluates smooth property transitions across scalars, 2D/3D vectors, quaternions, 3D transforms (via shortest spherical linear interpolation - SLERP), and 2D transforms (with shortest angular wrapping).
- **Delay & Lifecycle State Machine**: Manages transition timing stages (`Idle` -> `Delay` -> `Running` -> `Completed`) and emits deterministic lifecycle events (`Started`, `Completed`, `Looped`).
- **Smooth Interruptible Retargeting**: Seamlessly captures live values when transitions are redirected mid-flight, eliminating abrupt visual snapping without extra setup.
- **Cross-Realm Property Dispatching**: Directly drives animatable entity properties across Realm 3D, Realm 2D (including reactive vector SVG XML attributes), Multiverse invocations, and custom user channels.

## Capabilities & Powers

- **30+ Mathematical Easing Curves & Springs**:
  - Linear, Quad, Cubic, Quart, Quint, Sine, Expo, Circ, Back, Elastic, and Bounce curves (with In, Out, and InOut variations).
  - Physical mass-spring-damper simulations for natural tactile UI and springy physics effects.
- **Shortest Path Quaternion SLERP**: 3D spatial transforms interpolate orientation quaternions using true spherical linear interpolation with sign alignment, preventing non-rigid deformation and scaling collapse.
- **Shortest Angle 2D Rotations**: 2D transforms automatically compute modular difference modulo $2\pi$, ensuring objects always rotate along the shortest arc.
- **Reactive Vector SVG XML Mutation**: Modifies SVG element colors, coordinates, opacities, and sizes in the live DOM, automatically synchronizing with GPU re-rasterization.
- **Event Queue & Pump Pipeline**: Batches lifecycle milestones for polling via `pumpEvents()` while allowing immediate synchronous inspection via `getState()`.

## Invariants & Design Principles

- **Host Identity Policy**: Enforces logical ID validation, rejecting transitions created within the core-reserved range (`4294901761..=4294967295`).
- **Zero Snapping on Interrupts**: Triggering `transitionTo` on an active transition always captures the evaluated instantaneous value as the new baseline.
- **Decoupled Architecture**: Can operate standalone in headless simulations, unit tests, or connected to active Realm and Multiverse contexts.
