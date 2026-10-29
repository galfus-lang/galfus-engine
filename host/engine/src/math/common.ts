/**
 * Core mathematical constants and utility functions.
 */

/** Epsilon threshold for floating-point comparisons. */
export const EPSILON = 0.000001;

/** Degree-to-radian conversion factor. */
export const DEG2RAD = Math.PI / 180;

/** Radian-to-degree conversion factor. */
export const RAD2DEG = 180 / Math.PI;

/**
 * Interface guaranteeing numerical index access for vectors and matrices
 * under strict TypeScript noUncheckedIndexedAccess policy.
 */
export interface IndexedCollection extends Iterable<number> {
  readonly length: number;
  [index: number]: number;
}

/**
 * Converts degrees to radians.
 *
 * @param deg Angle in degrees.
 * @returns Angle in radians.
 */
export function toRadian(deg: number): number {
  return deg * DEG2RAD;
}

/**
 * Converts radians to degrees.
 *
 * @param rad Angle in radians.
 * @returns Angle in degrees.
 */
export function toDegree(rad: number): number {
  return rad * RAD2DEG;
}

/**
 * Tests whether two floating-point numbers are approximately equal within EPSILON.
 *
 * @param a First number.
 * @param b Second number.
 * @param epsilon Optional tolerance threshold (defaults to EPSILON).
 * @returns True if the numbers are approximately equal.
 */
export function equalsApprox(a: number, b: number, epsilon: number = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon * Math.max(1.0, Math.abs(a), Math.abs(b));
}

/**
 * Clamps a scalar value between a minimum and maximum limit.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linearly interpolates between two numbers.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}
