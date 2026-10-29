/**
 * 3D vector operations.
 */
import { EPSILON, equalsApprox } from './common';
import type { ReadonlyQuat } from './quat';
import type { ReadonlyMat4 } from './mat4';

export type Vec3 = Float32Array & {
  0: number;
  1: number;
  2: number;
};

export type ReadonlyVec3 = ArrayLike<number> & {
  0: number;
  1: number;
  2: number;
};

export function create(): Vec3 {
  return new Float32Array(3) as unknown as Vec3;
}

export function fromValues(x: number, y: number, z: number): Vec3 {
  const out = new Float32Array(3) as unknown as Vec3;
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function copy(out: Vec3, a: ReadonlyVec3): Vec3 {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function add(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}

export function subtract(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

export function multiply(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  out[2] = a[2] * b[2];
  return out;
}

export function scale(out: Vec3, a: ReadonlyVec3, b: number): Vec3 {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  return out;
}

export function distance(a: ReadonlyVec3, b: ReadonlyVec3): number {
  const x = b[0] - a[0];
  const y = b[1] - a[1];
  const z = b[2] - a[2];
  return Math.hypot(x, y, z);
}

export function length(a: ReadonlyVec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(out: Vec3, a: ReadonlyVec3): Vec3 {
  const x = a[0];
  const y = a[1];
  const z = a[2];
  let len = x * x + y * y + z * z;
  if (len > 0) {
    len = 1 / Math.sqrt(len);
  }
  out[0] = x * len;
  out[1] = y * len;
  out[2] = z * len;
  return out;
}

export function dot(a: ReadonlyVec3, b: ReadonlyVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];

  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function lerp(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3, t: number): Vec3 {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  out[2] = az + t * (b[2] - az);
  return out;
}

export function clamp(
  out: Vec3,
  a: ReadonlyVec3,
  min: ReadonlyVec3 | number,
  max: ReadonlyVec3 | number
): Vec3 {
  const minX = typeof min === 'number' ? min : min[0];
  const minY = typeof min === 'number' ? min : min[1];
  const minZ = typeof min === 'number' ? min : min[2];
  const maxX = typeof max === 'number' ? max : max[0];
  const maxY = typeof max === 'number' ? max : max[1];
  const maxZ = typeof max === 'number' ? max : max[2];
  out[0] = Math.min(Math.max(a[0], minX), maxX);
  out[1] = Math.min(Math.max(a[1], minY), maxY);
  out[2] = Math.min(Math.max(a[2], minZ), maxZ);
  return out;
}

export function transformQuat(out: Vec3, a: ReadonlyVec3, q: ReadonlyQuat): Vec3 {
  const qx = q[0];
  const qy = q[1];
  const qz = q[2];
  const qw = q[3];
  const x = a[0];
  const y = a[1];
  const z = a[2];

  let uvx = qy * z - qz * y;
  let uvy = qz * x - qx * z;
  let uvz = qx * y - qy * x;

  let uuvx = qy * uvz - qz * uvy;
  let uuvy = qz * uvx - qx * uvz;
  let uuvz = qx * uvy - qy * uvx;

  const w2 = qw * 2;
  uvx *= w2;
  uvy *= w2;
  uvz *= w2;

  uuvx *= 2;
  uuvy *= 2;
  uuvz *= 2;

  out[0] = x + uvx + uuvx;
  out[1] = y + uvy + uuvy;
  out[2] = z + uvz + uuvz;
  return out;
}

export function transformMat4(out: Vec3, a: ReadonlyVec3, m: ReadonlyMat4): Vec3 {
  const x = a[0];
  const y = a[1];
  const z = a[2];
  let w = m[3] * x + m[7] * y + m[11] * z + m[15];
  w = w || 1.0;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}

export function exactEquals(a: ReadonlyVec3, b: ReadonlyVec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function equals(a: ReadonlyVec3, b: ReadonlyVec3, epsilon: number = EPSILON): boolean {
  return (
    equalsApprox(a[0], b[0], epsilon) &&
    equalsApprox(a[1], b[1], epsilon) &&
    equalsApprox(a[2], b[2], epsilon)
  );
}
