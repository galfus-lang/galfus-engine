import { assertValidLogicalId } from '@galfus/transport-types';
import type { Component } from '../ecs/component';
import { mat2d, mat4, vec2, vec3 } from '../math';

export type ColliderShape2D =
  | { type: 'rectangle'; halfExtents: [number, number] }
  | { type: 'circle'; radius: number }
  | { type: 'polygon'; vertices: [number, number][] };

export type ColliderShape3D =
  | { type: 'box'; halfExtents: [number, number, number] }
  | { type: 'sphere'; radius: number }
  | { type: 'plane'; halfExtents: [number, number] };

export interface ColliderHit2D {
  entityId: number;
  colliderId: number;
  point: [number, number];
  normal: [number, number];
  distance: number;
  sensor: boolean;
}

export interface ColliderHit3D {
  entityId: number;
  colliderId: number;
  point: [number, number, number];
  normal: [number, number, number];
  distance: number;
  sensor: boolean;
}

export interface ColliderOptions {
  /** Local affine matrix, column-major, relative to the entity's Model. */
  matrix?: readonly number[];
  active?: boolean;
  sensor?: boolean;
  layer?: number;
  mask?: number;
}
export interface ColliderEntry<S> {
  readonly colliderId: number;
  readonly shape: S;
  readonly matrix: readonly number[];
  readonly active: boolean;
  readonly sensor: boolean;
  readonly layer: number;
  readonly mask: number;
}
const IDENTITY_2D = Array.from(mat2d.create());
const IDENTITY_3D = Array.from(mat4.create());
function validPolygon(vertices: [number, number][]): boolean {
  if (
    vertices.length < 3 ||
    vertices.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))
  )
    return false;
  let area = 0;
  const cross = (a: [number, number], b: [number, number], c: [number, number]) =>
    vec2.cross(vec2.subtract([0, 0], b, a), vec2.subtract([0, 0], c, a));
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    if (a[0] === b[0] && a[1] === b[1]) return false;
    area += vec2.cross(a, b);
    for (let j = i + 1; j < vertices.length; j++) {
      if (j === i + 1 || (i === 0 && j === vertices.length - 1)) continue;
      const c = vertices[j]!;
      const d = vertices[(j + 1) % vertices.length]!;
      const overlap =
        Math.min(a[0], b[0]) <= Math.max(c[0], d[0]) &&
        Math.min(c[0], d[0]) <= Math.max(a[0], b[0]) &&
        Math.min(a[1], b[1]) <= Math.max(c[1], d[1]) &&
        Math.min(c[1], d[1]) <= Math.max(a[1], b[1]);
      if (overlap && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0)
        return false;
    }
  }
  return Math.abs(area) > 1e-9;
}
function validateShape(shape: ColliderShape2D | ColliderShape3D): void {
  if (shape.type === 'circle' || shape.type === 'sphere') {
    if (!Number.isFinite(shape.radius) || shape.radius <= 0)
      throw new Error('Collider radius must be positive and finite.');
  } else if (shape.type === 'polygon') {
    if (!validPolygon(shape.vertices))
      throw new Error('Collider polygon must be simple, non-degenerate, and finite.');
  } else if (
    shape.halfExtents.length !== (shape.type === 'box' ? 3 : 2) ||
    shape.halfExtents.some((v) => !Number.isFinite(v) || v <= 0)
  ) {
    throw new Error('Collider half extents must be positive and finite.');
  }
}
function validateMask(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function validateRay(
  origin: readonly number[],
  direction: readonly number[],
  distance: number,
  mask: number,
  dimensions: 2 | 3
): void {
  if (
    origin.length !== dimensions ||
    direction.length !== dimensions ||
    origin.some((v) => !Number.isFinite(v)) ||
    direction.some((v) => !Number.isFinite(v)) ||
    direction.every((v) => v === 0) ||
    !Number.isFinite(
      dimensions === 2
        ? vec2.length([direction[0]!, direction[1]!])
        : vec3.length([direction[0]!, direction[1]!, direction[2]!])
    ) ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !validateMask(mask)
  ) {
    throw new Error('Invalid collider ray query.');
  }
}

export function validatePoint(point: readonly number[], mask: number): void {
  if (point.length !== 2 || point.some((v) => !Number.isFinite(v)) || !validateMask(mask))
    throw new Error('Invalid collider point query.');
}
const colliderEntries = Symbol('colliderEntries');
abstract class ColliderComponent<S extends ColliderShape2D | ColliderShape3D> implements Component {
  abstract readonly type: string;
  readonly [colliderEntries] = new Map<number, ColliderEntry<S>>();
  protected constructor(private readonly identity: readonly number[]) {}
  add(colliderId: number, shape: S, options: ColliderOptions = {}): this {
    assertValidLogicalId(colliderId, 'ColliderId');
    if (this[colliderEntries].has(colliderId))
      throw new Error(`Collider ${colliderId} already exists.`);
    return this.set(colliderId, shape, options);
  }
  set(colliderId: number, shape: S, options: ColliderOptions = {}): this {
    assertValidLogicalId(colliderId, 'ColliderId');
    validateShape(shape);
    const matrix = options.matrix ?? this.identity;
    if (matrix.length !== this.identity.length || matrix.some((v) => !Number.isFinite(v)))
      throw new Error('Invalid collider local matrix.');
    if (
      matrix.length === 16 &&
      (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1)
    )
      throw new Error('Collider 3D matrix must be affine.');
    const layer = options.layer ?? 0xffffffff;
    const mask = options.mask ?? 0xffffffff;
    if (!validateMask(layer) || !validateMask(mask))
      throw new Error('Collider layer and mask must be unsigned 32-bit integers.');
    this[colliderEntries].set(colliderId, {
      colliderId,
      shape: structuredClone(shape),
      matrix: [...matrix],
      active: options.active ?? true,
      sensor: options.sensor ?? false,
      layer,
      mask
    });
    return this;
  }
  remove(colliderId: number): boolean {
    return this[colliderEntries].delete(colliderId);
  }
  getShapes(): readonly ColliderEntry<S>[] {
    return Array.from(this[colliderEntries].values(), (entry) => structuredClone(entry));
  }
}
/** Internal query path; entries are immutable and may be retained by snapshots. */
export function getColliderEntries<S extends ColliderShape2D | ColliderShape3D>(
  component: ColliderComponent<S>
): IterableIterator<ColliderEntry<S>> {
  return component[colliderEntries].values();
}
export class Collider2DComponent extends ColliderComponent<ColliderShape2D> {
  readonly type = 'Collider2D';
  constructor() {
    super(IDENTITY_2D);
  }
}
export class Collider3DComponent extends ColliderComponent<ColliderShape3D> {
  readonly type = 'Collider3D';
  constructor() {
    super(IDENTITY_3D);
  }
}
export function createCollider2D(): Collider2DComponent {
  return new Collider2DComponent();
}
export function createCollider3D(): Collider3DComponent {
  return new Collider3DComponent();
}
