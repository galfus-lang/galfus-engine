/**
 * glTF 2.0 canonical schema specifications and extension types.
 *
 * Implements the official Khronos glTF 2.0 standard:
 * https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
 */

export const GLTF_COMPONENT_TYPE = {
  BYTE: 5120,
  UNSIGNED_BYTE: 5121,
  SHORT: 5122,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  FLOAT: 5126
} as const;

export type GlTFComponentType = (typeof GLTF_COMPONENT_TYPE)[keyof typeof GLTF_COMPONENT_TYPE];

export type GlTFAccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';

export interface GlTFAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: GlTFComponentType;
  normalized?: boolean;
  count: number;
  type: GlTFAccessorType;
  max?: number[];
  min?: number[];
  sparse?: {
    count: number;
    indices: { bufferView: number; byteOffset?: number; componentType: GlTFComponentType };
    values: { bufferView: number; byteOffset?: number };
  };
  name?: string;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
  name?: string;
  extensions?: {
    EXT_meshopt_compression?: {
      buffer: number;
      byteOffset?: number;
      byteLength: number;
      byteStride: number;
      count: number;
      mode: 'ATTRIBUTES' | 'TRIANGLES' | 'INDICES';
      filter?: 'NONE' | 'OCTAHEDRAL' | 'QUATERNION' | 'EXPONENTIAL';
    };
  } & Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFBuffer {
  uri?: string;
  byteLength: number;
  name?: string;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
  targets?: Array<Record<string, number>>;
  extensions?: {
    KHR_draco_mesh_compression?: {
      bufferView: number;
      attributes: Record<string, number>;
    };
  } & Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFMesh {
  primitives: GlTFPrimitive[];
  weights?: number[];
  name?: string;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFTextureInfo {
  index: number;
  texCoord?: number;
  extensions?: Record<string, unknown>;
}

export interface GlTFMaterialNormalTextureInfo extends GlTFTextureInfo {
  scale?: number;
}

export interface GlTFMaterialOcclusionTextureInfo extends GlTFTextureInfo {
  strength?: number;
}

export interface GlTFKHRMaterialsPbrSpecularGlossiness {
  diffuseFactor?: [number, number, number, number];
  diffuseTexture?: GlTFTextureInfo;
  specularFactor?: [number, number, number];
  glossinessFactor?: number;
  specularGlossinessTexture?: GlTFTextureInfo;
}

export interface GlTFPbrMetallicRoughness {
  baseColorFactor?: [number, number, number, number];
  baseColorTexture?: GlTFTextureInfo;
  metallicFactor?: number;
  roughnessFactor?: number;
  metallicRoughnessTexture?: GlTFTextureInfo;
  extensions?: Record<string, unknown>;
}

export interface GlTFMaterial {
  name?: string;
  pbrMetallicRoughness?: GlTFPbrMetallicRoughness;
  normalTexture?: GlTFMaterialNormalTextureInfo;
  occlusionTexture?: GlTFMaterialOcclusionTextureInfo;
  emissiveTexture?: GlTFTextureInfo;
  emissiveFactor?: [number, number, number];
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided?: boolean;
  extensions?: {
    KHR_materials_pbrSpecularGlossiness?: GlTFKHRMaterialsPbrSpecularGlossiness;
    KHR_materials_ior?: { ior?: number };
  } & Record<string, unknown>;
  extras?: unknown;
}

export type GltfMaterialAlphaModeResolver = (
  material: GlTFMaterial,
  index: number,
  baseColorImage?: Uint8Array
) => GlTFMaterial['alphaMode'];

export interface GlTFTexture {
  sampler?: number;
  source?: number;
  name?: string;
  extensions?: {
    KHR_texture_basisu?: {
      source: number;
    };
  } & Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFImage {
  uri?: string;
  mimeType?: string;
  bufferView?: number;
  name?: string;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFNode {
  camera?: number;
  children?: number[];
  skin?: number;
  matrix?: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
  mesh?: number;
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  translation?: [number, number, number];
  weights?: number[];
  name?: string;
  extensions?: {
    EXT_mesh_gpu_instancing?: {
      attributes: Record<string, number>;
    };
  } & Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFSkin {
  inverseBindMatrices?: number;
  skeleton?: number;
  joints: number[];
  name?: string;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFAnimationChannel {
  sampler: number;
  target: {
    node?: number;
    path: 'translation' | 'rotation' | 'scale' | 'weights';
    extensions?: Record<string, unknown>;
  };
  extensions?: Record<string, unknown>;
}

export interface GlTFAnimationSampler {
  input: number;
  interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
  output: number;
  extensions?: Record<string, unknown>;
}

export interface GlTFAnimation {
  name?: string;
  channels: GlTFAnimationChannel[];
  samplers: GlTFAnimationSampler[];
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFScene {
  nodes?: number[];
  name?: string;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface GlTFAsset {
  version: string;
  generator?: string;
  minVersion?: string;
  extensions?: Record<string, unknown>;
  extras?: unknown;
}

export interface GlTF {
  asset: GlTFAsset;
  scene?: number;
  scenes?: GlTFScene[];
  nodes?: GlTFNode[];
  meshes?: GlTFMesh[];
  materials?: GlTFMaterial[];
  textures?: GlTFTexture[];
  images?: GlTFImage[];
  accessors?: GlTFAccessor[];
  bufferViews?: GlTFBufferView[];
  buffers?: GlTFBuffer[];
  skins?: GlTFSkin[];
  animations?: GlTFAnimation[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  extensions?: Record<string, unknown>;
  extras?: unknown;
}
