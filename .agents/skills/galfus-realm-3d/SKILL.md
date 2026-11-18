---
name: galfus-realm-3d
description: >-
  Use this skill to build 3D scenes in Galfus Engine, including 3D cameras, PBR materials,
  directional/point/spot lighting with shadows, geometric primitives (cubes, spheres, planes),
  and 3D entity transforms.
---

# Galfus Engine 3D Realm (Realm3D)

`Realm3D` manages 3D scene graphs, physical PBR rendering, cameras, dynamic lights, shadow cascades, and 3D geometric meshes.

## 1. Creating a Realm3D Instance

A 3D realm is instantiated through the engine runtime:

```typescript
import { createRuntime, utils3D, type Model3DComponent } from '@galfus/engine';

const runtime = createRuntime(transport);
const realm3d = runtime.createRealm3D();
```

## 2. 3D Cameras

Cameras require a `cameraSlot` corresponding to a Multiverse `Invocation`:

```typescript
const camPosition: [number, number, number] = [0, 5, 10];
const camTarget: [number, number, number] = [0, 1, 0];

const camera = realm3d.createCamera(
  {
    fovY: 60, // Field of view in degrees
    near: 0.1,
    far: 1000.0,
    cameraSlot: 1
  },
  {
    position: camPosition,
    rotation: utils3D.quatFromLookAt(camPosition, camTarget)
  }
);
```

## 3. PBR Materials

Galfus uses metallic-roughness physically based rendering:

```typescript
// Standard diffuse material
const blueMat = realm3d.createMaterial({
  baseColor: [0.1, 0.4, 0.9, 1.0],
  metallic: 0.1,
  roughness: 0.8
}).materialId;

// Metallic reflective material
const goldMat = realm3d.createMaterial({
  baseColor: [1.0, 0.84, 0.0, 1.0],
  metallic: 0.95,
  roughness: 0.15
}).materialId;

// Textured material (via Texture ID)
const texturedMat = realm3d.createMaterial({
  baseColorTextureId: textureId,
  normalTextureId: normalMapId,
  metallic: 0.2,
  roughness: 0.5
}).materialId;
```

## 4. Lighting & Shadows

Galfus supports directional (sun), point, and spot lights with real-time shadow mapping:

```typescript
// Directional light with shadow casting
realm3d.createLight(
  {
    kind: 'directional',
    color: [1.0, 0.95, 0.85], // Warm sunlight
    intensity: 3.0,
    castShadow: true
  },
  {
    position: [10, 20, 10],
    rotation: utils3D.quatFromLookAt([10, 20, 10], [0, 0, 0])
  }
);

// Point light (omnidirectional with attenuation range)
realm3d.createLight(
  {
    kind: 'point',
    color: [1.0, 0.2, 0.1], // Red torch
    intensity: 5.0,
    range: 15.0,
    castShadow: false
  },
  { position: [0, 2, 0] }
);

// Spot light (cone angle attenuation)
realm3d.createLight(
  {
    kind: 'spot',
    color: [1.0, 1.0, 1.0],
    intensity: 4.0,
    range: 25.0,
    innerConeAngle: Math.PI / 8,
    outerConeAngle: Math.PI / 6,
    castShadow: true
  },
  {
    position: [0, 8, 0],
    rotation: utils3D.quatFromLookAt([0, 8, 0], [0, 0, 0])
  }
);
```

## 5. Primitive 3D Geometries

Spawn standard 3D meshes with custom transforms:

```typescript
// Cube / Box
const cube = realm3d.createCube(1.0, blueMat, {
  position: [0, 1, 0],
  scale: [1, 2, 1] // Scaled box
});

// Sphere
const sphere = realm3d.createSphere(0.75, 32, goldMat, {
  position: [3, 0.75, 0]
});

// Ground Plane
const ground = realm3d.createPlane(20.0, 20.0, groundMat, {
  position: [0, 0, 0]
});

// Cylinder
const pillar = realm3d.createCylinder(0.5, 4.0, 24, stoneMat, {
  position: [-3, 2, 0]
});
```

## 6. Manipulating Entity Transforms in Real-Time

Access the ECS `Model3DComponent` to update translation, rotation, and scale per frame:

```typescript
const model = realm3d.world.getComponent<Model3DComponent>(cube.entityId, 'Model3D');

let elapsed = 0;
runtime.on('tick', ({ dt }) => {
  elapsed += dt;

  // Rotate around Y axis
  const halfAngle = elapsed * 2.0 * 0.5;
  model?.setRotation(0, Math.sin(halfAngle), 0, Math.cos(halfAngle));

  // Translate up and down
  model?.setPosition(0, 1.0 + Math.sin(elapsed * 3.0) * 0.5, 0);
});
```

## Best Practices

- **Batch Material Creation**: Create reusable materials once and share `materialId` across multiple instances to minimize GPU pipeline state changes.
- **Directional Shadows**: Directional lights with shadows should point toward the center of action using `utils3D.quatFromLookAt`.
- **Coordinate System**: Galfus uses right-handed coordinates (+X right, +Y up, +Z forward/out of screen).
