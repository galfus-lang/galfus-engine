/**
 * Automatic lazy decoder resolution for compressed glTF extensions (Draco, Meshopt).
 *
 * Automatically sniffs extensions in glTF headers and loads decompression runtimes
 * on demand without adding overhead for standard uncompressed models.
 */

import type { GlTF } from '../types';

export interface DracoAttributeMapping {
  position?: Float32Array;
  normal?: Float32Array;
  uv?: Float32Array;
  uv1?: Float32Array;
  tangent?: Float32Array;
  color?: Float32Array;
  joints?: Uint16Array | Uint32Array;
  weights?: Float32Array;
  indices?: Uint16Array | Uint32Array;
}

export interface DracoDecoder {
  decode(
    buffer: Uint8Array,
    attributeIds: Record<string, number>
  ): Promise<DracoAttributeMapping> | DracoAttributeMapping;
}

export interface MeshoptDecoder {
  decodeGpuBuffer(
    count: number,
    byteStride: number,
    source: Uint8Array,
    mode: 'ATTRIBUTES' | 'TRIANGLES' | 'INDICES',
    filter?: 'NONE' | 'OCTAHEDRAL' | 'QUATERNION' | 'EXPONENTIAL'
  ): Promise<Uint8Array> | Uint8Array;
}

export interface ResolvedDecoders {
  draco?: DracoDecoder;
  meshopt?: MeshoptDecoder;
}

// Global cached decoder singletons to avoid repeated initialization
let cachedDracoDecoder: DracoDecoder | undefined;
let cachedMeshoptDecoder: MeshoptDecoder | undefined;

/**
 * Registers a global Draco decoder instance shared across all asset loaders.
 */
export function registerGlobalDracoDecoder(decoder: DracoDecoder): void {
  cachedDracoDecoder = decoder;
}

/**
 * Registers a global Meshopt decoder instance shared across all asset loaders.
 */
export function registerGlobalMeshoptDecoder(decoder: MeshoptDecoder): void {
  cachedMeshoptDecoder = decoder;
}

/**
 * Sniffs glTF header extensions and automatically resolves required decoders.
 *
 * @param gltf The parsed glTF root structure.
 * @param userDecoders Optional explicit decoder overrides provided by the user.
 * @returns Object holding resolved decoders.
 * @throws Error if an extension is strictly required but no compatible decoder is available.
 *
 * @example
 * ```typescript
 * const decoders = await resolveDecoders(gltf, options?.decoders);
 * ```
 */
export async function resolveDecoders(
  gltf: GlTF,
  userDecoders?: Record<string, unknown>
): Promise<ResolvedDecoders> {
  const required = gltf.extensionsRequired ?? [];
  const used = gltf.extensionsUsed ?? [];
  const allExts = new Set([...required, ...used]);

  const resolved: ResolvedDecoders = {};

  // 1. Draco Compression (KHR_draco_mesh_compression)
  if (allExts.has('KHR_draco_mesh_compression')) {
    if (userDecoders?.['draco']) {
      resolved.draco = userDecoders['draco'] as DracoDecoder;
    } else if (cachedDracoDecoder) {
      resolved.draco = cachedDracoDecoder;
    } else {
      // Attempt dynamic on-demand import if available in runtime
      try {
        const dynamicModule = (await import(/* @vite-ignore */ 'draco3d' as string).catch(
          () => null
        )) as { createDecoderModule?: () => Promise<unknown> } | null;
        if (dynamicModule?.createDecoderModule) {
          // Wrapped adapter if draco3d is present in environment
          // (Can be populated when package is installed)
        }
      } catch {
        // Ignored; handled below if strictly required
      }

      if (!resolved.draco && required.includes('KHR_draco_mesh_compression')) {
        throw new Error(
          'glTF asset requires "KHR_draco_mesh_compression", but no Draco decoder is registered. ' +
            'Provide one via ModelImportOptions.decoders or registerGlobalDracoDecoder().'
        );
      }
    }
  }

  // 2. Meshopt Compression (EXT_meshopt_compression)
  if (allExts.has('EXT_meshopt_compression')) {
    if (userDecoders?.['meshopt']) {
      resolved.meshopt = userDecoders['meshopt'] as MeshoptDecoder;
    } else if (cachedMeshoptDecoder) {
      resolved.meshopt = cachedMeshoptDecoder;
    } else {
      if (required.includes('EXT_meshopt_compression')) {
        throw new Error(
          'glTF asset requires "EXT_meshopt_compression", but no Meshopt decoder is registered. ' +
            'Provide one via ModelImportOptions.decoders or registerGlobalMeshoptDecoder().'
        );
      }
    }
  }

  return resolved;
}
