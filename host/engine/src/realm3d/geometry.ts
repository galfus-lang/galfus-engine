/**
 * Semantic 3D Geometry definitions, vertex packing, and morph target utilities for Galfus Engine.
 */
export interface GeometryData {
  /** 3 float components per vertex: [x, y, z, ...] (Required) */
  positions: Float32Array;
  /** 3 float components per vertex: [nx, ny, nz, ...] (Optional, fallback: [0, 1, 0]) */
  normals?: Float32Array;
  /** 2 float components per vertex: [u, v, ...] (Optional, primary UV0, fallback: [0, 0]) */
  uvs?: Float32Array;
  /** 2 float components per vertex: [u, v, ...] (Optional, secondary UV1, fallback: [0, 0]) */
  uv1?: Float32Array;
  /** 4 float components per vertex: [x, y, z, w] (Optional, tangent with bitangent sign, fallback: [1, 0, 0, 1]) */
  tangents?: Float32Array;
  /** 4 float components per vertex: [r, g, b, a] (Optional, linear vertex color, fallback: [1, 1, 1, 1]) */
  colors?: Float32Array;
  /** 4 bone indices per vertex: [j0, j1, j2, j3] (Optional, primary 4 joints, fallback: [0, 0, 0, 0]) */
  joints0?: Uint32Array | Uint16Array;
  /** 4 bone influence weights per vertex: [w0, w1, w2, w3] (Optional, primary 4 weights, fallback: [0, 0, 0, 0]) */
  weights0?: Float32Array;
  /** 4 bone indices per vertex: [j4, j5, j6, j7] (Optional, secondary 4 joints, fallback: [0, 0, 0, 0]) */
  joints1?: Uint32Array | Uint16Array;
  /** 4 bone influence weights per vertex: [w4, w5, w6, w7] (Optional, secondary 4 weights, fallback: [0, 0, 0, 0]) */
  weights1?: Float32Array;
  /** Index buffer (Optional. If omitted, sequential indices [0..N-1] are generated) */
  indices?: Uint32Array | Uint16Array;
  /** Primitive topology: 0 = TriangleList, 1 = TriangleStrip, 2 = LineList, etc. Default: 0 */
  topology?: number;
}

export const VERTEX_STRIDE_BYTES = 136;
export const MORPH_VERTEX_STRIDE_BYTES = 48;

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

    // UV1 (Float32x2 at offset 32..40)
    if (data.uv1) {
      view.setFloat32(offset + 32, data.uv1[i * 2 + 0] ?? 0, true);
      view.setFloat32(offset + 36, data.uv1[i * 2 + 1] ?? 0, true);
    }

    // Tangent (Float32x4 at offset 40..56) - default [1.0, 0.0, 0.0, 1.0]
    if (data.tangents) {
      view.setFloat32(offset + 40, data.tangents[i * 4 + 0] ?? 1, true);
      view.setFloat32(offset + 44, data.tangents[i * 4 + 1] ?? 0, true);
      view.setFloat32(offset + 48, data.tangents[i * 4 + 2] ?? 0, true);
      view.setFloat32(offset + 52, data.tangents[i * 4 + 3] ?? 1, true);
    } else {
      view.setFloat32(offset + 40, 1, true);
      view.setFloat32(offset + 52, 1, true);
    }

    // Color (Float32x4 linear RGBA at offset 56..72) - default [1.0, 1.0, 1.0, 1.0]
    if (data.colors) {
      view.setFloat32(offset + 56, data.colors[i * 4 + 0] ?? 1, true);
      view.setFloat32(offset + 60, data.colors[i * 4 + 1] ?? 1, true);
      view.setFloat32(offset + 64, data.colors[i * 4 + 2] ?? 1, true);
      view.setFloat32(offset + 68, data.colors[i * 4 + 3] ?? 1, true);
    } else {
      view.setFloat32(offset + 56, 1, true);
      view.setFloat32(offset + 60, 1, true);
      view.setFloat32(offset + 64, 1, true);
      view.setFloat32(offset + 68, 1, true);
    }

    // Joints0 (Uint32x4 at offset 72..88)
    if (data.joints0) {
      view.setUint32(offset + 72, data.joints0[i * 4 + 0] ?? 0, true);
      view.setUint32(offset + 76, data.joints0[i * 4 + 1] ?? 0, true);
      view.setUint32(offset + 80, data.joints0[i * 4 + 2] ?? 0, true);
      view.setUint32(offset + 84, data.joints0[i * 4 + 3] ?? 0, true);
    }

    // Weights0 (Float32x4 at offset 88..104)
    if (data.weights0) {
      view.setFloat32(offset + 88, data.weights0[i * 4 + 0] ?? 0, true);
      view.setFloat32(offset + 92, data.weights0[i * 4 + 1] ?? 0, true);
      view.setFloat32(offset + 96, data.weights0[i * 4 + 2] ?? 0, true);
      view.setFloat32(offset + 100, data.weights0[i * 4 + 3] ?? 0, true);
    }

    // Joints1 (Uint32x4 at offset 104..120)
    if (data.joints1) {
      view.setUint32(offset + 104, data.joints1[i * 4 + 0] ?? 0, true);
      view.setUint32(offset + 108, data.joints1[i * 4 + 1] ?? 0, true);
      view.setUint32(offset + 112, data.joints1[i * 4 + 2] ?? 0, true);
      view.setUint32(offset + 116, data.joints1[i * 4 + 3] ?? 0, true);
    }

    // Weights1 (Float32x4 at offset 120..136)
    if (data.weights1) {
      view.setFloat32(offset + 120, data.weights1[i * 4 + 0] ?? 0, true);
      view.setFloat32(offset + 124, data.weights1[i * 4 + 1] ?? 0, true);
      view.setFloat32(offset + 128, data.weights1[i * 4 + 2] ?? 0, true);
      view.setFloat32(offset + 132, data.weights1[i * 4 + 3] ?? 0, true);
    }
  }

  let indices: Uint32Array;
  if (data.indices) {
    indices = data.indices instanceof Uint32Array ? data.indices : new Uint32Array(data.indices);
  } else {
    indices = new Uint32Array(vertexCount);
    for (let k = 0; k < vertexCount; k++) {
      indices[k] = k;
    }
  }

  return {
    topology: data.topology ?? 0,
    vertexData,
    indices
  };
}

