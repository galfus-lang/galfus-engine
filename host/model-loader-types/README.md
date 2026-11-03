# @galfus/model-loader-types

Format-agnostic 3D model loader contracts, factory specifications, and instance lifecycles for the **Galfus Engine** ecosystem.

---

## Overview

`@galfus/model-loader-types` establishes the universal architecture for importing 3D assets into `@galfus/engine`. Whether loading glTF/GLB, OBJ, FBX, USDZ, or VOX models, loaders adhering to this contract offer consistent:

- **Two-Stage Loading**: Upload shared GPU assets (geometries, materials, textures) once in `ModelAssetFactory`, and spawn multiple lightweight ECS `ModelInstance`s.
- **Sub-Factories (`SubModelAssetFactory`)**: Isolate and instantiate specific sub-trees or alternative scenes from modular asset kits without duplicating GPU resources.
- **Granular Lifecycle Control**: `instance.dispose()` frees only ECS entities, while `factory.dispose()` performs full VRAM asset teardown.
- **Selective Node Filtering**: Filter and rename nodes using `ModelImportOptions`.

---

## Key Interfaces

- **`ModelAssetFactory`**: Root asset factory containing shared geometry, material, and texture IDs.
- **`ModelInstance`**: An active ECS instance with entity lookups (`getEntityByName`, `getEntitiesByMetadata`) and animation playback.
- **`SubModelAssetFactory`**: Scoped factory for modular sub-trees and multi-scene files.
- **`ModelNodeDesc`**: Descriptive node metadata consumed by filters and renamers.
- **`ModelImportOptions`**: Import-time filtering, node renaming, and camera/light toggles.
- **`ModelInstantiateOptions`**: Spawn-time spatial transform and parent entity hierarchy attachment.

---

## Example Loader Implementation

```typescript
import type {
  ModelAssetFactory,
  ModelInstance,
  ModelImportOptions
} from '@galfus/model-loader-types';
import type { Realm3D } from '@galfus/engine';

export async function loadCustomModel(
  realm: Realm3D,
  data: Uint8Array,
  options?: ModelImportOptions
): Promise<ModelAssetFactory> {
  // 1. Parse custom format and upload shared GPU assets
  // 2. Return compliant ModelAssetFactory
}
```
