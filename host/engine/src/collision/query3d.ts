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
  uv?: [number, number];
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
    const u = (normal[0] + shape.halfExtents[0]) / (2 * shape.halfExtents[0]);
    const v = (shape.halfExtents[1] - normal[1]) / (2 * shape.halfExtents[1]);
    out.uv = [Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v))];
    normal[0] = 0;
    normal[1] = 0;
    normal[2] = d[2] < 0 ? 1 : -1;
    out.distance = distance;
    return out;
  }
  if (shape.type === 'cylinder') {
    const r = shape.radius;
    const hh = shape.halfHeight;
    if (o[0] * o[0] + o[2] * o[2] <= r * r && Math.abs(o[1]) <= hh) {
      out.distance = 0;
      return out;
    }
    let bestT = max + 1;
    let hitKind = 0;
    const a = d[0] * d[0] + d[2] * d[2];
    const b = o[0] * d[0] + o[2] * d[2];
    const c = o[0] * o[0] + o[2] * o[2] - r * r;
    if (a > 1e-10) {
      const disc = b * b - a * c;
      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        const t0 = (-b - sqrtDisc) / a;
        if (t0 >= 0 && t0 <= max) {
          const y = o[1] + t0 * d[1];
          if (Math.abs(y) <= hh && t0 < bestT) {
            bestT = t0;
            hitKind = 1;
          }
        }
      }
    }
    if (Math.abs(d[1]) > 1e-10) {
      const tTop = (hh - o[1]) / d[1];
      if (tTop >= 0 && tTop <= max && tTop < bestT) {
        const x = o[0] + tTop * d[0];
        const z = o[2] + tTop * d[2];
        if (x * x + z * z <= r * r) {
          bestT = tTop;
          hitKind = 2;
        }
      }
      const tBot = (-hh - o[1]) / d[1];
      if (tBot >= 0 && tBot <= max && tBot < bestT) {
        const x = o[0] + tBot * d[0];
        const z = o[2] + tBot * d[2];
        if (x * x + z * z <= r * r) {
          bestT = tBot;
          hitKind = 3;
        }
      }
    }
    if (hitKind === 0) return undefined;
    out.distance = bestT;
    if (hitKind === 1) {
      normal[0] = (o[0] + bestT * d[0]) / r;
      normal[1] = 0;
      normal[2] = (o[2] + bestT * d[2]) / r;
    } else if (hitKind === 2) {
      normal[0] = 0;
      normal[1] = 1;
      normal[2] = 0;
    } else {
      normal[0] = 0;
      normal[1] = -1;
      normal[2] = 0;
    }
    return out;
  }
  if (shape.type === 'capsule') {
    const r = shape.radius;
    const hh = shape.halfHeight;
    const clampedY = Math.max(-hh, Math.min(hh, o[1]));
    const dy = o[1] - clampedY;
    if (o[0] * o[0] + dy * dy + o[2] * o[2] <= r * r) {
      out.distance = 0;
      return out;
    }
    let bestT = max + 1;
    let hitCenterY = 0;
    const a = d[0] * d[0] + d[2] * d[2];
    const b = o[0] * d[0] + o[2] * d[2];
    const c = o[0] * o[0] + o[2] * o[2] - r * r;
    if (a > 1e-10) {
      const disc = b * b - a * c;
      if (disc >= 0) {
        const t0 = (-b - Math.sqrt(disc)) / a;
        if (t0 >= 0 && t0 <= max) {
          const y = o[1] + t0 * d[1];
          if (Math.abs(y) <= hh && t0 < bestT) {
            bestT = t0;
            hitCenterY = y;
          }
        }
      }
    }
    for (const cy of [hh, -hh]) {
      const so: Point = [o[0], o[1] - cy, o[2]];
      const sa = vec3.dot(d, d);
      const sb = vec3.dot(so, d);
      const sc = vec3.dot(so, so) - r * r;
      const sdisc = sb * sb - sa * sc;
      if (sa > 0 && sdisc >= 0) {
        const st = (-sb - Math.sqrt(sdisc)) / sa;
        if (st >= 0 && st <= max && st < bestT) {
          const py = o[1] + st * d[1];
          if ((cy > 0 && py >= hh) || (cy < 0 && py <= -hh)) {
            bestT = st;
            hitCenterY = cy;
          }
        }
      }
    }
    if (bestT > max) return undefined;
    out.distance = bestT;
    normal[0] = o[0] + bestT * d[0];
    normal[1] = o[1] + bestT * d[1] - hitCenterY;
    normal[2] = o[2] + bestT * d[2];
    vec3.normalize(normal, normal);
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
  const localCenter: Point = [0, 0, 0];
  const worldCenter: Point = [0, 0, 0];
  const intersection: LocalRayHit3D = { distance: 0, normal: [0, 0, 0] };
  for (const [entityId, component] of world.components.entries<Collider3DComponent>('Collider3D')) {
    const model = world.getComponent<Model3DComponent>(entityId, 'Model3D');
    if (!model) continue;
    for (const entry of getColliderEntries(component)) {
      if (seen.has(entry.colliderId))
        throw new Error(`Collider ID ${entry.colliderId} is used by more than one entity.`);
      seen.add(entry.colliderId);
      if (!entry.active || (entry.layer & mask) === 0) continue;

      const rLocal = entry.boundingRadius;
      if (rLocal !== undefined && rLocal > 0) {
        localCenter[0] = entry.matrix[12]!;
        localCenter[1] = entry.matrix[13]!;
        localCenter[2] = entry.matrix[14]!;
        vec3.transformMat4(worldCenter, localCenter, model.worldMatrix);

        const wm = model.worldMatrix;
        const sx = wm[0]! * wm[0]! + wm[1]! * wm[1]! + wm[2]! * wm[2]!;
        const sy = wm[4]! * wm[4]! + wm[5]! * wm[5]! + wm[6]! * wm[6]!;
        const sz = wm[8]! * wm[8]! + wm[9]! * wm[9]! + wm[10]! * wm[10]!;
        const rWorld = rLocal * Math.sqrt(Math.max(sx, sy, sz));

        const vx = worldCenter[0] - origin[0]!;
        const vy = worldCenter[1] - origin[1]!;
        const vz = worldCenter[2] - origin[2]!;
        const proj = vx * d[0]! + vy * d[1]! + vz * d[2]!;
        if (proj < -rWorld || proj > maxDistance + rWorld) continue;
        const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
        if (perpSq > rWorld * rWorld) continue;
      }

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
