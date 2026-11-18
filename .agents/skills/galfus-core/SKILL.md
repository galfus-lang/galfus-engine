---
name: galfus-core
description: >-
  Use this skill to configure the Galfus Engine runtime lifecycle, multiverse presentation graph,
  render targets, spatial audio manager, user input events, and the ECS (entities, components, queries, systems).
---

# Galfus Engine Core Architecture & Lifecycle

Galfus Engine separates game state from presentation through a decoupled **Multiverse** architecture. The host application drives game logic and orchestrates renders via the high-level `Runtime` interface and its built-in **Entity Component System (ECS)**.

## 1. Runtime Initialization

The `Runtime` coordinates the tick loop, ECS worlds, platform windows, and audio playback. It requires a transport backend (`@galfus/transport-bun`, `@galfus/transport-node`, or `@galfus/transport-browser`).

```typescript
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';

// 1. Initialize transport and runtime
const transport = createBunTransport();
const runtime = createRuntime(transport);

// 2. Start tick loop
runtime.start();
```

## 2. Multiverse Presentation Graph

A **Realm** (`Realm3D` or `Realm2D`) represents an isolated simulation space containing entities, lights, and cameras.
A **Presentation Target** represents a surface to draw onto (a desktop window or HTML5 canvas).
An **Invocation** links a Realm to a Target through a specific camera slot.

```typescript
// 1. Create a 3D realm
const realm3d = runtime.createRealm3D();

// 2. Create a desktop window target
const windowId = runtime.platform.window.create({
  title: 'Galfus Game',
  size: [1280, 720],
  resizable: true
});

const targetId = runtime.multiverse.createTarget({
  kind: { type: 'window', windowId }
});

// 3. Connect Realm to Target via Invocation (camera slot 1)
runtime.multiverse.createInvocation({
  realmId: realm3d.realmId,
  targetId,
  cameraSlot: 1,
  clearColor: [0.08, 0.1, 0.15, 1.0]
});
```

## 3. Entity Component System (ECS)

Every Realm exposes its own `EcsWorld` via `realm.world`. The ECS manages entities, components, and game logic systems across a structured 4-stage pipeline.

### Entities & Custom Components

Components are plain JavaScript objects or classes implementing `{ readonly type: string }`:

```typescript
import type { Component, EntityId } from '@galfus/engine';

// Define a custom gameplay component
interface HealthComponent extends Component {
  readonly type: 'Health';
  current: number;
  max: number;
}

// Spawn entity and attach components
const world = realm3d.world;
const player: EntityId = world.createEntity();

world.attachComponent(player, {
  type: 'Health',
  current: 100,
  max: 100
} as HealthComponent);

// Retrieve or query components
const health = world.getComponent<HealthComponent>(player, 'Health');
if (health) {
  health.current -= 10;
}

// Check entity status or destroy
if (world.isAlive(player)) {
  console.log('Player is alive');
}
// world.destroyEntity(player);
```

### Querying Entities

Query entities matching one or multiple component types:

```typescript
// Find all entities that have both 'Health' and 'Model3D'
const damageableEntities = world.query(['Health', 'Model3D']);

for (const entityId of damageableEntities) {
  const hp = world.getComponent<HealthComponent>(entityId, 'Health')!;
  // Process entity
}
```

### Creating Systems in the 4-Stage Pipeline

Galfus executes systems in 4 ordered stages every frame:

1. `'input'`: Processes incoming controller, keyboard, and pointer inputs.
2. `'update'`: Primary gameplay logic, AI, physics, and state mutations.
3. `'preRender'`: Spatial hierarchy updates, anchor resolution, and camera synchronization.
4. `'postRender'`: Frame telemetry, cleanups, and diagnostics.

```typescript
import type { SystemContext } from '@galfus/engine';

// Define an update system
function healthRegenSystem(world: any, context: SystemContext) {
  const { dt, time } = context;
  const entities = world.query(['Health']);

  for (const entityId of entities) {
    const hp = world.getComponent<HealthComponent>(entityId, 'Health')!;
    if (hp.current < hp.max) {
      hp.current = Math.min(hp.max, hp.current + 5 * dt);
    }
  }
}

// Register system to the world's pipeline
world.addSystem({
  step: 'update',
  fn: healthRegenSystem,
  priority: 10 // Higher priority runs earlier in the stage (default 0)
});
```

## 4. Game Tick & Event Loop

You can also hook directly into the global runtime tick loop:

```typescript
runtime.on('tick', ({ dt, time }) => {
  // Global frame tick (runs after ECS update steps)
});

// Stop or pause the runtime loop
// runtime.stop();
```

## 5. Input Handling (Keyboard, Pointer, Window)

Galfus unifies cross-platform inputs across Bun, Node, and Browsers:

```typescript
// Keyboard events
runtime.on('keyboard', (event) => {
  if (event.state === 'pressed') {
    if (event.logicalKey === 'Escape') {
      runtime.stop();
    }
    if (event.physicalKey === 'KeyW') {
      // Move forward
    }
  }
});

// Pointer / Mouse events
runtime.on('pointer', (event) => {
  if (event.type === 'move') {
    const [x, y] = event.position;
  }
  if (event.type === 'down' && event.button === 0) {
    // Primary click
  }
});

// Window resize events
runtime.on('window', (event) => {
  if (event.type === 'resize') {
    console.log(`Resized to ${event.size[0]}x${event.size[1]}`);
  }
});
```

## 6. Audio Management

The built-in `AudioManager` handles stereo sound effects, looping background music, and 3D spatial attenuation:

```typescript
// Load sound asset (from file path, URL, or buffer)
const sfxBuffer = await runtime.audio.loadSound('assets/sfx/explosion.wav');

// Play one-shot or looping audio
const soundId = runtime.audio.playSound(sfxBuffer, {
  volume: 0.8,
  loop: false,
  pitch: 1.0
});

// Spatial audio: update listener and emitter positions
runtime.audio.setListenerPosition([0, 1.7, 0]);
runtime.audio.setEmitterPosition(soundId, [10, 0, 5]);
```

## Best Practices & Gotchas

1. **Logical vs Physical IDs**: Never invent internal IDs. Let `runtime.multiverse`, `realm.createCamera`, and `runtime.platform` return managed logical IDs.
2. **Camera Slots**: Invocations bind to a `cameraSlot` integer (e.g., `1`). Ensure the camera in your realm matches the invocation's `cameraSlot`.
3. **Spatial Hierarchy Requirement**: Components like `Mesh3D`/`Collider3D` require `Model3D` on the entity; `Sprite2D`/`Collider2D` require `Model2D`.
4. **Graceful Shutdown**: Call `runtime.stop()` to clean up background worker threads and native GPU resources before process exit.
