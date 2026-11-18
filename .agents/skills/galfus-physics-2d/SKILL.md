---
name: galfus-physics-2d
description: >-
  Use this skill to configure 2D rigid bodies, colliders, gravity, impulses,
  and contact events in Realm2D using Rapier 2D via attachPhysics2D.
---

# Galfus Engine 2D Physics (Rapier 2D)

`Realm2D` integrates 2D physics simulation through Rapier 2D, supporting dynamic and fixed rigid bodies, continuous velocity updates, sensor triggers, and 2D spatial queries.

## 1. Initializing 2D Physics

Attach the 2D physics world to your `Realm2D` instance using `attachPhysics2D`:

```typescript
import { attachPhysics2D, createRuntime } from '@galfus/engine';

const runtime = createRuntime(transport);
const realm2d = runtime.createRealm2D();

// Attach physics simulation (default gravity: [0, -9.81])
const physics = await attachPhysics2D(runtime, realm2d, {
  gravity: [0, -9.81]
});
```

## 2. Adding 2D Colliders

Colliders attach to entities with `Model2D` components. Supported shapes: `rectangle`, `circle`, and `polygon`:

```typescript
// Box / Rectangle collider
realm2d.addCollider(boxSprite.entityId, {
  type: 'rectangle',
  halfExtents: [1.0, 1.0] // Half-width and half-height
});

// Circle collider
realm2d.addCollider(ballSprite.entityId, {
  type: 'circle',
  radius: 0.8
});

// Convex polygon collider
realm2d.addCollider(rampSprite.entityId, {
  type: 'polygon',
  vertices: [
    [-1, -0.5],
    [1, -0.5],
    [1, 0.5]
  ]
});
```

## 3. Creating 2D Rigid Bodies

Attach rigid bodies to entities using `physics.addRigidBody`:

```typescript
// Static ground platform
const ground = realm2d.createSprite(
  { dimensions: [20, 1], materialId: groundMat },
  { position: [0, -4] }
);
realm2d.addCollider(ground.entityId, { type: 'rectangle', halfExtents: [10, 0.5] });
physics.addRigidBody(ground.entityId, { type: 'fixed', friction: 0.8 });

// Dynamic character sprite
const player = realm2d.createSprite(
  { dimensions: [1.6, 1.6], materialId: playerMat },
  { position: [0, 2] }
);
realm2d.addCollider(player.entityId, { type: 'circle', radius: 0.8 });
physics.addRigidBody(player.entityId, {
  type: 'dynamic',
  mass: 3.0,
  restitution: 0.2, // Small bounce
  friction: 0.5,
  lockRotations: true // Keep character upright
});
```

## 4. Applying Impulses & Velocity Control

```typescript
// Instant jump impulse [vx, vy]
physics.applyImpulse(player.entityId, [0, 18.0]);

// Horizontal movement
physics.setLinearVelocity(player.entityId, [5.0, currentVy]);

// Torque impulse (angular spin)
physics.applyTorqueImpulse(wheelEntity, 12.0);
```

## 5. Collision Events & Sensor Triggers

Detect when entities collide or pass through sensor zones (pickups, checkpoints):

```typescript
// Sensor collider (doesn't cause physical bounce, triggers event only)
realm2d.addCollider(coinEntity, { type: 'circle', radius: 0.5 }, { isSensor: true });
physics.addRigidBody(coinEntity, { type: 'fixed' });

// Listen to collision events
physics.on('collision_start', (event) => {
  if (event.sensor) {
    console.log(`Entity ${event.entityA} collected sensor ${event.entityB}`);
  }
});
```

## 6. Point Queries (Click to Select)

Test whether a 2D world point intersects any collider:

```typescript
const hits = realm2d.queryPoint([worldX, worldY]);
if (hits.length > 0) {
  console.log(`Clicked on entity: ${hits[0].entityId}`);
}
```

## Best Practices

1. **Lock Rotations for Characters**: Use `{ lockRotations: true }` on platformer characters to prevent physics collisions from tipping them over.
2. **Fixed Platforms**: Mark stationary platforms and walls as `'fixed'` to ensure stable contacts.
3. **Sensor Overlaps**: Set `{ isSensor: true }` in `options` for triggers, coins, and portal checkpoints.
