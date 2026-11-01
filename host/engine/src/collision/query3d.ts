import type { EcsWorld } from '../ecs/world';
import { mat4, type Mat4, vec3 } from '../math';
import type { Model3DComponent } from '../realm3d/components';
import {
  type Collider3DComponent,
  type ColliderHit3D,
  type ColliderShape3D,
  validateRay
} from './components';

type Point = [number, number, number];
function intersect(
  shape: ColliderShape3D,
  o: Point,
  d: Point,
  max: number
): { distance: number; normal: Point } | undefined {
  if (shape.type === 'sphere') {
    const a = vec3.dot(d, d);
    const b = vec3.dot(o, d);
    const c = vec3.dot(o, o) - shape.radius ** 2;
    if (c <= 0) return { distance: 0, normal: [0, 0, 0] };
    const discriminant = b * b - a * c;
    if (a <= 0 || discriminant < 0) return undefined;
    const distance = (-b - Math.sqrt(discriminant)) / a;
    if (distance < 0 || distance > max) return undefined;
    const point = vec3.add([0, 0, 0], o, vec3.scale([0, 0, 0], d, distance));
    return { distance, normal: vec3.normalize([0, 0, 0], point) };
  }
  if (shape.type === 'plane') {
    if (Math.abs(d[2]) < 1e-10) return undefined;
    const distance = -o[2] / d[2];
    const point = vec3.add([0, 0, 0], o, vec3.scale([0, 0, 0], d, distance));
    if (
      distance < 0 ||
      distance > max ||
      Math.abs(point[0]) > shape.halfExtents[0] ||
      Math.abs(point[1]) > shape.halfExtents[1]
    )
      return undefined;
    return { distance, normal: [0, 0, d[2] < 0 ? 1 : -1] };
  }
  const h = shape.halfExtents;
  if (Math.abs(o[0]) <= h[0] && Math.abs(o[1]) <= h[1] && Math.abs(o[2]) <= h[2])
    return { distance: 0, normal: [0, 0, 0] };
  let near = 0;
  let far = max;
  let normal: Point = [0, 0, 0];
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
      normal = [0, 0, 0];
      normal[i] = sign;
    }
    far = Math.min(far, b);
    if (near > far) return undefined;
  }
  return { distance: near, normal };
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
  for (const entityId of world.query('Collider3D')) {
    const model = world.getComponent<Model3DComponent>(entityId, 'Model3D');
    const component = world.getComponent<Collider3DComponent>(entityId, 'Collider3D');
    if (!model || !component) continue;
    for (const entry of component.getShapes()) {
      if (seen.has(entry.colliderId))
        throw new Error(`Collider ID ${entry.colliderId} is used by more than one entity.`);
      seen.add(entry.colliderId);
      if (!entry.active || (entry.layer & mask) === 0) continue;
      const combined = mat4.create();
      mat4.multiply(combined, model.worldMatrix, new Float32Array(entry.matrix) as Mat4);
      const m = mat4.invert(mat4.create(), combined);
      if (!m || !Array.from(m).every(Number.isFinite)) continue;
      const o = vec3.transformMat4([0, 0, 0], origin, m);
      const local = vec3.transformDirectionMat4([0, 0, 0], d, m);
      const hit = intersect(entry.shape, o, local, maxDistance);
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
