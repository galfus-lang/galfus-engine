import { describe, expect, it } from 'bun:test';
import {
  packGeometryData,
  packMorphTargets,
  VERTEX_STRIDE_BYTES,
  MORPH_VERTEX_STRIDE_BYTES
} from '../src/realm3d/geometry';

describe('@galfus/engine > Geometry 136-Byte & Morph Packing', () => {
  it('has exact strides matching core Rust layout', () => {
    expect(VERTEX_STRIDE_BYTES).toBe(136);
    expect(MORPH_VERTEX_STRIDE_BYTES).toBe(48);
  });

  it('packs minimal positions and fills canonical default attributes', () => {
    const positions = new Float32Array([
      0.0,
      1.0,
      2.0, // Vertex 0
      3.0,
      4.0,
      5.0 // Vertex 1
    ]);

    const packed = packGeometryData({ positions });

    expect(packed.vertexData.byteLength).toBe(2 * 136);
    expect(packed.indices.length).toBe(2);
    expect(Array.from(packed.indices)).toEqual([0, 1]); // Auto-generated sequential indices

    const view = new DataView(packed.vertexData.buffer);

    // Vertex 0: Position [0, 1, 2]
    expect(view.getFloat32(0, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(4, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(8, true)).toBeCloseTo(2.0);

    // Vertex 0: Default Normal [0, 1, 0]
    expect(view.getFloat32(12, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(16, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(20, true)).toBeCloseTo(0.0);

    // Vertex 0: Default UV0 [0, 0]
    expect(view.getFloat32(24, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(28, true)).toBeCloseTo(0.0);

    // Vertex 0: Default UV1 [0, 0]
    expect(view.getFloat32(32, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(36, true)).toBeCloseTo(0.0);

    // Vertex 0: Default Tangent [1, 0, 0, 1]
    expect(view.getFloat32(40, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(44, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(48, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(52, true)).toBeCloseTo(1.0);

    // Vertex 0: Default Color [1, 1, 1, 1] (Linear RGBA, not transparent black)
    expect(view.getFloat32(56, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(60, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(64, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(68, true)).toBeCloseTo(1.0);

    // Vertex 0: Default Skinning Joints [0, 0, 0, 0] & Weights [0, 0, 0, 0]
    expect(view.getUint32(72, true)).toBe(0);
    expect(view.getUint32(76, true)).toBe(0);
    expect(view.getUint32(80, true)).toBe(0);
    expect(view.getUint32(84, true)).toBe(0);
    expect(view.getFloat32(88, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(92, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(96, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(100, true)).toBeCloseTo(0.0);
  });

  it('packs all custom attributes including UV1, custom colors, tangents, and 8 bone weights', () => {
    const positions = new Float32Array([1.0, 2.0, 3.0]);
    const normals = new Float32Array([0.0, 0.0, 1.0]);
    const uvs = new Float32Array([0.25, 0.75]);
    const uv1 = new Float32Array([0.5, 0.5]);
    const tangents = new Float32Array([0.0, 1.0, 0.0, -1.0]);
    const colors = new Float32Array([0.8, 0.4, 0.2, 1.0]);
    const joints0 = new Uint32Array([1, 2, 3, 4]);
    const weights0 = new Float32Array([0.4, 0.3, 0.2, 0.1]);
    const joints1 = new Uint32Array([5, 6, 7, 8]);
    const weights1 = new Float32Array([0.05, 0.05, 0.05, 0.05]);
    const indices = new Uint16Array([0]);

    const packed = packGeometryData({
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
      indices
    });

    const view = new DataView(packed.vertexData.buffer);

    // Positions (0..12)
    expect(view.getFloat32(0, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(4, true)).toBeCloseTo(2.0);
    expect(view.getFloat32(8, true)).toBeCloseTo(3.0);

    // Normals (12..24)
    expect(view.getFloat32(12, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(16, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(20, true)).toBeCloseTo(1.0);

    // UV0 (24..32) & UV1 (32..40)
    expect(view.getFloat32(24, true)).toBeCloseTo(0.25);
    expect(view.getFloat32(28, true)).toBeCloseTo(0.75);
    expect(view.getFloat32(32, true)).toBeCloseTo(0.5);
    expect(view.getFloat32(36, true)).toBeCloseTo(0.5);

    // Tangents (40..56)
    expect(view.getFloat32(40, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(44, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(48, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(52, true)).toBeCloseTo(-1.0);

    // Colors (56..72)
    expect(view.getFloat32(56, true)).toBeCloseTo(0.8);
    expect(view.getFloat32(60, true)).toBeCloseTo(0.4);
    expect(view.getFloat32(64, true)).toBeCloseTo(0.2);
    expect(view.getFloat32(68, true)).toBeCloseTo(1.0);

    // Joints0 & Weights0 (72..104)
    expect(view.getUint32(72, true)).toBe(1);
    expect(view.getUint32(76, true)).toBe(2);
    expect(view.getUint32(80, true)).toBe(3);
    expect(view.getUint32(84, true)).toBe(4);
    expect(view.getFloat32(88, true)).toBeCloseTo(0.4);
    expect(view.getFloat32(92, true)).toBeCloseTo(0.3);
    expect(view.getFloat32(96, true)).toBeCloseTo(0.2);
    expect(view.getFloat32(100, true)).toBeCloseTo(0.1);

    // Joints1 & Weights1 (104..136)
    expect(view.getUint32(104, true)).toBe(5);
    expect(view.getUint32(108, true)).toBe(6);
    expect(view.getUint32(112, true)).toBe(7);
    expect(view.getUint32(116, true)).toBe(8);
    expect(view.getFloat32(120, true)).toBeCloseTo(0.05);
    expect(view.getFloat32(124, true)).toBeCloseTo(0.05);
    expect(view.getFloat32(128, true)).toBeCloseTo(0.05);
    expect(view.getFloat32(132, true)).toBeCloseTo(0.05);

    // Provided indices converted to Uint32Array
    expect(packed.indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(packed.indices)).toEqual([0]);
  });

  it('packs target-major morph targets into 48-byte records with proper padding', () => {
    const target0 = {
      positions: new Float32Array([0.1, 0.2, 0.3]),
      normals: new Float32Array([0.0, 1.0, 0.0]),
      tangents: new Float32Array([1.0, 0.0, 0.0])
    };
    const target1 = {
      positions: new Float32Array([0.4, 0.5, 0.6])
    };

    const vertexCount = 1;
    const { targetData, targetCount } = packMorphTargets([target0, target1], vertexCount);

    expect(targetCount).toBe(2);
    expect(targetData.byteLength).toBe(2 * 1 * 48);

    const view = new DataView(targetData.buffer);

    // Target 0: Position delta [0.1, 0.2, 0.3, 0.0]
    expect(view.getFloat32(0, true)).toBeCloseTo(0.1);
    expect(view.getFloat32(4, true)).toBeCloseTo(0.2);
    expect(view.getFloat32(8, true)).toBeCloseTo(0.3);
    expect(view.getFloat32(12, true)).toBeCloseTo(0.0); // padding

    // Target 0: Normal delta [0.0, 1.0, 0.0, 0.0]
    expect(view.getFloat32(16, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(20, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(24, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(28, true)).toBeCloseTo(0.0); // padding

    // Target 0: Tangent delta [1.0, 0.0, 0.0, 0.0]
    expect(view.getFloat32(32, true)).toBeCloseTo(1.0);
    expect(view.getFloat32(36, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(40, true)).toBeCloseTo(0.0);
    expect(view.getFloat32(44, true)).toBeCloseTo(0.0); // padding

    // Target 1: Offset is 48
    expect(view.getFloat32(48 + 0, true)).toBeCloseTo(0.4);
    expect(view.getFloat32(48 + 4, true)).toBeCloseTo(0.5);
    expect(view.getFloat32(48 + 8, true)).toBeCloseTo(0.6);
    expect(view.getFloat32(48 + 12, true)).toBeCloseTo(0.0); // padding
    expect(view.getFloat32(48 + 16, true)).toBeCloseTo(0.0); // normal missing = 0
  });
});
