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

## Migration Guide

| Legacy Pattern                            | Modern `@galfus/engine` Pattern                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `parent` / `child` hierarchy              | `origin` (dependent) and `target` (reference) via `r3d.hierarchy.attach(origin, target, strategy)` |
| `Transform3DComponent` standalone         | Embedded inside `Model3DComponent.transform` (local + world matrices)                              |
| Standalone `Geometry3D` in ECS            | Realm resource via `realm.createGeometry(...)`                                                     |
| Direct Core transform writes in animation | Animation drives ECS `Model3DComponent`/`Model2DComponent`                                         |
| Viewport mutations via separate setters   | Unified `coordinator.updateInvocation(id, { viewport })`                                           |
| Fallbacks to ID `1` on missing component  | Explicit typed error thrown describing the missing component                                       |
