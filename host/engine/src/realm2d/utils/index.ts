/**
 * Realm 2D math, geometry and spatial utility functions.
 */
import type { Vec2 } from '../../math/vec2';

export interface AABB2D {
  min: [number, number];
  max: [number, number];
}

export function createAABB2D(minX: number, minY: number, maxX: number, maxY: number): AABB2D {
  return {
    min: [minX, minY],
    max: [maxX, maxY]
  };
}

export function containsPoint2D(aabb: AABB2D, point: [number, number] | Vec2): boolean {
  return (
    point[0] >= aabb.min[0] &&
    point[0] <= aabb.max[0] &&
    point[1] >= aabb.min[1] &&
    point[1] <= aabb.max[1]
  );
}

export function intersectsAABB2D(a: AABB2D, b: AABB2D): boolean {
  return (
    a.min[0] <= b.max[0] && a.max[0] >= b.min[0] && a.min[1] <= b.max[1] && a.max[1] >= b.min[1]
  );
}
