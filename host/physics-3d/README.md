# @galfus/physics-3d

3D rigid-body physics and automatic Anchor-to-Joint coupling for **Galfus Engine** (`Realm3D`), powered by `@dimforge/rapier3d-compat` across Bun, Node.js, and Browser runtimes.

---

## Installation

```bash
# Bun
bun add @galfus/physics-3d @dimforge/rapier3d-compat @galfus/engine

# Node.js
npm install @galfus/physics-3d @dimforge/rapier3d-compat @galfus/engine
```

---

## Getting Started

### 1. Basic Physics Simulation

Attach a Rapier 3D physics world to an active `Realm3D` and `MultiverseRuntime`. Physics steps automatically run on `runtime.on('fixedTick')`, with sub-frame visual transform interpolation on `tick`.

```typescript
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';
import { attachPhysics3D } from '@galfus/physics-3d';

// 1. Initialize engine runtime and 3D realm
const transport = createBunTransport({ targetFps: 60, headless: false });
const runtime = createRuntime(transport);
const windowId = runtime.platform.window.create({ title: '3D Physics Sandbox', size: [1280, 720] });
const realm3d = runtime.createRealm3D(1);

// 2. Attach Rapier 3D physics world
const physics = await attachPhysics3D(runtime, realm3d, {
  gravity: [0, -9.81, 0],
  fixedDt: 1 / 60,
  interpolate: true // Smoothly interpolates visual Model3D transforms on tick
});

// 3. Set up Camera and Lighting
const camera = realm3d.createCamera(
  { fovY: Math.PI / 4, near: 0.1, far: 500 },
  { position: [0, 8, 16] }
);
realm3d.setCameraLookAt(camera, { target: [0, 1, 0], up: [0, 1, 0] });

realm3d.createLight(
  { kind: 'directional', color: [1, 1, 1], intensity: 2.5, castShadow: true },
  { position: [8, 16, 8], rotation: [0, 0, 0, 1] }
);

// 4. Create materials
const floorMat = realm3d.createMaterial({
  baseColor: [0.2, 0.22, 0.28, 1.0],
  roughness: 0.8
}).materialId;
const sphereMat = realm3d.createMaterial({
  baseColor: [0.2, 0.8, 1.0, 1.0],
  metallic: 0.6,
  roughness: 0.2
}).materialId;

// 5. Create static ground
const ground = realm3d.createCube(1, floorMat, {
  position: [0, -0.5, 0],
  scale: [20, 1, 20]
}).entityId;
realm3d.addCollider(ground, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
physics.addRigidBody(ground, { type: 'fixed', friction: 0.7, restitution: 0.2 });

// 6. Create dynamic falling sphere
const sphere = realm3d.createSphere(0.8, sphereMat, {
  position: [0, 6, 0]
}).entityId;
realm3d.addCollider(sphere, { type: 'sphere', radius: 0.8 });
physics.addRigidBody(sphere, {
  type: 'dynamic',
  mass: 1.0,
  restitution: 0.7,
  friction: 0.4
});

// 7. Listen for collision events
physics.on('collisionStart', (event) => {
  console.log(`Collision between entity ${event.entityA} and entity ${event.entityB}`);
});

// 8. Compose scene and start loop
const targetId = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
runtime.multiverse.createInvocation({
  realmId: realm3d.realmId,
  targetId,
  viewport: { width: { vw: 100 }, height: { vh: 100 } }
});

runtime.start();
```

---

## Forces, Impulses & Torques

Apply instantaneous impulses or continuous forces directly to dynamic rigid bodies:

```typescript
// Apply linear impulse to launch an entity upwards and forward
physics.applyImpulse(sphere, [0, 5.0, -3.0]);

// Apply rotational torque impulse
physics.applyTorqueImpulse(sphere, [0.5, 0, 0.2]);

// Set linear velocity directly
physics.setLinearVelocity(sphere, [2.0, 0, 0]);
```

---

## Sensors & Triggers

Create trigger zones that detect intersections without exerting collision response:

```typescript
const sensorZone = realm3d.createCylinder(2.5, 1.0, 24, sensorMat, {
  position: [0, 0.5, 0]
}).entityId;

realm3d.addCollider(
  sensorZone,
  { type: 'cylinder', radius: 2.5, halfHeight: 0.5 },
  { sensor: true }
);
physics.addRigidBody(sensorZone, { type: 'fixed' });

physics.on('sensorEnter', ({ sensorEntity, otherEntity }) => {
  console.log(`Entity ${otherEntity} entered sensor ${sensorEntity}`);
});

physics.on('sensorExit', ({ sensorEntity, otherEntity }) => {
  console.log(`Entity ${otherEntity} exited sensor ${sensorEntity}`);
});
```

---

## Anchor Joint Handoff

Entities connected via Galfus `AnchorComponent` (`rope`, `chain`, `spring`, `hinge`, or `angularSpring`) are automatically handed over to Rapier as physical impulse joints when rigid bodies are present on both entities (or when `managedByPhysics` is active).

```typescript
import { presetsAnchor } from '@galfus/engine';

// 1. Pendulum / Spherical Joint
realm3d.hierarchy.attach(ballEntity, ceilingAnchorEntity, 'chain');

// 2. Hinge Door with custom rotation axis and angle limits (e.g., 0° to 90°)
realm3d.hierarchy.attach(
  doorEntity,
  doorFrameEntity,
  presetsAnchor.hinge({
    axis: [0, 1, 0], // Y-axis rotation
    limits: [0, Math.PI / 2], // Angle limits [minAngle, maxAngle] in radians
    localAnchorOrigin: [-0.8, 0, 0],
    localAnchorTarget: [0, 0, 0]
  })
);

// 3. Angular Spring / Torsional Spring (returns to targetAngle around axis)
realm3d.hierarchy.attach(
  saloonDoorEntity,
  doorPostEntity,
  presetsAnchor.angularSpring({
    axis: [0, 1, 0], // Y-axis rotation
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

| Shape Type | Descriptor Schema                                      |
| ---------- | ------------------------------------------------------ |
| `box`      | `{ type: 'box', halfExtents: [hx, hy, hz] }`           |
| `sphere`   | `{ type: 'sphere', radius: r }`                        |
| `cylinder` | `{ type: 'cylinder', radius: r, halfHeight: hh }`      |
| `capsule`  | `{ type: 'capsule', radius: r, halfHeight: hh }`       |
| `plane`    | `{ type: 'plane', normal: [nx, ny, nz], halfExtents }` |

---

## Interactive Demos

Explore ready-to-run 3D physics demos in the catalog:

```bash
# 3D Sandbox with Cubes, Spheres, Cylinders, gravity and sensor zone
bun demo phys3d1

# 3D Anchor Rope, Chain, and Spring Joint physics handoff
bun demo phys3d2
```
