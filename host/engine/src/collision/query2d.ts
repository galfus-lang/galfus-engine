import type { EcsWorld } from '../ecs/world';
import { mat2d, type Mat2d, type ReadonlyMat2d, vec2 } from '../math';
import type { Model2DComponent } from '../realm2d/components';
import {
  type Collider2DComponent,
  type ColliderHit2D,
  type ColliderShape2D,
  getColliderEntries,
  validatePoint,
  validateRay
} from './components';

type Point = [number, number];
const EDGE: Point = [0, 0];
const POINT_A: Point = [0, 0];
const POINT_B: Point = [0, 0];
const RECT_VERTICES: Point[] = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0]
];
function vertices(shape: Exclude<ColliderShape2D, { type: 'circle' }>): Point[] {
  if (shape.type === 'polygon') return shape.vertices;
  const [x, y] = shape.halfExtents;
  vec2.set(RECT_VERTICES[0]!, -x, -y);
  vec2.set(RECT_VERTICES[1]!, x, -y);
  vec2.set(RECT_VERTICES[2]!, x, y);
  vec2.set(RECT_VERTICES[3]!, -x, y);
  return RECT_VERTICES;
}
/** @internal Tests a point already transformed to collider-local coordinates. */
export function containsColliderPoint2D(shape: ColliderShape2D, p: Point): boolean {
  if (shape.type === 'circle') return vec2.dot(p, p) <= shape.radius ** 2;
  if (shape.type === 'rectangle')
    return Math.abs(p[0]) <= shape.halfExtents[0] && Math.abs(p[1]) <= shape.halfExtents[1];
  const v = shape.vertices;
  let result = false;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    if (
      Math.abs(vec2.cross(vec2.subtract(EDGE, b, a), vec2.subtract(POINT_A, p, a))) <= 1e-7 &&
      vec2.dot(POINT_A, vec2.subtract(POINT_B, p, b)) <= 1e-7
    )
      return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function intersect(
  shape: ColliderShape2D,
  o: Point,
  d: Point,
  max: number
): { distance: number; normal: Point } | undefined {
  if (containsColliderPoint2D(shape, o)) return { distance: 0, normal: [0, 0] };
  if (shape.type === 'circle') {
    const a = vec2.dot(d, d);
    const b = vec2.dot(o, d);
    const disc = b * b - a * (vec2.dot(o, o) - shape.radius ** 2);
    if (a <= 0 || disc < 0) return undefined;
    const distance = (-b - Math.sqrt(disc)) / a;
    if (distance < 0 || distance > max) return undefined;
    const point: Point = [0, 0];
    vec2.add(point, o, vec2.scale(point, d, distance));
    return { distance, normal: vec2.normalize(point, point) };
  }
  const v = vertices(shape);
  let area = 0;
  let hit: { distance: number; normal: Point } | undefined;
  for (let i = 0; i < v.length; i++) area += vec2.cross(v[i]!, v[(i + 1) % v.length]!);
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const edge = vec2.subtract(EDGE, v[(i + 1) % v.length]!, a);
    const denominator = vec2.cross(d, edge);
    if (Math.abs(denominator) < 1e-10) continue;
    const delta = vec2.subtract(POINT_A, a, o);
    const distance = vec2.cross(delta, edge) / denominator;
    const along = vec2.cross(delta, d) / denominator;
    if (
      distance < 0 ||
      distance > max ||
      along < 0 ||
      along > 1 ||
      (hit && distance >= hit.distance)
    )
      continue;
    const sign = area > 0 ? 1 : -1;
    const normal: Point = [sign * edge[1], -sign * edge[0]];
    hit = { distance, normal: vec2.normalize(normal, normal) };
  }
  return hit;
}
function eachCollider(
  world: EcsWorld,
  mask: number,
  visit: (
    entityId: number,
    id: number,
    shape: ColliderShape2D,
    inverse: Mat2d,
    sensor: boolean
  ) => void
): void {
  const seen = new Set<number>();
  const combined = mat2d.create();
  const inverse = mat2d.create();
  for (const [entityId, component] of world.components.entries<Collider2DComponent>('Collider2D')) {
    const model = world.getComponent<Model2DComponent>(entityId, 'Model2D');
    if (!model) continue;
    for (const entry of getColliderEntries(component)) {
      if (seen.has(entry.colliderId))
        throw new Error(`Collider ID ${entry.colliderId} is used by more than one entity.`);
      seen.add(entry.colliderId);
      if (!entry.active || (entry.layer & mask) === 0) continue;
      mat2d.multiply(combined, model.worldMatrix, entry.matrix as unknown as ReadonlyMat2d);
      if (mat2d.invert(inverse, combined) && inverse.every(Number.isFinite))
        visit(entityId, entry.colliderId, entry.shape, inverse, entry.sensor);
    }
  }
}
export function queryPoint2D(world: EcsWorld, point: Point, mask = 0xffffffff): ColliderHit2D[] {
  validatePoint(point, mask);
  const hits: ColliderHit2D[] = [];
  const p: Point = [0, 0];
  eachCollider(world, mask, (entityId, colliderId, shape, m, sensor) => {
    vec2.transformMat2d(p, point, m);
    if (containsColliderPoint2D(shape, p))
      hits.push({ entityId, colliderId, point: [...point], normal: [0, 0], distance: 0, sensor });
  });
  return hits.sort((a, b) => a.colliderId - b.colliderId);
}
export function raycast2D(
  world: EcsWorld,
  origin: Point,
  direction: Point,
  maxDistance: number,
  mask = 0xffffffff
): ColliderHit2D[] {
  validateRay(origin, direction, maxDistance, mask, 2);
  const d = vec2.normalize([0, 0], direction);
  const hits: ColliderHit2D[] = [];
  const o: Point = [0, 0];
  const local: Point = [0, 0];
  eachCollider(world, mask, (entityId, colliderId, shape, m, sensor) => {
    vec2.transformMat2d(o, origin, m);
    vec2.transformDirectionMat2d(local, d, m);
    const hit = intersect(shape, o, local, maxDistance);
    if (!hit) return;
    const normal = vec2.transformNormalMat2d([0, 0], hit.normal, m);
    vec2.normalize(normal, normal);
    hits.push({
      entityId,
      colliderId,
      point: vec2.add([0, 0], origin, vec2.scale([0, 0], d, hit.distance)),
      normal,
      distance: hit.distance,
      sensor
    });
  });
  return hits.sort((a, b) => a.distance - b.distance || a.colliderId - b.colliderId);
}
