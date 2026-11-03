/**
 * Low-level binary GLB and JSON glTF deserialization with typed accessor decoding.
 */

import {
  type GlTF,
  GLTF_COMPONENT_TYPE,
  type GlTFAccessorType,
  type GlTFComponentType
} from './types';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_TYPE_BIN = 0x004e4942; // 'BIN\0'

export interface ParsedGltf {
  gltf: GlTF;
  buffers: Uint8Array[];
}

/**
 * Decodes a base64 data URI into a raw Uint8Array.
 */
export function decodeDataUri(uri: string): Uint8Array {
  const commaIdx = uri.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid data URI in glTF buffer');
  }
  const base64Str = uri.slice(commaIdx + 1);
  const binaryStr = atob(base64Str);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Synchronously parses GLB binary containers or glTF JSON with embedded data URIs.
 *
 * @param input Raw file bytes.
 * @returns Parsed glTF object and array of decoded binary buffers.
 */
export function parseGltfSync(input: Uint8Array | ArrayBuffer): ParsedGltf {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Check for GLB binary container magic header
  if (bytes.byteLength >= 12 && dataView.getUint32(0, true) === GLB_MAGIC) {
    const version = dataView.getUint32(4, true);
    if (version !== 2) {
      throw new Error(`Unsupported GLB container version: ${version} (expected 2)`);
    }

    const totalLength = dataView.getUint32(8, true);
    if (totalLength > bytes.byteLength) {
      throw new Error('Truncated GLB container');
    }

    let offset = 12;
    let jsonGltf: GlTF | undefined;
    const buffers: Uint8Array[] = [];

    while (offset < totalLength) {
      const chunkLength = dataView.getUint32(offset, true);
      const chunkType = dataView.getUint32(offset + 4, true);
      const chunkData = new Uint8Array(bytes.buffer, bytes.byteOffset + offset + 8, chunkLength);

      if (chunkType === CHUNK_TYPE_JSON) {
        const jsonText = new TextDecoder().decode(chunkData);
        jsonGltf = JSON.parse(jsonText) as GlTF;
      } else if (chunkType === CHUNK_TYPE_BIN) {
        buffers.push(chunkData);
      }

      offset += 8 + chunkLength;
    }

    if (!jsonGltf) {
      throw new Error('GLB container is missing the required JSON chunk');
    }

    return { gltf: jsonGltf, buffers };
  }

  // Fallback: Plain JSON glTF format
  const jsonText = new TextDecoder().decode(bytes);
  const jsonGltf = JSON.parse(jsonText) as GlTF;
  const buffers: Uint8Array[] = [];

  if (jsonGltf.buffers) {
    for (const buf of jsonGltf.buffers) {
      if (buf.uri && buf.uri.startsWith('data:')) {
        buffers.push(decodeDataUri(buf.uri));
      } else {
        throw new Error(`Cannot resolve external glTF buffer: ${buf.uri ?? '(missing URI)'}`);
      }
    }
  }

  return { gltf: jsonGltf, buffers };
}

/**
 * Parses raw input data (Uint8Array or ArrayBuffer) into a GlTF structure and extracted binary buffers.
 *
 * Automatically resolves external buffers if an externalResolver is provided.
 *
 * @param input Raw file bytes.
 * @param externalResolver Optional async callback to resolve external buffer URIs.
 * @returns Parsed glTF object and array of decoded binary buffers.
 */
export async function parseGltf(
  input: Uint8Array | ArrayBuffer,
  externalResolver?: (uri: string) => Promise<Uint8Array>
): Promise<ParsedGltf> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.byteLength >= 12 && dataView.getUint32(0, true) === GLB_MAGIC) {
    return parseGltfSync(bytes);
  }

  const jsonText = new TextDecoder().decode(bytes);
  const jsonGltf = JSON.parse(jsonText) as GlTF;
  const buffers: Uint8Array[] = [];

  if (jsonGltf.buffers) {
    for (const buf of jsonGltf.buffers) {
      if (buf.uri && buf.uri.startsWith('data:')) {
        buffers.push(decodeDataUri(buf.uri));
      } else if (buf.uri && externalResolver) {
        buffers.push(await externalResolver(buf.uri));
      } else {
        throw new Error(`Cannot resolve external glTF buffer: ${buf.uri ?? '(missing URI)'}`);
      }
    }
  }

  return { gltf: jsonGltf, buffers };
}

/**
 * Returns the number of components for a given glTF accessor type.
 */
export function getComponentCountForType(type: GlTFAccessorType): number {
  switch (type) {
    case 'SCALAR':
      return 1;
    case 'VEC2':
      return 2;
    case 'VEC3':
      return 3;
    case 'VEC4':
    case 'MAT2':
      return 4;
    case 'MAT3':
      return 9;
    case 'MAT4':
      return 16;
    default:
      return 1;
  }
}

/**
 * Returns the byte size of an individual glTF component type.
 */
export function getComponentByteSize(type: GlTFComponentType): number {
  switch (type) {
    case GLTF_COMPONENT_TYPE.BYTE:
    case GLTF_COMPONENT_TYPE.UNSIGNED_BYTE:
      return 1;
    case GLTF_COMPONENT_TYPE.SHORT:
    case GLTF_COMPONENT_TYPE.UNSIGNED_SHORT:
      return 2;
    case GLTF_COMPONENT_TYPE.UNSIGNED_INT:
    case GLTF_COMPONENT_TYPE.FLOAT:
      return 4;
    default:
      return 4;
  }
}

