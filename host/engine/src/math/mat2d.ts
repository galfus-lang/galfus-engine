/**
 * 2x3 affine transformation matrix for 2D graphics.
 *
 * Stored as a 6-element Float32Array: [a, b, c, d, tx, ty]
 * Corresponding to the matrix:
 * | a  c  tx |
 * | b  d  ty |
 * | 0  0  1  |
 */
import { EPSILON, equalsApprox } from './common';
import type { ReadonlyVec2, Vec2 } from './vec2';

export type Mat2d = Float32Array & {
  0: number;
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
};

export type ReadonlyMat2d = ArrayLike<number> & {
  0: number;
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
};

export function create(): Mat2d {
  const out = new Float32Array(6) as unknown as Mat2d;
  out[0] = 1;
  out[3] = 1;
  return out;
}

export function identity(out: Mat2d): Mat2d {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  out[4] = 0;
  out[5] = 0;
  return out;
}

export function copy(out: Mat2d, a: ReadonlyMat2d): Mat2d {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  return out;
}

export function fromValues(
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number
): Mat2d {
  const out = new Float32Array(6) as unknown as Mat2d;
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
  out[4] = tx;
  out[5] = ty;
  return out;
}

export function multiply(out: Mat2d, a: ReadonlyMat2d, b: ReadonlyMat2d): Mat2d {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];

  const b0 = b[0];
  const b1 = b[1];
  const b2 = b[2];
  const b3 = b[3];
  const b4 = b[4];
  const b5 = b[5];

  out[0] = a0 * b0 + a2 * b1;
  out[1] = a1 * b0 + a3 * b1;
  out[2] = a0 * b2 + a2 * b3;
  out[3] = a1 * b2 + a3 * b3;
  out[4] = a0 * b4 + a2 * b5 + a4;
  out[5] = a1 * b4 + a3 * b5 + a5;
  return out;
}

export function fromTranslation(out: Mat2d, v: ReadonlyVec2): Mat2d {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  out[4] = v[0];
  out[5] = v[1];
  return out;
}

export function fromRotation(out: Mat2d, rad: number): Mat2d {
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  out[0] = c;
  out[1] = s;
  out[2] = -s;
  out[3] = c;
  out[4] = 0;
  out[5] = 0;
  return out;
}

export function fromScaling(out: Mat2d, v: ReadonlyVec2): Mat2d {
  out[0] = v[0];
  out[1] = 0;
  out[2] = 0;
  out[3] = v[1];
  out[4] = 0;
  out[5] = 0;
  return out;
}

export function fromRotationTranslationScale(
  out: Mat2d,
  translation: ReadonlyVec2,
  rotationRad: number,
  scale: ReadonlyVec2
): Mat2d {
  const s = Math.sin(rotationRad);
  const c = Math.cos(rotationRad);
  const sx = scale[0];
  const sy = scale[1];

  out[0] = c * sx;
  out[1] = s * sx;
  out[2] = -s * sy;
  out[3] = c * sy;
  out[4] = translation[0];
  out[5] = translation[1];
  return out;
}

export function translate(out: Mat2d, a: ReadonlyMat2d, v: ReadonlyVec2): Mat2d {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];
  const vx = v[0];
  const vy = v[1];

  out[0] = a0;
  out[1] = a1;
  out[2] = a2;
  out[3] = a3;
  out[4] = a0 * vx + a2 * vy + a4;
  out[5] = a1 * vx + a3 * vy + a5;
  return out;
}

export function rotate(out: Mat2d, a: ReadonlyMat2d, rad: number): Mat2d {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];
  const s = Math.sin(rad);
  const c = Math.cos(rad);

  out[0] = a0 * c + a2 * s;
  out[1] = a1 * c + a3 * s;
  out[2] = a0 * -s + a2 * c;
  out[3] = a1 * -s + a3 * c;
  out[4] = a4;
  out[5] = a5;
  return out;
}

export function scale(out: Mat2d, a: ReadonlyMat2d, v: ReadonlyVec2): Mat2d {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];
  const vx = v[0];
  const vy = v[1];

  out[0] = a0 * vx;
  out[1] = a1 * vx;
  out[2] = a2 * vy;
  out[3] = a3 * vy;
  out[4] = a4;
  out[5] = a5;
  return out;
}

export function invert(out: Mat2d, a: ReadonlyMat2d): Mat2d | null {
  const aa = a[0];
  const ab = a[1];
  const ac = a[2];
  const ad = a[3];
  const atx = a[4];
  const aty = a[5];

  let det = aa * ad - ab * ac;
  if (!det) {
    return null;
  }
  det = 1.0 / det;

  out[0] = ad * det;
  out[1] = -ab * det;
  out[2] = -ac * det;
  out[3] = aa * det;
  out[4] = (ac * aty - ad * atx) * det;
  out[5] = (ab * atx - aa * aty) * det;
  return out;
}

export function determinant(a: ReadonlyMat2d): number {
  return a[0] * a[3] - a[1] * a[2];
}

export function equals(a: ReadonlyMat2d, b: ReadonlyMat2d, epsilon: number = EPSILON): boolean {
  return (
    equalsApprox(a[0], b[0], epsilon) &&
    equalsApprox(a[1], b[1], epsilon) &&
    equalsApprox(a[2], b[2], epsilon) &&
    equalsApprox(a[3], b[3], epsilon) &&
    equalsApprox(a[4], b[4], epsilon) &&
    equalsApprox(a[5], b[5], epsilon)
  );
}

/**
 * Copies the 2D translation components from `from` into `out`.
 */
export function copyPosition(out: Mat2d, from: ReadonlyMat2d): Mat2d {
  out[4] = from[4];
  out[5] = from[5];
  return out;
}

/**
 * Sets the 2D translation components in `out`.
 */
export function setTranslation(out: Mat2d, xOrVec: number | ReadonlyVec2, y?: number): Mat2d {
  if (typeof xOrVec === 'number') {
    out[4] = xOrVec;
    out[5] = y ?? 0;
  } else {
    out[4] = xOrVec[0];
    out[5] = xOrVec[1];
  }
  return out;
}

/**
 * Extracts the 2D translation vector from `mat` into `out`.
 */
export function getTranslation(out: Vec2, mat: ReadonlyMat2d): Vec2 {
  out[0] = mat[4];
  out[1] = mat[5];
  return out;
}

/**
 * Performs a component-wise linear interpolation between two 2D affine transformation matrices.
 */
export function lerp(out: Mat2d, a: ReadonlyMat2d, b: ReadonlyMat2d, t: number): Mat2d {
  out[0] = a[0] + t * (b[0] - a[0]);
  out[1] = a[1] + t * (b[1] - a[1]);
  out[2] = a[2] + t * (b[2] - a[2]);
  out[3] = a[3] + t * (b[3] - a[3]);
  out[4] = a[4] + t * (b[4] - a[4]);
  out[5] = a[5] + t * (b[5] - a[5]);
  return out;
}

/**
 * Clamps each component of a 2D affine transformation matrix between min and max.
 */
export function clamp(
  out: Mat2d,
  a: ReadonlyMat2d,
  min: ReadonlyMat2d | number,
  max: ReadonlyMat2d | number
): Mat2d {
  for (let i = 0; i < 6; i++) {
    const minVal = typeof min === 'number' ? min : min[i]!;
    const maxVal = typeof max === 'number' ? max : max[i]!;
    out[i] = Math.min(Math.max(a[i]!, minVal), maxVal);
  }
  return out;
}
