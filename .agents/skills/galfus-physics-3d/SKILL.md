---
name: galfus-physics-3d
description: >-
  Use this skill to configure 3D rigid bodies, colliders (including TriMesh and Heightfield),
  gravity, impulses, contact events, raycasting, and spherecasting in Realm3D using Rapier 3D via attachPhysics3D.
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

Colliders define physical collision boundaries for an entity. Supported shapes include `box`, `sphere`, `cylinder`, `capsule`, `plane`, `triMesh`, and `heightfield`:

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

// Triangle mesh collider (references an existing Realm3D geometryId)
realm3d.addCollider(levelEntity, {
  type: 'triMesh',
  geometryId: levelGeoId
});

// Heightfield terrain collider (row-major heights grid)
realm3d.addCollider(terrainEntity, {
  type: 'heightfield',
  heights,
  nrows: 25,
  ncols: 25,
  scale: [14, 1, 14]
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

## 6. Raycasting & Spherecasting Queries

Perform line-of-sight, terrain grounding, and swept-sphere queries using `realm3d.raycast` and `realm3d.spherecast` (works across all collider shapes including `triMesh` and `heightfield`):

```typescript
const origin: [number, number, number] = [0, 5, 0];
const direction: [number, number, number] = [0, -1, 0]; // Downward
const maxDistance = 10.0;

// Exact raycast (returns hits sorted by distance)
const hits = realm3d.raycast(origin, direction, maxDistance);
if (hits.length > 0) {
  const hit = hits[0]!;
  console.log(`Hit entity ${hit.entityId} at distance ${hit.distance}`, hit.point, hit.normal);
}

// Swept spherecast (ideal for procedural foot placement and character ground probing)
const footHits = realm3d.spherecast(origin, direction, 0.18, maxDistance);
```

## Best Practices

1. **Entity Order**: Attach colliders to the entity before calling `addRigidBody` so the physics world knows the bounding volume.
2. **Fixed Bodies**: Always designate static obstacles as `'fixed'`. Never use dynamic bodies with infinite mass for static geometry.
3. **Discrete vs CCD**: For fast-moving small projectiles (bullets, fast balls), enable continuous collision detection: `{ ccd: true }`.
