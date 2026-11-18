---
name: galfus-realm-3d-helpers
description: >-
  Use this skill to load and instantiate 3D models from glTF, GLB, and ZIP archives using
  @galfus/gltf-loader, manage GPU asset caches, inspect node hierarchies, and trigger skeletal animations.
---

# Galfus 3D Helpers & glTF Loader

`@galfus/gltf-loader` is the official asset loading library for Galfus Engine. It parses standard glTF 2.0 (`.gltf`), monolithic binary (`.glb`), and compressed archive (`.zip`) files, uploading geometries, PBR materials, and textures directly into GPU memory.

## 1. Installation

```bash
bun add @galfus/gltf-loader
# or
npm install @galfus/gltf-loader
```

## 2. Loading a glTF / GLB Asset

`loadGltfAsset` accepts local file paths (Bun/Node), URLs (Browser/Web), raw `Uint8Array` buffers, or ArrayBuffers:

```typescript
import { createRuntime } from '@galfus/engine';
import { loadGltfAsset } from '@galfus/gltf-loader';

const runtime = createRuntime(transport);
const realm3d = runtime.createRealm3D();

// 1. Load asset into a two-stage GPU Asset Factory
const modelFactory = await loadGltfAsset(realm3d, 'assets/models/character.glb');
```

## 3. Instantiating 3D Models in the Scene

A single `GltfAssetFactory` can instantiate multiple independent copies in `Realm3D` with zero geometry duplication:

```typescript
// Spawn entity instance 1
const player = modelFactory.instantiate({
  transform: {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1], // Quaternion [x, y, z, w]
    scale: [1, 1, 1]
  }
});

// Spawn entity instance 2 (enemy)
const enemy = modelFactory.instantiate({
  transform: {
    position: [5, 0, 2],
    scale: [1.2, 1.2, 1.2]
  }
});

console.log('Root Entity ID:', player.rootEntity);
```

## 4. Playing glTF Embedded Animations

If the glTF file contains keyframe or skeletal animations, trigger them on the instance:

```typescript
// List available animations
console.log(
  'Available clips:',
  modelFactory.animations.map((a) => a.name)
);

// Play animation by name or index
player.playAnimation('Walk', {
  loop: true,
  speed: 1.0,
  crossFadeDuration: 0.2 // Smooth transition
});

// Update animation playback in the tick loop
runtime.on('tick', ({ dt }) => {
  player.update(dt);
});
```

## 5. Loading ZIP Model Archives

Galfus natively decompresses ZIP packages containing `.gltf`, external `.bin` buffers, and texture folders without extracting to disk:

```typescript
const environmentFactory = await loadGltfAsset(realm3d, 'assets/environments/sci-fi-lab.zip');

const level = environmentFactory.instantiate();
```

## 6. Compression Extensions (Meshopt & Draco)

`@galfus/gltf-loader` automatically detects and resolves `EXT_meshopt_compression` and `KHR_draco_mesh_compression` extensions at load time, decompressing vertex attributes into canonical GPU layouts transparently.

## 7. Custom Material Overrides

You can selectively replace or tweak materials during or after instantiation:

```typescript
// Inspect loaded materials
const materials = modelFactory.resources.materials;

// Override root material with custom shader/PBR settings
const customMat = realm3d.createMaterial({
  baseColor: [1.0, 0.0, 0.5, 1.0],
  metallic: 0.8,
  roughness: 0.2
}).materialId;
```

## Best Practices

1. **Preload Factories**: Call `loadGltfAsset` during your loading phase, then call `.instantiate()` whenever entities spawn during gameplay.
2. **Transform Hierarchy**: The `player.rootEntity` is parent to all child mesh nodes. Moving `player.rootEntity` translates the entire model.
3. **Clean Up**: When destroying an instance, remove entities via `realm3d.world.destroyEntity(player.rootEntity)`.
