# @galfus/gltf-loader

Canonical **glTF 2.0** and **GLB** asset loader for the **Galfus Engine** ecosystem.

Implements the official Khronos glTF 2.0 specification with automatic compression decoders (Draco, Meshopt), two-stage GPU asset caching, skeletal skinning, animation clips, GPU instancing (`EXT_mesh_gpu_instancing`), and modular sub-factories.

---

## Features

- **Dual Format Support**: Seamlessly loads both binary `.glb` containers and text `.gltf` files with embedded Base64 data URIs or binary chunks.
- **Two-Stage Asset Lifecycle**:
  - `GltfAssetFactory`: Uploads shared geometries (packed into Galfus canonical 136-byte stride), PBR materials, and textures to the GPU **once**.
  - `GltfInstance`: Spawns lightweight, independent ECS entities sharing the pre-uploaded GPU assets.
- **Modular Sub-Factories (`createSubFactory`)**: Isolate and instantiate individual sub-trees or alternate scenes from modular asset packs without duplicating VRAM.
- **Auto-Decoders (Zero Configuration)**: Automatically detects `KHR_draco_mesh_compression` and `EXT_meshopt_compression` extensions in headers and initializes decoders on demand.
- **Hardware GPU Instancing**: Automatically maps `EXT_mesh_gpu_instancing` nodes to Galfus native 32-float instance buffers, rendering thousands of objects in a single draw call.
- **Skeletal Skinning & Animations**: Binds glTF skins to `Skin3DComponent` (solved via `HierarchyCoordinator`) and compiles multi-channel animations for `AnimationPlayer3DComponent`.

---

## Installation

```bash
bun add @galfus/gltf-loader @galfus/model-loader-types @galfus/engine
```

---

## Usage

### 1. Basic Loading and Instantiation

```typescript
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';
import { loadGltfAsset } from '@galfus/gltf-loader';

// Initialize engine and 3D Realm
const transport = await createBunTransport({ targetFps: 60 });
const runtime = createRuntime(transport);
const realm3d = runtime.createRealm3D(1);

// Load GLB file bytes
const glbData = await Bun.file('models/character.glb').bytes();
const factory = await loadGltfAsset(realm3d, glbData);

// Spawn multiple characters sharing the same GPU mesh & textures
const char1 = factory.instantiate({ transform: { position: [0, 0, 0] } });
const char2 = factory.instantiate({ transform: { position: [5, 0, 0] } });

// Play animations
char1.animationPlayer?.play('Run', 'repeat');

// Cleanup:
char1.dispose(); // Destroys only char1 ECS entities
factory.dispose(); // Destroys all instances and purges VRAM textures/meshes
```

---

### 2. Modular Sub-Factories (Asset Kits)

```typescript
// Load a dungeon kit containing multiple modular pieces in one GLB
const dungeonKit = await loadGltfAsset(realm3d, dungeonKitBytes);

// Create sub-factories for specific modular pieces
const wallFactory = dungeonKit.createSubFactory('Wall_Straight');
const doorFactory = dungeonKit.createSubFactory('Door_Arch');

// Instantiate 20 walls with zero VRAM duplication
for (let i = 0; i < 20; i++) {
  wallFactory.instantiate({ transform: { position: [i * 2, 0, 0] } });
}

// Destroy only the walls
wallFactory.disposeAllInstances();
```

---

### 3. Granular Entity Queries and Attachment

```typescript
const instance = factory.instantiate();

// Query entity by name assigned in authoring tool (e.g. Blender)
const handEntity = instance.getEntityByName('RightHand');
if (handEntity !== undefined) {
  // Attach accessory to bone
  realm3d.hierarchy.attach(swordEntity, handEntity);
}
```
