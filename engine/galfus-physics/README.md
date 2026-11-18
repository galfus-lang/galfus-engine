# galfus-physics

Autonomous 2D and 3D native physics simulation engine powered by Rapier (Rapier2D and Rapier3D).

## Responsibilities

- **Dual-Domain Simulation**: Manages isolated 2D and 3D physics worlds (`PhysicsWorld2D` and `PhysicsWorld3D`).
- **Rigid Body Dynamics**: Simulates dynamic, fixed, kinematic position-based, and kinematic velocity-based rigid bodies.
- **Collider & Geometry Mapping**: Maps engine collision shapes (cubes, spheres, capsules, cylinders, polygons, compound colliders) into Rapier physics colliders.
- **Contact & Collision Events**: Emits typed collision lifecycle events (`started`, `stopped`) and contact points for host-side reaction.
- **Raycasting & Spatial Queries**: Performs ray intersections, point projections, and shape sweeps across both 2D and 3D simulation spaces.

## Capabilities & Powers

- **2D Physics (`PhysicsWorld2D`)**:
  - Continuous collision detection (CCD), configurable gravity, linear/angular damping, and restitution/friction.
  - Impulse application: linear impulses, angular torque, force accumulators.
  - Spatial raycasting with filter groups and layer masks.
- **3D Physics (`PhysicsWorld3D`)**:
  - Full 3D rigid body dynamics with quaternion orientation tracking.
  - Compound colliders, continuous collision detection, and translation/rotation degree-of-freedom locking.
  - 3D raycasting with distance, hit normal, and collider/body identification.
- **Event Pipeline**:
  - Batches collision events (`started`, `stopped`) per step for polling via `pump_events()`.
- **Clean Decoupling**:
  - Pure simulation logic; does not draw or allocate graphics resources directly. Transforms synchronize to Realm models via ECS or host integration.

## Invariants & Design Principles

- **Deterministic Step Cadence**: Physics updates are driven explicitly by caller-provided delta times (`step(dt)`).
- **Core Reserved ID Policy**: Validates host-supplied logical IDs, rejecting assignments within the core-reserved range (`4294901761..=4294967295`).
- **Independent Simulation Lifecycles**: 2D and 3D worlds are completely isolated from each other and can be instantiated, stepped, or destroyed independently.