/**
 * Reads and unpacks a glTF accessor into a contiguous Float32Array or Uint32Array.
 *
 * Handles buffer offsets, custom byte strides, and component normalization.
 *
 * @param gltf The root glTF descriptor.
 * @param buffers Array of resolved binary buffers.
 * @param accessorIndex Zero-based accessor index.
 * @returns Contiguous typed array of decoded values.
 */
export function readAccessor(
  gltf: GlTF,
  buffers: Uint8Array[],
  accessorIndex: number
): Float32Array | Uint32Array | Uint16Array {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`Accessor index out of bounds: ${accessorIndex}`);
  }

  if (accessor.sparse) {
    const sparse = accessor.sparse;
    const base = { ...accessor, sparse: undefined };
    const indices = {
      bufferView: sparse.indices.bufferView,
      byteOffset: sparse.indices.byteOffset,
      componentType: sparse.indices.componentType,
      count: sparse.count,
      type: 'SCALAR' as const
    };
    const values = {
      ...base,
      bufferView: sparse.values.bufferView,
      byteOffset: sparse.values.byteOffset,
      count: sparse.count
    };
    const accessors = [...(gltf.accessors ?? []), base, indices, values];
    const doc = { ...gltf, accessors };
    const result = readAccessor(doc, buffers, accessors.length - 3);
    const sparseIndices = readAccessor(doc, buffers, accessors.length - 2);
    const sparseValues = readAccessor(doc, buffers, accessors.length - 1);
    const components = getComponentCountForType(accessor.type);
    for (let i = 0; i < sparse.count; i++) {
      const index = sparseIndices[i]!;
      if (index >= accessor.count) throw new Error('Sparse accessor index out of bounds');
      for (let c = 0; c < components; c++)
        result[index * components + c] = sparseValues[i * components + c]!;
    }
    return result;
  }

  const numComponents = getComponentCountForType(accessor.type);
  const compSize = getComponentByteSize(accessor.componentType);
  const elementSize = numComponents * compSize;
  const count = accessor.count;

  if (accessor.bufferView === undefined) {
    // Unallocated/sparse accessor: return zeros
    return new Float32Array(count * numComponents);
  }

  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) {
    throw new Error(`BufferView index out of bounds: ${accessor.bufferView}`);
  }

  const buffer = buffers[bufferView.buffer];
  if (!buffer) {
    throw new Error(`Buffer index out of bounds: ${bufferView.buffer}`);
  }

  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? elementSize;
  const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Fast path: contiguous floats
  if (
    accessor.componentType === GLTF_COMPONENT_TYPE.FLOAT &&
    stride === elementSize &&
    !accessor.normalized
  ) {
    const totalFloats = count * numComponents;
    const byteStart = buffer.byteOffset + baseOffset;
    return new Float32Array(buffer.buffer.slice(byteStart, byteStart + totalFloats * 4));
  }

  // Fast path: contiguous unsigned 16-bit integers
  if (
    accessor.componentType === GLTF_COMPONENT_TYPE.UNSIGNED_SHORT &&
    stride === elementSize &&
    !accessor.normalized
  ) {
    const totalShorts = count * numComponents;
    const byteStart = buffer.byteOffset + baseOffset;
    return new Uint16Array(buffer.buffer.slice(byteStart, byteStart + totalShorts * 2));
  }

  // Fast path: contiguous unsigned 32-bit integers
  if (
    accessor.componentType === GLTF_COMPONENT_TYPE.UNSIGNED_INT &&
    stride === elementSize &&
    !accessor.normalized
  ) {
    const totalInts = count * numComponents;
    const byteStart = buffer.byteOffset + baseOffset;
    return new Uint32Array(buffer.buffer.slice(byteStart, byteStart + totalInts * 4));
  }

  // Interleaved or custom type decoding
  const outFloats = new Float32Array(count * numComponents);
  let outIdx = 0;

  for (let i = 0; i < count; i++) {
    const elemOffset = baseOffset + i * stride;

    for (let c = 0; c < numComponents; c++) {
      const bytePos = elemOffset + c * compSize;
      let val = 0;

      switch (accessor.componentType) {
        case GLTF_COMPONENT_TYPE.FLOAT:
          val = dataView.getFloat32(bytePos, true);
          break;
        case GLTF_COMPONENT_TYPE.UNSIGNED_INT:
          val = dataView.getUint32(bytePos, true);
          break;
        case GLTF_COMPONENT_TYPE.UNSIGNED_SHORT:
          val = dataView.getUint16(bytePos, true);
          if (accessor.normalized) val /= 65535;
          break;
        case GLTF_COMPONENT_TYPE.SHORT:
          val = dataView.getInt16(bytePos, true);
          if (accessor.normalized) val = Math.max(val / 32767, -1);
          break;
        case GLTF_COMPONENT_TYPE.UNSIGNED_BYTE:
          val = dataView.getUint8(bytePos);
          if (accessor.normalized) val /= 255;
          break;
        case GLTF_COMPONENT_TYPE.BYTE:
          val = dataView.getInt8(bytePos);
          if (accessor.normalized) val = Math.max(val / 127, -1);
          break;
      }

      outFloats[outIdx++] = val;
    }
  }

  return outFloats;
}
