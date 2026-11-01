/**
 * Shared GPU resource extraction and uploading for glTF geometries, PBR materials, and textures.
 */

import type { Realm3D } from '@galfus/engine';
import type { ResolvedDecoders } from './decoders/resolver';
import { readAccessor } from './parser';
import type { GlTF, GlTFPrimitive } from './types';

export interface UploadedGltfResources {
  geometryMap: Map<string, number>; // key: `${meshIndex}_${primitiveIndex}` -> geometryId
  materialMap: Map<number, number>; // gltfMaterialIndex -> realmMaterialId
  textureMap: Map<number, number>; // gltfTextureIndex -> realmTextureId
  createdGeometryIds: number[];
  createdMaterialIds: number[];
  createdTextureIds: number[];
}

/**
 * Extracts raw image bytes from a glTF image descriptor.
 */
async function getImageBytes(
  gltf: GlTF,
  buffers: Uint8Array[],
  imageIndex: number,
  externalResolver?: (uri: string) => Promise<Uint8Array>
): Promise<Uint8Array | undefined> {
  const image = gltf.images?.[imageIndex];
  if (!image) return undefined;

  if (image.bufferView !== undefined) {
    const bv = gltf.bufferViews?.[image.bufferView];
    if (bv) {
      const buffer = buffers[bv.buffer];
      if (buffer) {
        const start = bv.byteOffset ?? 0;
        return buffer.subarray(start, start + bv.byteLength);
      }
    }
  }

  if (image.uri && image.uri.startsWith('data:')) {
    const commaIdx = image.uri.indexOf(',');
    if (commaIdx !== -1) {
      const b64 = image.uri.slice(commaIdx + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
  }

  if (image.uri && externalResolver) {
    try {
      return await externalResolver(image.uri);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Maps glTF 2.0 primitive rendering mode to the Galfus Engine PrimitiveTopology3D enum.
 *
 * glTF specification:
 * - 0: POINTS         -> 0 (Points)
 * - 1: LINES          -> 1 (Lines)
 * - 2: LINE_LOOP      -> 2 (LineStrip)
 * - 3: LINE_STRIP     -> 2 (LineStrip)
 * - 4: TRIANGLES      -> 3 (Triangles / TriangleList)
 * - 5: TRIANGLE_STRIP -> 4 (TriangleStrip)
 */
function mapGltfPrimitiveTopology(mode?: number): number {
  switch (mode) {
    case 0:
      return 0; // Points
    case 1:
      return 1; // Lines
    case 2:
    case 3:
      return 2; // LineStrip
    case 5:
      return 4; // TriangleStrip
    case 4:
    default:
      return 3; // Triangles
  }
}

/**
 * Uploads all shared geometries, textures, and PBR materials to the GPU for a glTF asset.
 *
 * @param realm The destination Realm3D.
 * @param gltf The root glTF descriptor.
 * @param buffers Array of resolved binary buffers.
 * @param decoders Object holding optional active decoders (Draco, Meshopt).
 * @param externalResolver Optional resolver callback for loading relative external assets.
 * @returns Map of created GPU resource handles and ID registries.
 *
 * @example
 * ```typescript
 * const resources = await uploadGltfResources(realm, gltf, buffers, decoders);
 * console.log(`Uploaded ${resources.createdGeometryIds.length} geometries to VRAM`);
 * ```
 */
export async function uploadGltfResources(
  realm: Realm3D,
  gltf: GlTF,
  buffers: Uint8Array[],
  decoders: ResolvedDecoders,
  externalResolver?: (uri: string) => Promise<Uint8Array>
): Promise<UploadedGltfResources> {
  const textureMap = new Map<number, number>();
  const materialMap = new Map<number, number>();
  const geometryMap = new Map<string, number>();

  const createdTextureIds: number[] = [];
  const createdMaterialIds: number[] = [];
  const createdGeometryIds: number[] = [];

  // Determine which textures are used as sRGB color maps (baseColor / emissive / diffuse)
  const srgbTextureIndices = new Set<number>();
  if (gltf.materials) {
    for (const mat of gltf.materials) {
      if (mat.pbrMetallicRoughness?.baseColorTexture) {
        srgbTextureIndices.add(mat.pbrMetallicRoughness.baseColorTexture.index);
      }
      const specGloss = mat.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (specGloss?.diffuseTexture) {
        srgbTextureIndices.add(specGloss.diffuseTexture.index);
      }
      if (mat.emissiveTexture) {
        srgbTextureIndices.add(mat.emissiveTexture.index);
      }
    }
  }

  // 1. Upload Textures
  if (gltf.textures) {
    for (let tIdx = 0; tIdx < gltf.textures.length; tIdx++) {
      const tex = gltf.textures[tIdx]!;
      const sourceIdx = tex.source ?? tex.extensions?.KHR_texture_basisu?.source;
      if (sourceIdx !== undefined) {
        const imageBytes = await getImageBytes(gltf, buffers, sourceIdx, externalResolver);
        if (imageBytes && imageBytes.byteLength > 0) {
          const isSrgb = srgbTextureIndices.has(tIdx);
          const textureId = realm.resources.loadTexture(imageBytes, {
            srgb: isSrgb,
            label: tex.name ?? `glTF_Texture_${tIdx}`
          });
          textureMap.set(tIdx, textureId);
          createdTextureIds.push(textureId);
        }
      }
    }
  }

  // 2. Upload Materials
  if (gltf.materials) {
    for (let mIdx = 0; mIdx < gltf.materials.length; mIdx++) {
      const mat = gltf.materials[mIdx]!;
      const pbr = mat.pbrMetallicRoughness;
      const specGloss = mat.extensions?.KHR_materials_pbrSpecularGlossiness;

      const baseColor = pbr?.baseColorFactor ?? specGloss?.diffuseFactor ?? [1, 1, 1, 1];
      const metallic = pbr?.metallicFactor ?? 0.0;
      const roughness =
        pbr?.roughnessFactor ?? (specGloss ? 1.0 - (specGloss.glossinessFactor ?? 1.0) : 1.0);
      const baseColorTextureId =
        pbr?.baseColorTexture !== undefined
          ? textureMap.get(pbr.baseColorTexture.index)
          : specGloss?.diffuseTexture !== undefined
            ? textureMap.get(specGloss.diffuseTexture.index)
            : undefined;
      const normalTextureId =
        mat.normalTexture !== undefined ? textureMap.get(mat.normalTexture.index) : undefined;
      const metallicRoughnessTextureId =
        pbr?.metallicRoughnessTexture !== undefined
          ? textureMap.get(pbr.metallicRoughnessTexture.index)
          : undefined;
      const emissiveTextureId =
        mat.emissiveTexture !== undefined ? textureMap.get(mat.emissiveTexture.index) : undefined;
      const occlusionTextureId =
        mat.occlusionTexture !== undefined ? textureMap.get(mat.occlusionTexture.index) : undefined;

      // The Galfus 3D shader computes emissive as (material.emissive_color.rgb + tex_emissive.rgb).
      // When an emissive texture is present, avoid adding constant white factor which would blow out the surface.
      const emissiveColor: [number, number, number, number] =
        mat.emissiveFactor && emissiveTextureId === undefined
          ? [mat.emissiveFactor[0], mat.emissiveFactor[1], mat.emissiveFactor[2], 1]
          : [0, 0, 0, 1];

      // In glTF, many models (such as Sketchfab/Blender exports) accidentally tag solid materials
      // with alphaMode: "BLEND". A material is only truly translucent if baseColor alpha is below 1.0
      // or if its name/texture explicitly designates water/glass/transparency.
      const baseAlpha = baseColor[3] ?? 1.0;
      const nameLower = (mat.name ?? '').toLowerCase();
      const isLikelyTranslucent =
        baseAlpha < 0.99 ||
        nameLower.includes('glass') ||
        nameLower.includes('water') ||
        nameLower.includes('window') ||
        nameLower.includes('transpar') ||
        nameLower.includes('ocean') ||
        nameLower.includes('sea') ||
        nameLower.includes('ice');

      const surfaceType =
        mat.alphaMode === 'BLEND'
          ? isLikelyTranslucent
            ? 'transparent'
            : 'masked'
          : mat.alphaMode === 'MASK'
            ? 'masked'
            : 'opaque';

      const alphaCutoff =
        mat.alphaCutoff ?? (mat.alphaMode === 'BLEND' && !isLikelyTranslucent ? 0.5 : undefined);

      const { materialId } = realm.createMaterial({
        baseColor,
        metallic,
        roughness,
        emissiveColor,
        albedoTextureId: baseColorTextureId,
        normalTextureId,
        metallicRoughnessTextureId,
        emissiveTextureId,
        occlusionTextureId,
        side: mat.doubleSided ? 'double' : 'front',
        surfaceType,
        alphaCutoff
      });

      materialMap.set(mIdx, materialId);
      createdMaterialIds.push(materialId);
    }
  }

  // 3. Upload Geometries
  if (gltf.meshes) {
    for (let meshIdx = 0; meshIdx < gltf.meshes.length; meshIdx++) {
      const mesh = gltf.meshes[meshIdx]!;

      for (let primIdx = 0; primIdx < mesh.primitives.length; primIdx++) {
        const prim: GlTFPrimitive = mesh.primitives[primIdx]!;
        let positions: Float32Array;
        let normals: Float32Array | undefined;
        let uvs: Float32Array | undefined;
        let uv1: Float32Array | undefined;
        let tangents: Float32Array | undefined;
        let colors: Float32Array | undefined;
        let joints0: Uint32Array | Uint16Array | undefined;
        let weights0: Float32Array | undefined;
        let indices: Uint32Array | Uint16Array | undefined;

        // Check for Draco mesh compression extension
        if (prim.extensions?.KHR_draco_mesh_compression && decoders.draco) {
          const dracoExt = prim.extensions.KHR_draco_mesh_compression;
          const bv = gltf.bufferViews?.[dracoExt.bufferView];
          if (bv) {
            const buffer = buffers[bv.buffer];
            if (buffer) {
              const start = bv.byteOffset ?? 0;
              const dracoBytes = buffer.subarray(start, start + bv.byteLength);
              const decoded = await decoders.draco.decode(dracoBytes, dracoExt.attributes);
              positions = decoded.position ?? new Float32Array(0);
              normals = decoded.normal;
              uvs = decoded.uv;
              uv1 = decoded.uv1;
              tangents = decoded.tangent;
              colors = decoded.color;
              joints0 = decoded.joints;
              weights0 = decoded.weights;
              indices = decoded.indices;
            } else {
              positions = new Float32Array(0);
            }
          } else {
            positions = new Float32Array(0);
          }
        } else {
          // Standard uncompressed accessors
          const posAcc = prim.attributes['POSITION'];
          if (posAcc === undefined) continue;
          positions = readAccessor(gltf, buffers, posAcc) as Float32Array;

          if (prim.attributes['NORMAL'] !== undefined) {
            normals = readAccessor(gltf, buffers, prim.attributes['NORMAL']) as Float32Array;
          }
          if (prim.attributes['TEXCOORD_0'] !== undefined) {
            uvs = readAccessor(gltf, buffers, prim.attributes['TEXCOORD_0']) as Float32Array;
          }
          if (prim.attributes['TEXCOORD_1'] !== undefined) {
            uv1 = readAccessor(gltf, buffers, prim.attributes['TEXCOORD_1']) as Float32Array;
          }
          if (prim.attributes['TANGENT'] !== undefined) {
            tangents = readAccessor(gltf, buffers, prim.attributes['TANGENT']) as Float32Array;
          }
          if (prim.attributes['COLOR_0'] !== undefined) {
            colors = readAccessor(gltf, buffers, prim.attributes['COLOR_0']) as Float32Array;
          }
          if (prim.attributes['JOINTS_0'] !== undefined) {
            joints0 = readAccessor(gltf, buffers, prim.attributes['JOINTS_0']) as
              Uint32Array | Uint16Array;
          }
          if (prim.attributes['WEIGHTS_0'] !== undefined) {
            weights0 = readAccessor(gltf, buffers, prim.attributes['WEIGHTS_0']) as Float32Array;
          }
          if (prim.indices !== undefined) {
            indices = readAccessor(gltf, buffers, prim.indices) as Uint32Array | Uint16Array;
          }
        }

        const { geometryId } = realm.createGeometry({
          positions,
          normals,
          uvs,
          uv1,
          tangents,
          colors,
          joints0,
          weights0,
          indices,
          topology: mapGltfPrimitiveTopology(prim.mode)
        });

        const key = `${meshIdx}_${primIdx}`;
        geometryMap.set(key, geometryId);
        createdGeometryIds.push(geometryId);
      }
    }
  }

  return {
    geometryMap,
    materialMap,
    textureMap,
    createdGeometryIds,
    createdMaterialIds,
    createdTextureIds
  };
}
