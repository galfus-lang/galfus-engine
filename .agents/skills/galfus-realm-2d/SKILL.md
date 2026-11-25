---
name: galfus-realm-2d
description: >-
  Use this skill to build 2D scenes in Galfus Engine, including 2D orthographic cameras,
  sprites, chunked Tilemap2D with greedy colliders/shadows, 2D dynamic lighting, materials,
  sprite sheets, culling/LOD, layer masks, and 2D entity transforms.
---

# Galfus Engine 2D Realm (Realm2D)

`Realm2D` provides an optimized 2D rendering pipeline featuring batched quad sprites, 2D dynamic point lights, texture atlases, sprite sheets, and orthographic camera views.

## 1. Creating a Realm2D Instance

```typescript
import { createRuntime, type Model2DComponent, SpriteSheet } from '@galfus/engine';

const runtime = createRuntime(transport);
const realm2d = runtime.createRealm2D();
```

## 2. 2D Orthographic Camera

The 2D camera manages view offset and zoom scale:

```typescript
const camera = realm2d.createCamera(
  {
    cameraSlot: 1, // Matches Multiverse Invocation
    orthoScale: 10.0 // Orthographic vertical view height in world units
  },
  {
    position: [0, 0] // Center of the 2D world
  }
);
```

## 3. Materials & Textures

Materials define tint colors and diffuse textures for sprites:

```typescript
// Solid color material (returns numeric materialId directly)
const greenMat = realm2d.createMaterial({
  baseColor: [0.2, 0.8, 0.4, 1.0]
});

// Textured material
const textureId = runtime.resources.createTexture(pixelData, {
  width,
  height,
  format: 'rgba8UnormSrgb'
});
const texturedMat = realm2d.createMaterial({
  baseColor: [1.0, 1.0, 1.0, 1.0],
  textureId
});
```

## 4. Creating Sprites

Sprites are 2D textured or colored quads defined by dimensions and world transform:

```typescript
const playerSprite = realm2d.createSprite(
  {
    dimensions: [2.0, 2.0], // Width, Height in world units
    materialId: greenMat
  },
  {
    position: [0, 0],
    rotation: 0, // In radians
    scale: [1, 1]
  }
);
```

## 5. 2D Dynamic Lighting

`Realm2D` includes hardware-accelerated 2D lighting with smooth distance attenuation:

```typescript
const light = realm2d.createLight(
  {
    color: [1.0, 0.85, 0.6], // Warm candlelight
    intensity: 2.5,
    range: 12.0, // Attenuation radius
    lightRadius: 0.5, // Light source core radius
    castShadow: false,
    active: true
  },
  {
    position: [0, 2.0]
  }
);
```

## 6. Sprite Sheets & UV Animation

For pixel art, tilemaps, or animated character frames, use `SpriteSheet` to calculate sub-rectangle UVs:

```typescript
const sheet = new SpriteSheet({
  textureId,
  textureSize: [256, 256],
  grid: {
    columns: 8,
    rows: 8,
    frameSize: [32, 32]
  }
});

// playerSprite is an EntityId directly
const spriteModel = realm2d.world.getComponent<Model2DComponent>(playerSprite, 'Model2D');

// Switch to frame 4 (0-indexed)
sheet.applyToSprite(realm2d, playerSprite, 4);
```

## 7. Transforming 2D Entities in the Tick Loop

```typescript
let time = 0;
runtime.on('tick', ({ dt }) => {
  time += dt;

  // Move sprite in a circle
  const x = Math.cos(time * 2.0) * 3.0;
  const y = Math.sin(time * 2.0) * 3.0;

  spriteModel?.setPosition(x, y);
  spriteModel?.setRotation(time); // Rotate continuously
});
```

## 8. Layer Masks (`layerMask`)

2D cameras, sprites, shapes, lights, particle emitters, and UI models accept an optional 32-bit `layerMask` (default `0xffffffff`). A camera only renders items matching `(camera.layerMask & item.layerMask) !== 0`, and 2D lights only illuminate items matching `(light.layerMask & item.layerMask) !== 0`:

```typescript
const LAYER_WORLD = 0b0001;
const LAYER_UI = 0b0010;

realm2d.createCamera(
  { cameraSlot: 1, orthoScale: 10, layerMask: LAYER_WORLD },
  { position: [0, 0] }
);
realm2d.createSprite({ dimensions: [2, 2], materialId: greenMat, layerMask: LAYER_WORLD });
realm2d.createLight({ color: [1, 0.9, 0.7], intensity: 2, range: 10, layerMask: LAYER_WORLD });
```

## 9. Chunked Tilemap2D (`createTilemap`)

For large 2D tile worlds (`128×128+` tiles), use `realm2d.createTilemap(...)` with `32×32` dirty-cached chunks, per-chunk viewport/LOD culling, and optional greedy-merged Rapier 2D colliders & polar shadow occluders:

```typescript
import { packTileCells, TILE_FLAG } from '@galfus/engine';

const tilemap = realm2d.createTilemap(
  {
    width: 128,
    height: 128,
    tileSize: [1.0, 1.0],
    chunkSize: 32,
    atlasColumns: 4,
    atlasRows: 2,
    atlasSizePx: [256, 128], // Half-texel UV inset prevents atlas seams
    materialId: atlasMat,
    castShadow: true,
    receiveShadow: true,
    generateColliders: true
  },
  { position: [0, 0] }
);

// Bulk region upload (packed 4-byte TileCell2D wire format)
tilemap.setTiles(
  0,
  0,
  2,
  1,
  packTileCells([
    { tileId: 1, flags: 0 },
    { tileId: 3, flags: TILE_FLAG.SOLID | TILE_FLAG.BLOCKS_LIGHT }
  ])
);

// O(1) single-tile edit (rebuilds only the touched chunk)
tilemap.setTile(10, 12, 3, TILE_FLAG.SOLID | TILE_FLAG.BLOCKS_LIGHT);
```

## 10. Culling, Zoom-Aware LOD & Debug Observer

Sprites, shapes, and tilemaps support `cullingMode` (`'auto' | 'frustumOnly' | 'alwaysRender'`), `cullMargin`, and half-open `distanceRange: [start, end)` evaluated against `hypot(dx, dy, orthoScale)`. Cameras also accept `cullCameraSlot` to inspect another camera's culled view.

## Best Practices

- **Pixel Art Alignment**: For pixel-perfect 2D games, set camera zoom and sprite sizes to integer multiples of screen pixels.
- **Batched Rendering**: Sprites sharing the same `materialId` are automatically batched by the native engine for maximum performance.
- **Layering & Depth**: Use the Z component or render order to sort sprites (background, characters, foreground UI).
