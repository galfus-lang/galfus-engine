/**
 * Quaternion operations.
 * Stored as a 4-element Float32Array: [x, y, z, w]
 */
import { EPSILON, equalsApprox } from './common';
import type { ReadonlyVec3 } from './vec3';

export type Quat = Float32Array & {
  0: number;
  1: number;
  2: number;
  3: number;
};

export type ReadonlyQuat = ArrayLike<number> & {
  0: number;
  1: number;
  2: number;
  3: number;
};

export function create(): Quat {
  const out = new Float32Array(4) as unknown as Quat;
  out[3] = 1;
  return out;
}

export function identity(out: Quat): Quat {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  return out;
}

export function fromValues(x: number, y: number, z: number, w: number): Quat {
  const out = new Float32Array(4) as unknown as Quat;
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

export function copy(out: Quat, a: ReadonlyQuat): Quat {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  return out;
}

export function set(out: Quat, x: number, y: number, z: number, w: number): Quat {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

export function setAxisAngle(out: Quat, axis: ReadonlyVec3, rad: number): Quat {
  const half = rad * 0.5;
  const s = Math.sin(half);
  out[0] = s * axis[0];
  out[1] = s * axis[1];
  out[2] = s * axis[2];
  out[3] = Math.cos(half);
  return out;
}

export function multiply(out: Quat, a: ReadonlyQuat, b: ReadonlyQuat): Quat {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];

  out[0] = ax * bw + aw * bx + ay * bz - az * by;
  out[1] = ay * bw + aw * by + az * bx - ax * bz;
  out[2] = az * bw + aw * bz + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function rotateX(out: Quat, a: ReadonlyQuat, rad: number): Quat {
  const half = rad * 0.5;
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = Math.sin(half);
  const bw = Math.cos(half);

  out[0] = ax * bw + aw * bx;
  out[1] = ay * bw + az * bx;
  out[2] = az * bw - ay * bx;
  out[3] = aw * bw - ax * bx;
  return out;
}

export function rotateY(out: Quat, a: ReadonlyQuat, rad: number): Quat {
  const half = rad * 0.5;
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const by = Math.sin(half);
  const bw = Math.cos(half);

  out[0] = ax * bw - az * by;
  out[1] = ay * bw + aw * by;
  out[2] = az * bw + ax * by;
  out[3] = aw * bw - ay * by;
  return out;
}

export function rotateZ(out: Quat, a: ReadonlyQuat, rad: number): Quat {
  const half = rad * 0.5;
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bz = Math.sin(half);
  const bw = Math.cos(half);

  out[0] = ax * bw + ay * bz;
  out[1] = ay * bw - ax * bz;
  out[2] = az * bw + aw * bz;
  out[3] = aw * bw - az * bz;
  return out;
}

export function invert(out: Quat, a: ReadonlyQuat): Quat {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const dot = a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
  const invDot = dot ? 1.0 / dot : 0;

  out[0] = -a0 * invDot;
  out[1] = -a1 * invDot;
  out[2] = -a2 * invDot;
  out[3] = a3 * invDot;
  return out;
}

export function conjugate(out: Quat, a: ReadonlyQuat): Quat {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  out[3] = a[3];
  return out;
}

export function slerp(out: Quat, a: ReadonlyQuat, b: ReadonlyQuat, t: number): Quat {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  let aw = a[3];
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];

  let cosom = ax * bx + ay * by + az * bz + aw * bw;
  if (cosom < 0.0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  let scale0: number;
  let scale1: number;

  if (1.0 - cosom > EPSILON) {
    const omega = Math.acos(cosom);
    const sinom = Math.sin(omega);
    scale0 = Math.sin((1.0 - t) * omega) / sinom;
    scale1 = Math.sin(t * omega) / sinom;
  } else {
    scale0 = 1.0 - t;
    scale1 = t;
  }

  out[0] = scale0 * ax + scale1 * bx;
  out[1] = scale0 * ay + scale1 * by;
  out[2] = scale0 * az + scale1 * bz;
  out[3] = scale0 * aw + scale1 * bw;
  return out;
}

export function fromEuler(out: Quat, x: number, y: number, z: number): Quat {
  const halfToRad = 0.5 * (Math.PI / 180.0);
  const xRad = x * halfToRad;
  const yRad = y * halfToRad;
  const zRad = z * halfToRad;

  const sx = Math.sin(xRad);
  const cx = Math.cos(xRad);
  const sy = Math.sin(yRad);
  const cy = Math.cos(yRad);
  const sz = Math.sin(zRad);
  const cz = Math.cos(zRad);

  out[0] = sx * cy * cz - cx * sy * sz;
  out[1] = cx * sy * cz + sx * cy * sz;
  out[2] = cx * cy * sz - sx * sy * cz;
  out[3] = cx * cy * cz + sx * sy * sz;
  return out;
}

export function equals(a: ReadonlyQuat, b: ReadonlyQuat, epsilon: number = EPSILON): boolean {
  return (
    equalsApprox(a[0], b[0], epsilon) &&
    equalsApprox(a[1], b[1], epsilon) &&
    equalsApprox(a[2], b[2], epsilon) &&
    equalsApprox(a[3], b[3], epsilon)
  );
}
