# @galfus/engine

The official TypeScript high-level engine runtime for **Galfus Engine**. Provides an ECS-driven architecture, incremental dirty-flag synchronization, anchor-based transform hierarchy, 2D/3D realms, multiverse composition, and spatial audio.

---

## Architecture Overview

1. **ECS as Single Source of Truth**:
   - Entities hold spatial `Model3D` or `Model2D` components.
   - Renderables (`Mesh3D`, `Sprite2D`, `Shape2D`, `Svg2D`) attach directly to the model entity.
   - Assets (`Geometry`, `Material`, `Texture`) are managed in resource registries outside the ECS and survive entity destruction.

2. **Anchor Graph (`origin` / `target`)**:
   - Replaces traditional rigid parent/child hierarchies.
   - `origin` is the dependent entity; `target` is the anchor reference.
   - Detaching an entity or destroying its target preserves the resolved global matrix into the local transform.

3. **Incremental Dirty Sync & Zero Overhead**:
   - Spatial and descriptor updates are tracked via `DirtyRegistry`.
   - Completely static scenes produce **zero** transform ABI calls per frame.

4. **Dynamic Multiverse Invocations**:
   - Targets represent render surfaces (windows or offscreen textures).
   - Invocations compose Realms onto Targets via responsive viewports.
   - Mutate viewports seamlessly without rebinding via `invocation.update({ viewport: ... })`.

5. **Deterministic Lifecycle**:
   - `realm.reset()`: Resets the ECS world, entities, and realm-owned assets, keeping the realm registered.
   - `realm.dispose()`: Unregisters the realm from the Multiverse and frees its native resources.
   - `runtime.reset()`: Purges all realms, invocations, targets, audio, and caches while keeping the transport backend ready for new scenes.
   - `runtime.dispose()`: Terminal shutdown of both runtime and transport.

2D materials are realm-owned resources. `Realm2D.createMaterial` returns a logical ID and queues the material for the next sync or `flush()`, even if the realm is not yet bound to an engine. `destroyMaterial(id)` queues its removal without destroying entities that reference it. `reset()` and `dispose()` release the realm's materials.

The Multiverse maintains a host-side `presentationGraph` rooted at targets of open windows. It is populated from the renderer's resolved schedule and published after a successful dispatch. `getWindow(windowId)` is unavailable before the first successful dispatch or after the window closes; otherwise it exposes an immutable snapshot of reachable targets, invocations, resolved viewports, render order and texture-binding candidates. The last snapshot remains available while paused and when a dispatch fails. Unchanged schedules and links reuse the existing snapshot. A texture binding alone is a candidate, not a traversable surface; future interaction code must validate and maintain surface mappings. Cycle edges sampled from the previous frame are exposed as `softCutEdges`.

2D objects are drawn back to front by `zLayer`, then `drawOrder`, then logical resource ID. Set distinct layers or draw orders when overlap must remain independent of resource creation order. Changing `Model2DComponent.zLayer` or `drawOrder` is synchronized on the next frame.

## Colliders

Each collider belongs to an entity with a matching `Model2D` or `Model3D` component. `addCollider` returns a realm-owned logical collider ID; multiple colliders may share one entity. Local matrices are column-major and relative to the model. Collision queries resolve the model hierarchy on the host and return hits with collider and entity IDs; ray hits are sorted by distance. Queries do not require a bound engine or call the rendering core. Point-query boundaries are inclusive. Rays starting inside a volume return distance zero and a zero normal. A singular world transform temporarily excludes the collider until its transform is invertible again.

```typescript
const entity = realm2d.createSpatialNode({ position: [3, 4] });
const colliderId = realm2d.addCollider(entity, { type: 'circle', radius: 2 }, { sensor: true });
const inside = realm2d.queryPoint([3, 4]);
const hits = realm2d.raycast([0, 4], [1, 0], 10);
const component = realm2d.world.getComponent<Collider2DComponent>(entity, 'Collider2D');
component?.remove(colliderId);
```

2D supports circles, rectangles and simple polygons. 3D supports spheres, boxes and finite planes in local XY. Queries use a layer mask; the collider's own mask is retained for future pairwise collision filtering. These APIs perform geometric queries and do not simulate rigid bodies.

---

## Input methods

Enable IME only while a text target is focused, and provide its caret area in physical window pixels so the platform can position its candidate UI:

