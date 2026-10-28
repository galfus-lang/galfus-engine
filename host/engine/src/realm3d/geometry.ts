/**
 * Semantic 3D Geometry definitions and vertex packing utilities for Galfus Engine.
 */
import type { Primitive3DKind } from './components';

export interface GeometryData {
  /** 3 float components per vertex: [x, y, z, ...] */
  positions: Float32Array;
  /** 3 float components per vertex: [nx, ny, nz, ...] */
  normals?: Float32Array;
  /** 2 float components per vertex: [u, v, ...] */
  uvs?: Float32Array;
  /** Index buffer */
  indices: Uint32Array | Uint16Array;
  /** Primitive topology: 0 = TriangleList, 1 = TriangleStrip, 2 = LineList, etc. Default: 0 */
  topology?: number;
}

const VERTEX_STRIDE_BYTES = 136;

/**
 * Packs separate semantic attribute arrays into the canonical 136-byte packed layout.
 */
export function packGeometryData(data: GeometryData): {
  topology: number;
  vertexData: Uint8Array;
  indices: Uint32Array;
} {
  const vertexCount = Math.floor(data.positions.length / 3);
  const vertexData = new Uint8Array(vertexCount * VERTEX_STRIDE_BYTES);
  const view = new DataView(vertexData.buffer);

  for (let i = 0; i < vertexCount; i++) {
    const offset = i * VERTEX_STRIDE_BYTES;

    // Position (Float32x3 at offset 0..12)
    view.setFloat32(offset + 0, data.positions[i * 3 + 0] ?? 0, true);
    view.setFloat32(offset + 4, data.positions[i * 3 + 1] ?? 0, true);
    view.setFloat32(offset + 8, data.positions[i * 3 + 2] ?? 0, true);

    // Normal (Float32x3 at offset 12..24)
    if (data.normals) {
      view.setFloat32(offset + 12, data.normals[i * 3 + 0] ?? 0, true);
      view.setFloat32(offset + 16, data.normals[i * 3 + 1] ?? 1, true);
      view.setFloat32(offset + 20, data.normals[i * 3 + 2] ?? 0, true);
    } else {
      view.setFloat32(offset + 16, 1, true); // default normal +Y
    }

    // UV0 (Float32x2 at offset 24..32)
    if (data.uvs) {
      view.setFloat32(offset + 24, data.uvs[i * 2 + 0] ?? 0, true);
      view.setFloat32(offset + 28, data.uvs[i * 2 + 1] ?? 0, true);
    }
  }

  const indices =
    data.indices instanceof Uint32Array ? data.indices : new Uint32Array(data.indices);

  return {
    topology: data.topology ?? 0,
    vertexData,
    indices
  };
}
