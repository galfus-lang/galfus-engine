# @galfus/physics-types

Shared 2D and 3D physics contracts, ECS components (`RigidBody2DComponent`, `RigidBody3DComponent`), and collision event definitions for the **Galfus Engine** host layer.

---

## Overview

This package defines the core runtime interfaces and ECS data structures utilized by `@galfus/physics-2d` and `@galfus/physics-3d`:

- **RigidBody Components**: `RigidBody2DComponent` and `RigidBody3DComponent`.
- **World Contracts**: `PhysicsWorld2D` and `PhysicsWorld3D`.
- **Collision Events**: `PhysicsCollisionEvent` (`collisionStart`, `collisionEnd`, `sensorEnter`, `sensorExit`).
- **Interaction Helpers**: `packInteractionGroups` for layer and mask bitmask packing.

---

## ECS Components

### RigidBody2D

```typescript
import { createRigidBody2DComponent } from '@galfus/physics-types';

const comp = createRigidBody2DComponent({
  type: 'dynamic', // 'dynamic' | 'fixed' | 'kinematicPosition' | 'kinematicVelocity'
  mass: 1.0,
  restitution: 0.5,
  friction: 0.4,
  linearVelocity: [0, 2.0],
  angularVelocity: 0.1
});
```

### RigidBody3D

```typescript
import { createRigidBody3DComponent } from '@galfus/physics-types';

const comp = createRigidBody3DComponent({
  type: 'dynamic',
  mass: 1.0,
  restitution: 0.6,
  friction: 0.5,
  linearVelocity: [0, 5.0, -2.0],
  angularVelocity: [0, 1.0, 0],
  enabledRotations: [true, true, true]
});
```

---

## Collision Events

```typescript
export interface PhysicsCollisionEvent {
  readonly type: 'collisionStart' | 'collisionEnd' | 'sensorEnter' | 'sensorExit';
  readonly entityA: EntityId;
  readonly entityB: EntityId;
  readonly colliderIdA: number;
  readonly colliderIdB: number;
  readonly sensor: boolean;
}
```

---

## Interaction Groups

Galfus uses 32-bit interaction groups packed as `(membership << 16) | filter`:

```typescript
import { packInteractionGroups } from '@galfus/physics-types';

const groups = packInteractionGroups(0x0001, 0xffff);
```
