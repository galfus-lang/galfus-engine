/**
 * Spatial bounding box and sphere computation for glTF 2.0 assets.
 */

import { mat4, quat } from '@galfus/engine';
import type { ModelBounds } from '@galfus/model-loader-types';
import type { GlTF, GlTFNode } from './types';

/**
 * Computes local 4x4 matrix for a glTF node from either matrix or TRS parameters.
 */
function getNodeLocalMatrix(node: GlTFNode, outMat: mat4.Mat4): void {
  if (node.matrix) {
    for (let i = 0; i < 16; i++) {
      outMat[i] = node.matrix[i] ?? (i % 5 === 0 ? 1 : 0);
    }
    return;
  }

  const t: [number, number, number] = node.translation ?? [0, 0, 0];
  const r: [number, number, number, number] = node.rotation ?? [0, 0, 0, 1];
  const s: [number, number, number] = node.scale ?? [1, 1, 1];

  mat4.fromRotationTranslationScale(outMat, r as unknown as quat.ReadonlyQuat, t, s);
}

/**
 * Transforms a 3D point by a 4x4 column-major matrix.
 */
function transformPoint(p: [number, number, number], m: mat4.Mat4): [number, number, number] {
  return [
    p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12],
    p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13],
    p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14]
  ];
}

/**
 * Calculates the axis-aligned bounding box (AABB) and bounding radius for a glTF asset.
 *
 * Traverses the node hierarchy from root scenes, applies accumulated world matrices,
 * and transforms the min/max extents of all mesh primitive POSITION accessors.
 *
 * @param gltf The parsed glTF 2.0 JSON structure.
 * @returns Spatial ModelBounds containing min, max, center, size, and radius, or undefined if empty.
 *
 * @example
 * ```typescript
 * const bounds = computeGltfBounds(gltf);
 * if (bounds) {
 *   console.log(`Model extents: ${bounds.size.join('x')} m`);
 *   console.log(`Bounding radius: ${bounds.radius.toFixed(2)} m`);
 * }
 * ```
 */
export function computeGltfBounds(gltf: GlTF): ModelBounds | undefined {
  if (!gltf.nodes || gltf.nodes.length === 0 || !gltf.meshes || gltf.meshes.length === 0) {
    return undefined;
  }

  const globalMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const globalMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let foundAnyVertex = false;

  const identityMat = mat4.create();

  function traverseNode(nodeIndex: number, parentWorldMat: mat4.Mat4): void {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) return;

    const localMat = mat4.create();
    getNodeLocalMatrix(node, localMat);

    const worldMat = mat4.create();
    mat4.multiply(worldMat, parentWorldMat, localMat);

    if (node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      if (mesh) {
        for (const prim of mesh.primitives) {
          const posAccIndex = prim.attributes?.POSITION;
          if (posAccIndex !== undefined) {
            const acc = gltf.accessors?.[posAccIndex];
            if (acc?.min && acc?.max && acc.min.length >= 3 && acc.max.length >= 3) {
              const minX = acc.min[0]!;
              const minY = acc.min[1]!;
              const minZ = acc.min[2]!;
              const maxX = acc.max[0]!;
              const maxY = acc.max[1]!;
              const maxZ = acc.max[2]!;

              const corners: [number, number, number][] = [
                [minX, minY, minZ],
                [maxX, minY, minZ],
                [minX, maxY, minZ],
                [maxX, maxY, minZ],
                [minX, minY, maxZ],
                [maxX, minY, maxZ],
                [minX, maxY, maxZ],
                [maxX, maxY, maxZ]
              ];

              for (const corner of corners) {
                const [tx, ty, tz] = transformPoint(corner, worldMat);
                if (tx < globalMin[0]) globalMin[0] = tx;
                if (tx > globalMax[0]) globalMax[0] = tx;
                if (ty < globalMin[1]) globalMin[1] = ty;
                if (ty > globalMax[1]) globalMax[1] = ty;
                if (tz < globalMin[2]) globalMin[2] = tz;
                if (tz > globalMax[2]) globalMax[2] = tz;
                foundAnyVertex = true;
              }
            }
          }
        }
      }
    }

    if (node.children) {
      for (const childIdx of node.children) {
        traverseNode(childIdx, worldMat);
      }
    }
  }

  // Traverse through active scene roots (or all root candidates)
  const activeSceneIdx = gltf.scene ?? 0;
  const activeScene = gltf.scenes?.[activeSceneIdx];
  const rootNodeIndices = activeScene?.nodes ?? (gltf.nodes.length > 0 ? [0] : []);

  for (const rootIdx of rootNodeIndices) {
    traverseNode(rootIdx, identityMat);
  }

  if (!foundAnyVertex || !isFinite(globalMin[0]) || !isFinite(globalMax[0])) {
    return undefined;
  }

  const size: [number, number, number] = [
    globalMax[0] - globalMin[0],
    globalMax[1] - globalMin[1],
    globalMax[2] - globalMin[2]
  ];

  const center: [number, number, number] = [
    (globalMin[0] + globalMax[0]) * 0.5,
    (globalMin[1] + globalMax[1]) * 0.5,
    (globalMin[2] + globalMax[2]) * 0.5
  ];

  const radius = Math.hypot(size[0], size[1], size[2]) * 0.5;

  return {
    min: globalMin,
    max: globalMax,
    center,
    size,
    radius
  };
}
