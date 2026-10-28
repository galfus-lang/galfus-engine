/**
 * 2D vector operations.
 */
import { EPSILON, equalsApprox, type IndexedCollection } from './common';
import type { ReadonlyMat2d } from './mat2d';

export type Vec2 = Float32Array & {
  0: number;
  1: number;
};

export type ReadonlyVec2 = ArrayLike<number> & {
  0: number;
  1: number;
};

export function create(): Vec2 {
  return new Float32Array(2) as unknown as Vec2;
}

export function fromValues(x: number, y: number): Vec2 {
  const out = new Float32Array(2) as unknown as Vec2;
  out[0] = x;
  out[1] = y;
  return out;
}

export function copy(out: Vec2, a: ReadonlyVec2): Vec2 {
  out[0] = a[0];
  out[1] = a[1];
  return out;
}

export function set(out: Vec2, x: number, y: number): Vec2 {
  out[0] = x;
  out[1] = y;
  return out;
}

export function add(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2): Vec2 {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  return out;
}

export function subtract(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2): Vec2 {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  return out;
}

export function multiply(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2): Vec2 {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  return out;
}

export function scale(out: Vec2, a: ReadonlyVec2, b: number): Vec2 {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  return out;
}

export function distance(a: ReadonlyVec2, b: ReadonlyVec2): number {
  const x = b[0] - a[0];
  const y = b[1] - a[1];
  return Math.hypot(x, y);
}

export function length(a: ReadonlyVec2): number {
  return Math.hypot(a[0], a[1]);
}

export function normalize(out: Vec2, a: ReadonlyVec2): Vec2 {
  const x = a[0];
  const y = a[1];
  let len = x * x + y * y;
  if (len > 0) {
    len = 1 / Math.sqrt(len);
  }
  out[0] = x * len;
  out[1] = y * len;
  return out;
}

export function dot(a: ReadonlyVec2, b: ReadonlyVec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function cross(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

export function lerp(out: Vec2, a: ReadonlyVec2, b: ReadonlyVec2, t: number): Vec2 {
  const ax = a[0];
  const ay = a[1];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  return out;
}

export function transformMat2d(out: Vec2, a: ReadonlyVec2, m: ReadonlyMat2d): Vec2 {
  const x = a[0];
  const y = a[1];
  out[0] = m[0] * x + m[2] * y + m[4];
  out[1] = m[1] * x + m[3] * y + m[5];
  return out;
}

export function exactEquals(a: ReadonlyVec2, b: ReadonlyVec2): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function equals(a: ReadonlyVec2, b: ReadonlyVec2, epsilon: number = EPSILON): boolean {
  return equalsApprox(a[0], b[0], epsilon) && equalsApprox(a[1], b[1], epsilon);
}
