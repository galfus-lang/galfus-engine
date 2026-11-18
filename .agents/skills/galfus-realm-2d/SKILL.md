---
name: galfus-realm-2d
description: >-
  Use this skill to build 2D scenes in Galfus Engine, including 2D orthographic cameras,
  sprites, 2D dynamic lighting, materials, sprite sheets, and 2D entity transforms.
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
// Solid color material
const greenMat = realm2d.createMaterial({
  baseColor: [0.2, 0.8, 0.4, 1.0]
}).materialId;

// Textured material
const textureId = runtime.resources.createTextureFromRgba(width, height, pixelData);
const texturedMat = realm2d.createMaterial({
  baseColor: [1.0, 1.0, 1.0, 1.0],
  textureId
}).materialId;
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
  textureWidth: 256,
  textureHeight: 256,
  frameWidth: 32,
  frameHeight: 32
});

const spriteModel = realm2d.world.getComponent<Model2DComponent>(playerSprite.entityId, 'Model2D');

// Switch to frame 4 (0-indexed)
const uv = sheet.getFrameUv(4);
spriteModel?.setUvOffset(uv.u, uv.v, uv.width, uv.height);
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

## Best Practices

- **Pixel Art Alignment**: For pixel-perfect 2D games, set camera zoom and sprite sizes to integer multiples of screen pixels.
- **Batched Rendering**: Sprites sharing the same `materialId` are automatically batched by the native engine for maximum performance.
- **Layering & Depth**: Use the Z component or render order to sort sprites (background, characters, foreground UI).
