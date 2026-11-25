---
name: galfus-realm-3d
description: >-
  Use this skill to build 3D scenes in Galfus Engine, including 3D cameras, PBR materials,
  Parallax Occlusion Mapping (POM), directional/point/spot lighting with shadows, geometric
  primitives, culling/LOD/Hi-Z occlusion, layer masks, core-owned IK & skinning, Forward PBR
  decals/occluded projectors, and UV-space tattoo baking.
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

// Textured material with Parallax Occlusion Mapping (POM)
const texturedMat = realm3d.createMaterial({
  albedoTextureId: textureId,
  normalTextureId: normalMapId,
  heightTextureId: heightMapId, // Grayscale heightmap (1.0 = top, 0.0 = deepest recess)
  parallaxScale: 0.025, // UV depth scale (0.0 disables POM)
  parallaxMinLayers: 8,
  parallaxMaxLayers: 24,
  parallaxFadeDistance: 40.0,
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
    spotInnerAngleRad: Math.PI / 8,
    spotOuterAngleRad: Math.PI / 6,
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

// Sphere (radius, rings, sectors, materialId, transform)
const sphere = realm3d.createSphere(0.75, 16, 32, goldMat, {
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

## 7. Layer Masks (`layerMask`)

Cameras, models, instanced models, lights, particle emitters, portals, and projectors all accept an optional 32-bit `layerMask` (default `0xffffffff`). A camera or light only affects objects where `(a.layerMask & b.layerMask) !== 0`:

```typescript
const LAYER_WORLD = 0b0001;
const LAYER_OVERLAY = 0b0010;

const cam = realm3d.createCamera({
  fovY: 50,
  near: 0.1,
  far: 200,
  cameraSlot: 1,
  layerMask: LAYER_WORLD
});
realm3d.createModel({ geometryId, materialId, layerMask: LAYER_OVERLAY }, { position: [0, 2, 0] });
```

## 8. Core-Owned Inverse Kinematics (IK) & Skinning

Skeletal skins (`realm3d.createSkin`) and 3D IK (`twoBone`, `fabrik`, `lookAt`) run natively in core `prepare()` between hierarchy resolution and skinning:

```typescript
// 2-bone analytic IK (legs/arms) with pole hint
realm3d.setIkConstraint(1, {
  type: 'twoBone',
  rootId: hipModelId,
  midId: kneeModelId,
  effectorId: footModelId,
  target: [0, 0.2, 0],
  poleTarget: [0, 1.5, 2.0]
});

// Multi-joint FABRIK chain with optional poleTarget to control bend plane (e.g. spider leg arching +Y)
realm3d.setIkConstraint(2, {
  type: 'fabrik',
  chain: [coxaId, femurId, tibiaId, tipId],
  target: [0, 1.0, 3.0],
  poleTarget: [0, 12.0, 1.2],
  iterations: 12,
  tolerance: 0.005
});

// Aim / Look-At constraint
realm3d.setIkConstraint(3, {
  type: 'lookAt',
  entityId: turretModelId,
  target: [2, 2, 0],
  forwardAxis: [0, 0, -1],
  upAxis: [0, 1, 0]
});

// Fast per-frame target update (or animate natively via AnimationTarget kind 'ik3DTarget')
realm3d.setIkTarget(2, [newX, newY, newZ]);
```

> [!NOTE]
> Entities driven directly by a world-space `twoBone` or `fabrik` chain should be independent entities (do not link them with `hierarchy.attach`), as the IK solver maintains segment lengths and orientations directly.

## 9. Forward PBR Decals & Occluded Texture Projectors

`Projector3D` is an ECS component evaluated before Forward+ PBR lighting (so decals and projections receive scene lights, shadows, roughness, and metallic). Supports orthographic decals and perspective projectors with Reverse-Z depth occlusion:

```typescript
import type { Projector3DComponent } from '@galfus/engine';

const { entityId, projectorId } = realm3d.createProjector(
  {
    kind: 'perspective', // 'orthographic' | 'perspective'
    blendMode: 'alpha', // 'alpha' | 'multiply' | 'additive'
    textureId: goboTexId,
    color: [1, 1, 1, 0.9],
    fovY: (42 * Math.PI) / 180,
    aspect: 1.25,
    near: 0.3,
    far: 12.0,
    layerMask: LAYER_WORLD, // Surfaces receiving the projection
    occlusionMask: LAYER_WORLD | LAYER_OCCLUDER, // Surfaces blocking the projection
    castOcclusion: true
  },
  { position: [3, 2.5, 3], rotation: utils3D.quatFromLookAt([3, 2.5, 3], [3, 2.4, -4]) }
);

// Update properties without recreating or losing transform:
const proj = realm3d.world.getComponent<Projector3DComponent>(entityId, 'Projector3D');
if (proj) {
  proj.desc.castOcclusion = false;
  proj.isDirty = true;
}
```

## 10. UV-Space Decal Baking (Tattoos & Permanent Stamps)

For decals that must deform permanently with animated/skinned meshes (tattoos, scars, body paint) at zero per-frame cost, stamp directly into the model's albedo/emissive texture in UV space:

```typescript
realm3d.bakeUvDecal(
  {
    modelId: characterModelId,
    targetTextureId: skinAlbedoTexId, // Default logical textures already include renderAttachment usage
    decalTextureId: tattooTexId,
    kind: 'orthographic',
    blendMode: 'alpha',
    color: [1, 1, 1, 0.95],
    size: [0.8, 0.8, 2.0],
    angleFade: 0.3,
    useSkinnedPose: true, // Stamps against the active skeletal/morph pose
    clearTarget: false
  },
  { position: stampPos, rotation: utils3D.quatFromLookAt(stampPos, hitPoint), scale: [1, 1, 1] }
);
```

## 11. Culling, Distance LOD & GPU Hi-Z Occlusion

Models and instanced models support `cullingMode` (`'auto' | 'frustumOnly' | 'alwaysRender'`), `cullMargin`, half-open `distanceRange: [start, end)` (Euclidean distance, consistent across main and shadow passes), and `isOccluder` (marks opaque geometry that populates the GPU Reverse-Z Hi-Z depth pyramid). Cameras accept `cullCameraSlot` to render another camera's culled result.

## Best Practices

- **Batch Material Creation**: Create reusable materials once and share `materialId` across multiple instances to minimize GPU pipeline state changes.
- **Directional Shadows**: Directional lights with shadows should point toward the center of action using `utils3D.quatFromLookAt`.
- **Up Vector for Vertical Projections**: When using `utils3D.quatFromLookAt` straight down `(0, -1, 0)` (e.g. floor decals), pass a non-collinear up vector such as `[0, 0, -1]`.
- **Coordinate System**: Galfus uses right-handed coordinates (+X right, +Y up, +Z forward/out of screen).
