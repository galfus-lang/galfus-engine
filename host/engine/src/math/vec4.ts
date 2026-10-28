/**
 * 4D vector operations.
 */
import { EPSILON, equalsApprox } from './common';
import type { ReadonlyMat4 } from './mat4';

export type Vec4 = Float32Array & {
  0: number;
  1: number;
  2: number;
  3: number;
};

export type ReadonlyVec4 = ArrayLike<number> & {
  0: number;
  1: number;
  2: number;
  3: number;
};

export function create(): Vec4 {
  return new Float32Array(4) as unknown as Vec4;
}

export function fromValues(x: number, y: number, z: number, w: number): Vec4 {
  const out = new Float32Array(4) as unknown as Vec4;
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

export function copy(out: Vec4, a: ReadonlyVec4): Vec4 {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  return out;
}

export function set(out: Vec4, x: number, y: number, z: number, w: number): Vec4 {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

export function add(out: Vec4, a: ReadonlyVec4, b: ReadonlyVec4): Vec4 {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  return out;
}

export function subtract(out: Vec4, a: ReadonlyVec4, b: ReadonlyVec4): Vec4 {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  return out;
}

export function multiply(out: Vec4, a: ReadonlyVec4, b: ReadonlyVec4): Vec4 {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  out[2] = a[2] * b[2];
  out[3] = a[3] * b[3];
  return out;
}

export function scale(out: Vec4, a: ReadonlyVec4, b: number): Vec4 {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  return out;
}

export function distance(a: ReadonlyVec4, b: ReadonlyVec4): number {
  const x = b[0] - a[0];
  const y = b[1] - a[1];
  const z = b[2] - a[2];
  const w = b[3] - a[3];
  return Math.hypot(x, y, z, w);
}

export function length(a: ReadonlyVec4): number {
  return Math.hypot(a[0], a[1], a[2], a[3]);
}

export function normalize(out: Vec4, a: ReadonlyVec4): Vec4 {
  const x = a[0];
  const y = a[1];
  const z = a[2];
  const w = a[3];
  let len = x * x + y * y + z * z + w * w;
  if (len > 0) {
    len = 1 / Math.sqrt(len);
  }
  out[0] = x * len;
  out[1] = y * len;
  out[2] = z * len;
  out[3] = w * len;
  return out;
}

export function dot(a: ReadonlyVec4, b: ReadonlyVec4): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function lerp(out: Vec4, a: ReadonlyVec4, b: ReadonlyVec4, t: number): Vec4 {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  out[2] = az + t * (b[2] - az);
  out[3] = aw + t * (b[3] - aw);
  return out;
}

export function transformMat4(out: Vec4, a: ReadonlyVec4, m: ReadonlyMat4): Vec4 {
  const x = a[0];
  const y = a[1];
  const z = a[2];
  const w = a[3];
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
  out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
  return out;
}

export function exactEquals(a: ReadonlyVec4, b: ReadonlyVec4): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function equals(a: ReadonlyVec4, b: ReadonlyVec4, epsilon: number = EPSILON): boolean {
  return (
    equalsApprox(a[0], b[0], epsilon) &&
    equalsApprox(a[1], b[1], epsilon) &&
    equalsApprox(a[2], b[2], epsilon) &&
    equalsApprox(a[3], b[3], epsilon)
  );
}
