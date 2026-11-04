# @galfus/physics-2d

2D rigid-body physics and automatic Anchor-to-Joint coupling for **Galfus Engine** (`Realm2D`), powered by `@dimforge/rapier2d-compat` across Bun, Node.js, and Browser runtimes.

---

## Installation

```bash
# Bun
bun add @galfus/physics-2d @dimforge/rapier2d-compat @galfus/engine

# Node.js
npm install @galfus/physics-2d @dimforge/rapier2d-compat @galfus/engine
```

---

## Getting Started

### 1. Basic Physics Simulation

Attach a Rapier 2D physics world to an active `Realm2D` and `MultiverseRuntime`. Physics steps automatically run on `runtime.on('fixedTick')`, with optional sub-frame visual transform interpolation on `tick`.

```typescript
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';
import { attachPhysics2D } from '@galfus/physics-2d';

// 1. Initialize engine runtime and 2D realm
const transport = createBunTransport({ targetFps: 60, headless: false });
const runtime = createRuntime(transport);
const windowId = runtime.platform.window.create({ title: '2D Physics Arena', size: [1280, 720] });
const realm2d = runtime.createRealm2D(1);

// 2. Attach Rapier 2D physics world
const physics = await attachPhysics2D(runtime, realm2d, {
  gravity: [0, -9.81],
  fixedDt: 1 / 60,
  interpolate: true // Smoothly interpolates visual Model2D transforms on tick
});

// 3. Create materials
const matFloor = realm2d.createMaterial({
  surfaceType: 'opaque',
  baseColor: [0.2, 0.25, 0.35, 1.0]
});
const matBox = realm2d.createMaterial({ surfaceType: 'opaque', baseColor: [0.95, 0.55, 0.2, 1.0] });

// 4. Create static floor
const floorEntity = realm2d.createSprite(
  { dimensions: [20.0, 1.0], materialId: matFloor },
  { position: [0, -6.0], zLayer: 0 }
);
realm2d.addCollider(floorEntity, {
  type: 'rectangle',
  halfExtents: [10.0, 0.5]
});
physics.addRigidBody(floorEntity, { type: 'fixed', friction: 0.7, restitution: 0.3 });

// 5. Create dynamic falling box
const boxEntity = realm2d.createSprite(
  { dimensions: [1.2, 1.2], materialId: matBox },
  { position: [0, 5.0], rotation: 0.4, zLayer: 1 }
);
realm2d.addCollider(boxEntity, {
  type: 'rectangle',
  halfExtents: [0.6, 0.6]
});
physics.addRigidBody(boxEntity, {
  type: 'dynamic',
  mass: 1.0,
  friction: 0.5,
  restitution: 0.6
});

// 6. Listen for collision events
physics.on('collisionStart', (event) => {
  console.log(`Collision between entity ${event.entityA} and entity ${event.entityB}`);
});

// 7. Compose scene and start loop
const targetId = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
runtime.multiverse.createInvocation({
  realmId: realm2d.realmId,
  targetId,
  viewport: { width: { vw: 100 }, height: { vh: 100 } }
});

runtime.start();
```

---

## Sensors & Triggers

To create a trigger zone that detects entering and exiting bodies without physical collision:

```typescript
const sensorEntity = realm2d.createShape(
  { kind: 'circle', radius: 2.0, segments: 32, materialId: matSensor },
  { position: [0, -2.0], zLayer: 0 }
);

realm2d.addCollider(sensorEntity, { type: 'circle', radius: 2.0 }, { sensor: true });
physics.addRigidBody(sensorEntity, { type: 'fixed' });

physics.on('sensorEnter', ({ sensorEntity, otherEntity }) => {
  console.log(`Entity ${otherEntity} entered sensor ${sensorEntity}`);
});

physics.on('sensorExit', ({ sensorEntity, otherEntity }) => {
  console.log(`Entity ${otherEntity} exited sensor ${sensorEntity}`);
});
```

---

## Forces, Impulses & Torques

Interact with dynamic rigid bodies using linear and angular methods:

```typescript
// 1. Instantaneous linear impulse (bullets, jumps, explosions)
physics.applyImpulse(entity, [0, 15.0]);

// 2. Off-center impulse (creates linear motion + angular spin)
physics.applyImpulseAtPoint(entity, [0, 10.0], [1.5, 0]);

// 3. Continuous linear force (wind, rocket thrust — call during fixedTick)
physics.applyForce(entity, [0, 9.8]);

// 4. Continuous force applied at an off-center point
physics.applyForceAtPoint(entity, [5.0, 0], [0, 1.0]);

// 5. Continuous torque (rotational motors, propellers)
physics.applyTorque(entity, 12.0);

// 6. Instantaneous torque impulse (kicking doors, angular shock)
physics.applyTorqueImpulse(entity, 25.0);
```

---

## Anchor Joint Handoff

Entities attached using Galfus `AnchorComponent` (`rope`, `chain`, `spring`, `hinge`, or `angularSpring`) are automatically handed over to Rapier as physical impulse joints when rigid bodies are present on both entities (or when `managedByPhysics` is active).

```typescript
import { presetsAnchor } from '@galfus/engine';

// 1. Chain / Pendulum
realm2d.hierarchy.attach(childEntity, parentEntity, 'chain');

// 2. Hinge with angular rotation limits (e.g., -45° to +45°)
realm2d.hierarchy.attach(
  armEntity,
  postEntity,
  presetsAnchor.hinge({
    limits: [-Math.PI / 4, Math.PI / 4], // Angle limits in radians
    localAnchorOrigin: [-1.0, 0],
    localAnchorTarget: [0, 0]
  })
);

// 3. Angular Spring / Torsional Spring (returns to targetAngle with stiffness & damping)
realm2d.hierarchy.attach(
  doorEntity,
  postEntity,
  presetsAnchor.angularSpring({
    targetAngle: 0,
    stiffness: 120,
    damping: 15,
    limits: [-Math.PI / 2, Math.PI / 2] // Optional angular limit clamp
  })
);
```

When active, Galfus hands off the constraint to Rapier's impulse solver while continuously updating visual child entity transforms.

---

## Supported Collider Shapes

| Shape Type  | Descriptor Schema                                                    |
| ----------- | -------------------------------------------------------------------- |
| `rectangle` | `{ type: 'rectangle', halfExtents: [hx, hy] }`                       |
| `circle`    | `{ type: 'circle', radius: r }`                                      |
| `polygon`   | `{ type: 'polygon', vertices: [[x0, y0], [x1, y1], [x2, y2], ...] }` |

---

## Interactive Demos

Explore ready-to-run 2D physics demos in the catalog:

```bash
# 2D Arena with gravity, bounces, and sensor zones
bun demo phys2d1

# 2D Anchor Rope and Chain Joint physics handoff
bun demo phys2d2
```
