/**
 * @module @galfus/gltf-loader
 *
 * Canonical glTF 2.0 and GLB asset loader for Galfus Engine.
 * Supports auto-decoders, two-stage GPU asset caching, skeletal skinning,
 * animation clips, GPU instancing, and modular sub-factories.
 */

import type { Realm3D } from '@galfus/engine';
import type { ModelImportOptions } from '@galfus/model-loader-types';
import { resolveDecoders } from './decoders/resolver';
import { GltfAssetFactory } from './factory';
import { parseGltf } from './parser';
import { uploadGltfResources } from './resources';

export * from './animation';
export * from './decoders/resolver';
export * from './factory';
export * from './instance';
export * from './parser';
export * from './resources';
export * from './scene';
export * from './types';
export * from '@galfus/model-loader-types';

/**
 * Loads a glTF 2.0 (.gltf or .glb) asset into a high-performance two-stage GltfAssetFactory.
 *
 * Uploads all shared geometries, PBR materials, and textures to the GPU once,
 * resolving compression extensions (Draco, Meshopt) automatically.
 *
 * @param realm The destination Realm3D where resources and entities are instantiated.
 * @param data Raw glTF binary (.glb) or JSON (.gltf) bytes.
 * @param options Optional import filters, node renamers, and camera/light toggles.
 * @returns Ready-to-use GltfAssetFactory for spawning ECS instances.
 *
 * @example
 * ```typescript
 * import { loadGltfAsset } from '@galfus/gltf-loader';
 *
 * const factory = await loadGltfAsset(realm, glbData, {
 *   filter: (node) => !node.name?.startsWith('Editor_')
 * });
 *
 * const instanceA = factory.instantiate({ transform: { position: [0, 0, 0] } });
 * const instanceB = factory.instantiate({ transform: { position: [10, 0, 0] } });
 * ```
 */
export async function loadGltfAsset(
  realm: Realm3D,
  data: Uint8Array | ArrayBuffer,
  options?: ModelImportOptions
): Promise<GltfAssetFactory> {
  // 1. Parse GLB binary or glTF JSON container
  const { gltf, buffers } = parseGltf(data);

  // 2. Automatically resolve required compression decoders (Draco, Meshopt)
  const decoders = await resolveDecoders(gltf, options?.decoders);

  // 3. Upload shared GPU resources (geometries in canonical 136-byte format, PBR materials, textures)
  const resources = await uploadGltfResources(realm, gltf, buffers, decoders);

  // 4. Construct and return primary asset factory
  const assetName = gltf.asset.generator ?? 'glTF_Asset';
  return new GltfAssetFactory({
    assetName,
    realm,
    gltf,
    buffers,
    resources,
    importOptions: options
  });
}