```typescript
runtime.platform.window.setImeAllowed(windowId, true);
runtime.platform.window.setImeCursorArea(windowId, x, y, width, height);
const off = runtime.on('keyboard', (event) => {
  if (event.type === 'imePreedit') console.log('Preview:', event.text, event.selection);
  if (event.type === 'imeCommit') console.log('Confirmed:', event.text);
});
// On blur or disposal:
runtime.platform.window.setImeAllowed(windowId, false);
off();
```

Selection offsets, when supplied, use UTF-16 code units within the preedit text. The browser does not expose this selection in composition events. The browser input bridge takes DOM focus and releases it on disable or focus loss; enable it from a user interaction when the browser requires a user gesture.

---

## Quick Start

```typescript
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';

// 1. Initialize transport and runtime
const transport = await createBunTransport({ targetFps: 60, headless: false });
const runtime = createRuntime(transport);

// 2. Create 3D Realm and resources
const realm3d = runtime.createRealm3D(1);
const geoId = realm3d.createGeometry({ kind: 'cube', size: 1.0 });
const matId = realm3d.createMaterial({ baseColor: [0.8, 0.2, 0.3, 1.0] });

// 3. Create Model entity and attach Mesh
const entity = realm3d.createModel({
  geometryId: geoId,
  materialId: matId,
  transform: { position: [0, 1, 0] }
});

// 4. Set up Multiverse Target and Invocation
const targetId = runtime.multiverse.createTarget({
  kind: { type: 'window', windowId: 1 }
});

const invocationId = runtime.multiverse.createInvocation({
  realmId: realm3d.realmId,
  targetId,
  viewport: { width: { vw: 100 }, height: { vh: 100 } }
});

// 5. Start main loop
runtime.start();
```

---

## SVG element bounds

`runtime.svg.getRect(realmId, svgId, elementId)` returns the geometric bounds of an SVG
element or `undefined` if it cannot be found. The result is expressed in the SVG viewport's
coordinates (top-left origin, Y down), before the entity transform. `viewportWidth` and
`viewportHeight` describe that coordinate space. Bounds are cached and refreshed after SVG
edits, font changes, re-creation, and native attribute animations.

## Pointer interaction

Run `bun host:demo interaction` to try direct 2D, SVG, and 3D interaction in a window.
For a bounded headless smoke test, use `bun host:demo interaction --headless --frames 10`.
The host tutorial is available as `bun host:demo tutorial`, with the same headless option.
Use `bun host:demo help` to list the available demos.

For an entity with a `Collider2D` or `Collider3D`, or for an SVG element in a 2D realm:

```ts
const listener = runtime.interactive(realmId, { type: 'collider', entityId });
const unsubscribe = listener.on('hover', (event) => console.log(event.pointer.position));
listener.on('click', () => console.log('clicked'));
unsubscribe();
listener.dispose();
```

Use `{ type: 'svg', svgId, elementId }` for an SVG element. The supported event types are
`hover`, `leave`, `move`, `down`, `up`, `click`, and `cancel`. When an entity has multiple
colliders, specify `colliderId`. Events use the most recently submitted presentation state.
When the registered entity or collider is removed, the listener is cancelled and disposed
after the next successful dispatch.
Currently this supports realms presented directly to a window. Traversal through textures
connecting realms is not implemented yet, and native animations of camera or model transforms
and camera field of view are not yet reflected in interaction snapshots. Occlusion is resolved
among registered interactive targets; geometry and colliders without listeners do not block them.

## Migration Guide

| Legacy Pattern                            | Modern `@galfus/engine` Pattern                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `parent` / `child` hierarchy              | `origin` (dependent) and `target` (reference) via `r3d.hierarchy.attach(origin, target, strategy)` |
| `Transform3DComponent` standalone         | Embedded inside `Model3DComponent.transform` (local + world matrices)                              |
| Standalone `Geometry3D` in ECS            | Realm resource via `realm.createGeometry(...)`                                                     |
| Direct Core transform writes in animation | Animation drives ECS `Model3DComponent`/`Model2DComponent`                                         |
| Viewport mutations via separate setters   | Unified `coordinator.updateInvocation(id, { viewport })`                                           |
| Fallbacks to ID `1` on missing component  | Explicit typed error thrown describing the missing component                                       |

The host APIs `runtime.onTick`, `animation.onEvent`, `world.clear`, `realm3d.attachMesh`,
the separate Multiverse invocation setters, `stepRealms`, and `syncAllRealms` have been removed.
Use `runtime.on('tick', ...)`, `animation.on('animation', ...)`, `world.reset`,
`realm3d.createMesh`, `multiverse.updateInvocation`, and the separate pre-render, sync, and
post-render stages respectively.
