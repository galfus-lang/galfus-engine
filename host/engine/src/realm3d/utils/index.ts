/**
 * Realm 3D math and spatial utilities.
 */

import { quat, vec3 } from '../../math/index';
import type { ReadonlyVec3, Vec3 } from '../../math/vec3';

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

export function quatFromLookAt(
  eye: ReadonlyVec3,
  target: ReadonlyVec3,
  up: ReadonlyVec3 = [0, 1, 0]
): [number, number, number, number] {
  const q = quat.create();
  quat.fromLookAt(q, eye, target, up);
  return [q[0], q[1], q[2], q[3]];
}

export function quatFromAxisAngle(
  axis: ReadonlyVec3,
  angleRad: number
): [number, number, number, number] {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const q = quat.create();
  quat.setAxisAngle(q, [axis[0] / len, axis[1] / len, axis[2] / len], angleRad);
  return [q[0], q[1], q[2], q[3]];
}
