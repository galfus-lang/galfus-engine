# @galfus/engine

The official TypeScript high-level engine runtime for **Galfus Engine**. Provides an ECS-driven architecture, incremental dirty-flag synchronization, anchor-based transform hierarchy, 2D/3D realms, multiverse composition, and spatial audio.

---

## Getting Started

### 1. Installation

Install `@galfus/engine` alongside your preferred platform transport:

```bash
# For Bun runtime (native FFI)
bun add @galfus/engine @galfus/transport-bun

# For Node.js runtime (Node-API)
npm install @galfus/engine @galfus/transport-node

# For Web Browser (WASM / WebGPU)
npm install @galfus/engine @galfus/transport-browser
```

> [!IMPORTANT]
> Because Galfus packages are distributed directly in TypeScript (ESM), browser projects require a modern bundler/compiler such as [Vite](https://vitejs.dev), esbuild, or Webpack to compile TypeScript and serve WASM assets.

### 2. 3D Realm Quick Start

This example creates a window, initializes a 3D realm with a shaded cube, sets up camera and lighting, and displays the scene via a Multiverse Invocation:

```typescript
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';

// 1. Initialize transport and runtime
const transport = createBunTransport({ targetFps: 60, headless: false });
const runtime = createRuntime(transport);
const windowId = runtime.platform.window.create({ title: 'Galfus 3D Engine', size: [1280, 720] });

// 2. Create 3D Realm and resources
const realm3d = runtime.createRealm3D(1);
const { geometryId } = realm3d.createGeometry({ kind: 'cube', size: 1.0 });
const { materialId } = realm3d.createMaterial({
  baseColor: [0.9, 0.4, 0.15, 1.0],
  metallic: 0.2,
  roughness: 0.4
});

// 3. Create Model entity
const cubeEntity = realm3d.createModel({ geometryId, materialId }, { position: [0, 0, 0] });

// 4. Set up Camera and Light
const camera = realm3d.createCamera(
  { fovY: Math.PI / 4, near: 0.1, far: 1000 },
  { position: [0, 3, 6] }
);
realm3d.setCameraLookAt(camera, { target: [0, 0, 0], up: [0, 1, 0] });

realm3d.createLight(
  { kind: 'directional', color: [1, 1, 1], intensity: 2.5 },
  { position: [5, 10, 5], rotation: [0, 0, 0, 1] }
);

// 5. Compose onto Window via Multiverse Target and Invocation
const targetId = runtime.multiverse.createTarget({
  kind: { type: 'window', windowId }
});

runtime.multiverse.createInvocation({
  realmId: realm3d.realmId,
  targetId,
  viewport: { width: { vw: 100 }, height: { vh: 100 } }
});

// 6. Update entity transforms and run loop
runtime.on('tick', ({ dt }) => {
  const comp = realm3d.world.getComponent(cubeEntity, 'Model3D');
  if (comp) {
    comp.transform.rotation[1] += dt * 0.8;
  }
});

runtime.start();
```

### 3. 2D Realm Quick Start

```typescript
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';

const transport = createBunTransport({ targetFps: 60, headless: false });
const runtime = createRuntime(transport);
const windowId = runtime.platform.window.create({ title: 'Galfus 2D Scene', size: [800, 600] });

const realm2d = runtime.createRealm2D(1);
const matFloor = realm2d.createMaterial({
  surfaceType: 'opaque',
  baseColor: [0.15, 0.18, 0.25, 1.0]
});
const matPlayer = realm2d.createMaterial({
  surfaceType: 'opaque',
  baseColor: [0.2, 0.8, 0.95, 1.0]
});

// Create 2D Background Sprite and Player Circle
realm2d.createSprite(
  { dimensions: [20, 15], materialId: matFloor },
  { position: [0, 0], zLayer: -1 }
);
const player = realm2d.createShape(
  { kind: 'circle', radius: 0.8, segments: 32, materialId: matPlayer },
  { position: [0, 0], zLayer: 0 }
);

const targetId = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
runtime.multiverse.createInvocation({
  realmId: realm2d.realmId,
  targetId,
  viewport: { width: { vw: 100 }, height: { vh: 100 } }
});

runtime.start();
```

### 4. Frame Lifecycle & Loops

The engine provides two loop hooks:

- `runtime.on('tick', ({ dt, time }) => ...)`: Invoked before rendering. Use for input handling, animation updates, visual interpolation, and camera controls.
- `runtime.on('fixedTick', ({ fixedDt, fixedStepIndex }) => ...)`: Invoked at deterministic fixed intervals (default 60 Hz). Use for gameplay logic and physics simulation.

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

`textInput` is the committed text stream; `input.text` and `imeCommit.text` remain available as raw platform details. Text editors should insert from `textInput` only to avoid processing the same text twice. High-level focus management (`Focusable`, `FocusManager`), Unicode text editing (`TextEditor`, `applyTextKeyboardEvent`), and SVG text inputs (`TextInput`, `SvgTextDecorations`, `textInputGeometry`) are provided by `@galfus/ui` via `createUi(runtime)`.

`runtime.svg.getTextLayout(realmId, svgId, elementId)` returns shaped cluster metrics on demand.
The result contains normalized text chunks, cluster byte ranges within those UTF-8 chunks,
advances, ascent and descent, text direction, and affine transforms in SVG viewport coordinates.
The host caches the result until the SVG or font data changes; missing or non-rendered text
returns `undefined`. SVG whitespace normalization may change chunk text from the original source,
and a cluster can contain multiple graphemes, so these metrics alone do not yet define every
editor caret position. Empty text is not currently returned by the SVG parser.

For explicit text/byte conversions, each runtime defaults to UTF-8. Set `createRuntime(transport, { charset: 'shift_jis' })` or call `runtime.textEncoding.setCharset('windows-1252')`, then use `runtime.textEncoding.encode(text)` and `decode(bytes)`. This setting does not restrict or recode editor strings or change the platform ABI. Unknown charsets throw; invalid bytes and characters not representable in the chosen charset are replaced according to the codec.

---

## SVG element bounds

`runtime.svg.getRect(realmId, svgId, elementId)` returns the geometric bounds of an SVG
element or `undefined` if it cannot be found. The result is expressed in the SVG viewport's
coordinates (top-left origin, Y down), before the entity transform. `viewportWidth` and
`viewportHeight` describe that coordinate space. Bounds are cached and refreshed after SVG
edits, font changes, re-creation, and native attribute animations.

## Pointer interaction

Run `bun host:demo interaction` to try direct 2D, SVG, and 3D interaction in a window.
Run `bun host:demo text-input` to try multiple SVG text fields and Tab/Shift+Tab focus.
To test characters outside the bundled font, pass `--font /path/to/font.ttf` (TTF, OTF, or TTC).
The demo draws the keyboard caret and selection for single-line text; positions inside a ligature
are estimated because the current layout API does not expose ligature caret positions.
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
`hover`, `leave`, `move`, `down`, `up`, `click`, `cancel`, `pressmove`, and `pressup`.
`pressmove` and `pressup` go to the target originally pressed even when the pointer is no
longer over it, as long as the platform continues delivering pointer events; `cancel` ends
the interaction when the pointer or window is lost. When an entity has multiple
colliders, specify `colliderId`. Events use the most recently submitted presentation state.
When the registered entity or collider is removed, the listener is cancelled and disposed
after the next successful dispatch.
Pointer and focus interaction supports direct window presentations as well as trans-realm
traversal across texture targets connected via `multiverse.bindTargetTexture` and
`multiverse.connectPresentationSurface` (try `bun host:demo trans-realm`). Native animations
of camera or model transforms and camera field of view are not yet reflected in interaction
snapshots. Occlusion is resolved among registered interactive targets; geometry and colliders
without listeners do not block them.

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
