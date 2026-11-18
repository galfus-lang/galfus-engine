---
name: galfus-physics-3d
description: >-
  Use this skill to configure 3D rigid bodies, colliders, gravity, impulses,
  contact events, and raycasting in Realm3D using Rapier 3D via attachPhysics3D.
---

# Galfus Engine 3D Physics (Rapier 3D)

Galfus Engine integrates a high-performance native Rapier 3D physics engine directly into `Realm3D`. Rigid body simulation steps and transform synchronizations happen in the native engine core.

## 1. Initializing 3D Physics

Attach the physics world to your `Realm3D` instance using `attachPhysics3D`:

```typescript
import { attachPhysics3D, createRuntime } from '@galfus/engine';

const runtime = createRuntime(transport);
const realm3d = runtime.createRealm3D();

// Attach physics simulation (default gravity: [0, -9.81, 0])
const physics = await attachPhysics3D(runtime, realm3d, {
  gravity: [0, -9.81, 0]
});
```

## 2. Adding Colliders

Colliders define physical collision boundaries for an entity. Supported shapes include `box`, `sphere`, and `capsule`:

```typescript
// Box collider (halfExtents are half-widths from center)
realm3d.addCollider(crateEntity, {
  type: 'box',
  halfExtents: [0.5, 0.5, 0.5] // 1x1x1 cube
});

// Sphere collider
realm3d.addCollider(ballEntity, {
  type: 'sphere',
  radius: 0.75
});

// Capsule collider
realm3d.addCollider(characterEntity, {
  type: 'capsule',
  halfHeight: 0.9,
  radius: 0.4
});
```

## 3. Creating Rigid Bodies

Add rigid bodies to entities using `physics.addRigidBody`. Supported body types:

- `'dynamic'`: Affected by gravity, forces, impulses, and collisions.
- `'fixed'`: Immovable static level geometry (floors, walls, ramps).
- `'kinematicPosition'` / `'kinematicVelocity'`: Moved programmatically without physical forces pushing back.

```typescript
// Static ground floor
const floor = realm3d.createCube(1, floorMat, {
  position: [0, -0.5, 0],
  scale: [20, 1, 20]
}).entityId;

realm3d.addCollider(floor, { type: 'box', halfExtents: [10, 0.5, 10] });
physics.addRigidBody(floor, { type: 'fixed', friction: 0.7 });

// Dynamic falling crate
const crate = realm3d.createCube(1, crateMat, {
  position: [0, 8, 0],
  scale: [1, 1, 1]
}).entityId;

realm3d.addCollider(crate, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
physics.addRigidBody(crate, {
  type: 'dynamic',
  mass: 5.0, // Mass in kg
  restitution: 0.4, // Bounciness (0 = no bounce, 1 = perfectly elastic)
  friction: 0.6,
  linearDamping: 0.1,
  angularDamping: 0.2
});
```

## 4. Applying Impulses & Forces

Apply instantaneous impulses (e.g. jumping or explosions) or continuous forces:

```typescript
// Instant jump impulse [x, y, z]
physics.applyImpulse(crate, [0, 25.0, 0]);

// Direct velocity control
physics.setLinearVelocity(crate, [2.0, 0, 0]);

// Continuous wind force applied every tick
runtime.on('tick', () => {
  physics.applyForce(crate, [1.5, 0, 0]);
});
```

## 5. Collision & Sensor Events

Listen for collision events between entities:

```typescript
physics.on('collision_start', (event) => {
  console.log(`Collision started between entity ${event.entityA} and ${event.entityB}`);
});

physics.on('collision_end', (event) => {
  console.log(`Collision ended between entity ${event.entityA} and ${event.entityB}`);
});
```

## 6. Raycasting Queries

Perform line-of-sight and ground checks using `realm3d.raycast`:

```typescript
const origin: [number, number, number] = [0, 2, 0];
const direction: [number, number, number] = [0, -1, 0]; // Downward
const maxDistance = 10.0;

const hit = realm3d.raycast(origin, direction, maxDistance);
if (hit) {
  console.log(`Hit entity ${hit.entityId} at distance ${hit.distance}`);
  console.log(`Contact point:`, hit.point);
  console.log(`Surface normal:`, hit.normal);
}
```

## Best Practices

1. **Entity Order**: Attach colliders to the entity before calling `addRigidBody` so the physics world knows the bounding volume.
2. **Fixed Bodies**: Always designate static obstacles as `'fixed'`. Never use dynamic bodies with infinite mass for static geometry.
3. **Discrete vs CCD**: For fast-moving small projectiles (bullets, fast balls), enable continuous collision detection: `{ ccd: true }`.