/**
 * Morph target per-vertex deltas for position, normal, and tangent.
 */
export interface MorphTargetData {
  /** 3 float components per vertex delta: [dx, dy, dz, ...] */
  positions?: Float32Array;
  /** 3 float components per vertex delta: [nx, ny, nz, ...] */
  normals?: Float32Array;
  /** 3 float components per vertex delta: [tx, ty, tz, ...] */
  tangents?: Float32Array;
}

/**
 * Packs morph target deltas into contiguous 48-byte records (target-major).
 */
export function packMorphTargets(
  targets: MorphTargetData[],
  vertexCount: number
): { targetData: Uint8Array; targetCount: number } {
  const targetCount = targets.length;
  const targetData = new Uint8Array(targetCount * vertexCount * MORPH_VERTEX_STRIDE_BYTES);
  const view = new DataView(targetData.buffer);

  for (let t = 0; t < targetCount; t++) {
    const target = targets[t];
    const targetBase = t * vertexCount * MORPH_VERTEX_STRIDE_BYTES;

    for (let i = 0; i < vertexCount; i++) {
      const offset = targetBase + i * MORPH_VERTEX_STRIDE_BYTES;

      // Position delta [dx, dy, dz, 0.0] (offset 0..16)
      if (target?.positions) {
        view.setFloat32(offset + 0, target.positions[i * 3 + 0] ?? 0, true);
        view.setFloat32(offset + 4, target.positions[i * 3 + 1] ?? 0, true);
        view.setFloat32(offset + 8, target.positions[i * 3 + 2] ?? 0, true);
      }
      view.setFloat32(offset + 12, 0.0, true);

      // Normal delta [nx, ny, nz, 0.0] (offset 16..32)
      if (target?.normals) {
        view.setFloat32(offset + 16, target.normals[i * 3 + 0] ?? 0, true);
        view.setFloat32(offset + 20, target.normals[i * 3 + 1] ?? 0, true);
        view.setFloat32(offset + 24, target.normals[i * 3 + 2] ?? 0, true);
      }
      view.setFloat32(offset + 28, 0.0, true);

      // Tangent delta [tx, ty, tz, 0.0] (offset 32..48)
      if (target?.tangents) {
        view.setFloat32(offset + 32, target.tangents[i * 3 + 0] ?? 0, true);
        view.setFloat32(offset + 36, target.tangents[i * 3 + 1] ?? 0, true);
        view.setFloat32(offset + 40, target.tangents[i * 3 + 2] ?? 0, true);
      }
      view.setFloat32(offset + 44, 0.0, true);
    }
  }

  return { targetData, targetCount };
}
