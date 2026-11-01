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
import type { GlTF } from './types';
import { createZipResolver, findPrimaryGltfPath, isZipContainer, unpackZipArchive } from './zip';

export * from './animation';
export * from './bounds';
export * from './decoders/resolver';
export * from './factory';
export * from './instance';
export * from './parser';
export * from './resources';
export * from './scene';
export * from './types';
export * from './zip';
export * from '@galfus/model-loader-types';

/**
 * Resolves source input into a contiguous Uint8Array byte buffer.
 */
async function resolveSourceBytes(source: Uint8Array | ArrayBuffer | string): Promise<Uint8Array> {
  if (typeof source !== 'string') {
    return source instanceof Uint8Array ? source : new Uint8Array(source);
  }

  // HTTP(S) URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch glTF asset from "${source}": HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // Node.js or Bun local filesystem path
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    const nodeBuf = await readFile(source);
    return new Uint8Array(nodeBuf.buffer, nodeBuf.byteOffset, nodeBuf.byteLength);
  }

  // Fallback fetch for browser environments
  const res = await fetch(source);
  if (!res.ok) {
    throw new Error(`Failed to load glTF asset from "${source}": HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Loads a glTF 2.0 (.gltf, .glb, or .zip archive) asset into a high-performance two-stage GltfAssetFactory.
 *
 * Transparently accepts:
 * 1. Monolithic binary .glb containers (in memory or file path).
 * 2. Standalone .gltf JSON files with embedded data URIs.
 * 3. Compact .zip archives containing .gltf, .bin buffers, and texture subdirectories.
 *
 * Uploads all shared geometries, PBR materials, and textures to the GPU once,
 * resolving compression extensions (Draco, Meshopt) automatically.
 *
 * @param realm The destination Realm3D where resources and entities are instantiated.
 * @param source Raw glTF binary (.glb), JSON (.gltf), ZIP (.zip) bytes, or file path / URL.
 * @param options Optional import filters, node renamers, and camera/light toggles.
 * @returns Ready-to-use GltfAssetFactory for spawning ECS instances.
 *
 * @example
 * ```typescript
 * import { loadGltfAsset } from '@galfus/gltf-loader';
 *
 * // 1. Load from ZIP archive file path
 * const factoryA = await loadGltfAsset(realm, './models/character.zip');
 *
 * // 2. Load from raw GLB bytes
 * const factoryB = await loadGltfAsset(realm, glbData);
 *
 * const instance = factoryA.instantiate({ transform: { position: [0, 0, 0] } });
 * ```
 */
export async function loadGltfAsset(
  realm: Realm3D,
  source: Uint8Array | ArrayBuffer | string,
  options?: ModelImportOptions
): Promise<GltfAssetFactory> {
  const bytes = await resolveSourceBytes(source);

  let gltf: GlTF;
  let buffers: Uint8Array[];
  let externalResolver: ((uri: string) => Promise<Uint8Array>) | undefined;

  // A) Check if source is a ZIP archive
  if (isZipContainer(bytes)) {
    const fileMap = unpackZipArchive(bytes);
    const primaryGltfPath = findPrimaryGltfPath(fileMap);
    if (!primaryGltfPath) {
      throw new Error(
        'Invalid ZIP model archive: no .gltf or .glb file found in the decompressed directory tree'
      );
    }
    const primaryBytes = fileMap.get(primaryGltfPath)!;
    externalResolver = createZipResolver(fileMap, primaryGltfPath);
    const parsed = await parseGltf(primaryBytes, externalResolver);
    gltf = parsed.gltf;
    buffers = parsed.buffers;
  } else {
    // B) Standard GLB binary or standalone glTF JSON
    const parsed = await parseGltf(bytes);
    gltf = parsed.gltf;
    buffers = parsed.buffers;
  }

  // 2. Automatically resolve required compression decoders (Draco, Meshopt)
  const decoders = await resolveDecoders(gltf, options?.decoders);

  // 3. Upload shared GPU resources (geometries in canonical 136-byte format, PBR materials, textures)
  const resources = await uploadGltfResources(realm, gltf, buffers, decoders, externalResolver);

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
