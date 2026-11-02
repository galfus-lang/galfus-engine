import type { EcsWorld } from '../ecs/world';
import { mat4, type ReadonlyMat4, type ReadonlyVec3, vec3 } from '../math';
import type { Model3DComponent } from '../realm3d/components';
import {
  type Collider3DComponent,
  type ColliderHit3D,
  type ColliderShape3D,
  getColliderEntries,
  validateRay
} from './components';

type Point = [number, number, number];
export interface LocalRayHit3D {
  distance: number;
  normal: Point;
}
/** @internal Tests a ray already transformed to collider-local coordinates. */
export function intersectCollider3D(
  shape: ColliderShape3D,
  o: ReadonlyVec3,
  d: ReadonlyVec3,
  max: number,
  out: LocalRayHit3D = { distance: 0, normal: [0, 0, 0] }
): LocalRayHit3D | undefined {
  const normal = out.normal;
  normal[0] = 0;
  normal[1] = 0;
  normal[2] = 0;
  if (shape.type === 'sphere') {
    const a = vec3.dot(d, d);
    const b = vec3.dot(o, d);
    const c = vec3.dot(o, o) - shape.radius ** 2;
    if (c <= 0) {
      out.distance = 0;
      return out;
    }
    const discriminant = b * b - a * c;
    if (a <= 0 || discriminant < 0) return undefined;
    const distance = (-b - Math.sqrt(discriminant)) / a;
    if (distance < 0 || distance > max) return undefined;
    vec3.scaleAndAdd(normal, o, d, distance);
    vec3.normalize(normal, normal);
    out.distance = distance;
    return out;
  }
  if (shape.type === 'plane') {
    if (Math.abs(d[2]) < 1e-10) return undefined;
    const distance = -o[2] / d[2];
    vec3.scaleAndAdd(normal, o, d, distance);
    if (
      distance < 0 ||
      distance > max ||
      Math.abs(normal[0]) > shape.halfExtents[0] ||
      Math.abs(normal[1]) > shape.halfExtents[1]
    )
      return undefined;
    normal[0] = 0;
    normal[1] = 0;
    normal[2] = d[2] < 0 ? 1 : -1;
    out.distance = distance;
    return out;
  }
  const h = shape.halfExtents;
  if (Math.abs(o[0]) <= h[0] && Math.abs(o[1]) <= h[1] && Math.abs(o[2]) <= h[2]) {
    out.distance = 0;
    return out;
  }
  let near = 0;
  let far = max;
  for (let i = 0; i < 3; i++) {
    const v = d[i]!;
    const position = o[i]!;
    const half = h[i]!;
    if (Math.abs(v) < 1e-10) {
      if (Math.abs(position) > half) return undefined;
      continue;
    }
    let a = (-half - position) / v;
    let b = (half - position) / v;
    let sign = -1;
    if (a > b) {
      [a, b] = [b, a];
      sign = 1;
    }
    if (a > near) {
      near = a;
      normal[0] = 0;
      normal[1] = 0;
      normal[2] = 0;
      normal[i] = sign;
    }
    far = Math.min(far, b);
    if (near > far) return undefined;
  }
  out.distance = near;
  return out;
}
export function raycast3D(
  world: EcsWorld,
  origin: Point,
  direction: Point,
  maxDistance: number,
  mask = 0xffffffff
): ColliderHit3D[] {
  validateRay(origin, direction, maxDistance, mask, 3);
  const d = vec3.normalize([0, 0, 0], direction);
  const hits: ColliderHit3D[] = [];
  const seen = new Set<number>();
  const combined = mat4.create();
  const m = mat4.create();
  const o: Point = [0, 0, 0];
  const local: Point = [0, 0, 0];
  const intersection: LocalRayHit3D = { distance: 0, normal: [0, 0, 0] };
  for (const [entityId, component] of world.components.entries<Collider3DComponent>('Collider3D')) {
    const model = world.getComponent<Model3DComponent>(entityId, 'Model3D');
    if (!model) continue;
    for (const entry of getColliderEntries(component)) {
      if (seen.has(entry.colliderId))
        throw new Error(`Collider ID ${entry.colliderId} is used by more than one entity.`);
      seen.add(entry.colliderId);
      if (!entry.active || (entry.layer & mask) === 0) continue;
      mat4.multiply(combined, model.worldMatrix, entry.matrix as unknown as ReadonlyMat4);
      if (!mat4.invert(m, combined) || !m.every(Number.isFinite)) continue;
      vec3.transformMat4(o, origin, m);
      vec3.transformDirectionMat4(local, d, m);
      const hit = intersectCollider3D(entry.shape, o, local, maxDistance, intersection);
      if (!hit) continue;
      const normal = vec3.transformNormalMat4([0, 0, 0], hit.normal, m);
      vec3.normalize(normal, normal);
      hits.push({
        entityId,
        colliderId: entry.colliderId,
        point: vec3.add([0, 0, 0], origin, vec3.scale([0, 0, 0], d, hit.distance)),
        normal,
        distance: hit.distance,
        sensor: entry.sensor
      });
    }
  }
  return hits.sort((a, b) => a.distance - b.distance || a.colliderId - b.colliderId);
}
