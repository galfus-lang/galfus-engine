/**
 * Shared GPU resource extraction and uploading for glTF geometries, PBR materials, and textures.
 */

import type { Realm3D } from '@galfus/engine';
import type { ResolvedDecoders } from './decoders/resolver';
import { decodeDataUri, readAccessor } from './parser';
import type { GlTF, GltfMaterialAlphaModeResolver, GlTFPrimitive } from './types';

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
    return decodeDataUri(image.uri);
  }

  if (image.uri && externalResolver) {
    return await externalResolver(image.uri);
  }

  if (image.uri) throw new Error(`Cannot resolve external glTF image: ${image.uri}`);

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
  externalResolver?: (uri: string) => Promise<Uint8Array>,
  resolveMaterialAlphaMode?: GltfMaterialAlphaModeResolver
): Promise<UploadedGltfResources> {
  const textureMap = new Map<number, number>();
  const materialMap = new Map<number, number>();
  const geometryMap = new Map<string, number>();
  const textureBytes = new Map<number, Uint8Array>();

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
          if (resolveMaterialAlphaMode) textureBytes.set(tIdx, imageBytes);
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

      const linearColor = pbr?.baseColorFactor ?? specGloss?.diffuseFactor ?? [1, 1, 1, 1];
      const linearToSrgb = (value: number): number =>
        value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
      const baseColor: [number, number, number, number] = [
        linearToSrgb(linearColor[0]),
        linearToSrgb(linearColor[1]),
        linearToSrgb(linearColor[2]),
        linearColor[3]
      ];
      const metallic = pbr?.metallicFactor ?? (specGloss ? 0 : 1);
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

      const baseTextureIndex = pbr?.baseColorTexture?.index ?? specGloss?.diffuseTexture?.index;
      const alphaMode =
        resolveMaterialAlphaMode?.(
          mat,
          mIdx,
          baseTextureIndex === undefined ? undefined : textureBytes.get(baseTextureIndex)
        ) ?? mat.alphaMode;
      const surfaceType =
        alphaMode === 'BLEND' ? 'transparent' : alphaMode === 'MASK' ? 'masked' : 'opaque';

      const alphaCutoff = mat.alphaCutoff;
      const ior = mat.extensions?.KHR_materials_ior?.ior ?? 1.5;
      const reflectance = ior === 0 ? 2.5 : (2.5 * (ior - 1)) / (ior + 1);

      const { materialId } = realm.createMaterial({
        baseColor,
        metallic,
        roughness,
        refractionIndex: ior,
        reflectance,
        emissiveColor,
        albedoTextureId: baseColorTextureId,
        normalTextureId,
        normalScale: mat.normalTexture?.scale,
        metallicRoughnessTextureId,
        emissiveTextureId,
        occlusionTextureId,
        occlusionStrength: mat.occlusionTexture?.strength,
        textureUvSets: [
          pbr?.baseColorTexture ?? specGloss?.diffuseTexture,
          mat.normalTexture,
          pbr?.metallicRoughnessTexture,
          mat.occlusionTexture,
          mat.emissiveTexture
        ].map((info) => (info?.texCoord === 1 ? 'uv1' : 'uv0')),
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
        let joints1: Uint32Array | Uint16Array | undefined;
        let weights1: Float32Array | undefined;
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
            if (gltf.accessors?.[prim.attributes['COLOR_0']]?.type === 'VEC3') {
              const rgba = new Float32Array((colors.length / 3) * 4);
              for (let i = 0; i < colors.length / 3; i++) {
                rgba.set(colors.subarray(i * 3, i * 3 + 3), i * 4);
                rgba[i * 4 + 3] = 1;
              }
              colors = rgba;
            }
          }
          if (prim.attributes['JOINTS_0'] !== undefined) {
            joints0 = readAccessor(gltf, buffers, prim.attributes['JOINTS_0']) as
              Uint32Array | Uint16Array;
          }
          if (prim.attributes['WEIGHTS_0'] !== undefined) {
            weights0 = readAccessor(gltf, buffers, prim.attributes['WEIGHTS_0']) as Float32Array;
          }
          if (prim.attributes['JOINTS_1'] !== undefined) {
            joints1 = readAccessor(gltf, buffers, prim.attributes['JOINTS_1']) as
              Uint32Array | Uint16Array;
          }
          if (prim.attributes['WEIGHTS_1'] !== undefined) {
            weights1 = readAccessor(gltf, buffers, prim.attributes['WEIGHTS_1']) as Float32Array;
          }
          if (prim.indices !== undefined) {
            indices = readAccessor(gltf, buffers, prim.indices) as Uint32Array | Uint16Array;
          }
        }

        if (prim.mode === 2 || prim.mode === 6) {
          const src = indices ?? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
          if (prim.mode === 2) indices = Uint32Array.from([...src, src[0]!]);
          else {
            const triangles: number[] = [];
            for (let i = 1; i + 1 < src.length; i++) triangles.push(src[0]!, src[i]!, src[i + 1]!);
            indices = new Uint32Array(triangles);
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
          joints1,
          weights1,
          indices,
          topology: mapGltfPrimitiveTopology(prim.mode)
        });

        if (prim.targets?.length) {
          const targets = prim.targets.map((target) => ({
            positions:
              target['POSITION'] === undefined
                ? undefined
                : (readAccessor(gltf, buffers, target['POSITION']) as Float32Array),
            normals:
              target['NORMAL'] === undefined
                ? undefined
                : (readAccessor(gltf, buffers, target['NORMAL']) as Float32Array),
            tangents:
              target['TANGENT'] === undefined
                ? undefined
                : (readAccessor(gltf, buffers, target['TANGENT']) as Float32Array)
          }));
          realm.setGeometryMorphTargets(geometryId, targets, positions.length / 3);
        }

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
