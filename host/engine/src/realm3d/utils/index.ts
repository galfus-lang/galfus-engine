/**
 * Realm 3D math and spatial utilities.
 */
import type { Vec3 } from '../../math/vec3';
import { vec3 } from '../../math/index';

export interface BoundingSphere3D {
  center: [number, number, number];
  radius: number;
}

export function createBoundingSphere3D(
  center: [number, number, number] | Vec3,
  radius: number
): BoundingSphere3D {
  return {
    center: [center[0], center[1], center[2]],
    radius
  };
}

export function intersectsSphere3D(a: BoundingSphere3D, b: BoundingSphere3D): boolean {
  const d = vec3.distance(a.center, b.center);
  return d <= a.radius + b.radius;
}
