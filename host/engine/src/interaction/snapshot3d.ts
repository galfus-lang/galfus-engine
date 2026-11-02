import {
  type Collider3DComponent,
  type ColliderEntry,
  type ColliderShape3D,
  getColliderEntries
} from '../collision/components';
import { intersectCollider3D } from '../collision/query3d';
import { mat4, type Mat4, quat, type ReadonlyMat4, vec3, type Vec3 } from '../math';
import type { Camera3DComponent, Model3DComponent } from '../realm3d/components';
import type { Realm3D } from '../realm3d/realm';

interface Shape3D {
  inverse: Mat4;
  entry?: ColliderEntry<ColliderShape3D>;
}
export interface CameraSnapshot3D {
  id: number;
  slot: number;
  perspective: boolean;
  fov: number;
  scale: number;
  near: number;
  far: number;
  position: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}
const FORWARD: [number, number, number] = [0, 0, -1];
const UP: [number, number, number] = [0, 1, 0];
const RIGHT: [number, number, number] = [1, 0, 0];
const ALT_UP: [number, number, number] = [0, 0, 1];

export class TargetSnapshot3D {
  private readonly shapes: Shape3D[] = [];
  private count = 0;
  private readonly combined = mat4.create();
  private readonly previousModel = mat4.create();
  private hasModel = false;
  private readonly localOrigin = vec3.create();
  private readonly localDirection = vec3.create();
  private readonly hit: import('../collision/query3d').LocalRayHit3D = {
    distance: 0,
    normal: [0, 0, 0]
  };
  valid = false;
  exists = false;

  capture(realm: Realm3D, entityId: number, colliderId?: number): void {
    this.valid = false;
    this.exists = false;
    this.count = 0;
    const model = realm.world.getComponent<Model3DComponent>(entityId, 'Model3D');
    const collider = realm.world.getComponent<Collider3DComponent>(entityId, 'Collider3D');
    if (!model || !collider) return;
    let sameModel = this.hasModel;
    for (let i = 0; i < 16; i++)
      if (this.previousModel[i] !== model.worldMatrix[i]) sameModel = false;
    mat4.copy(this.previousModel, model.worldMatrix);
    this.hasModel = true;
    for (const entry of getColliderEntries(collider)) {
      if (colliderId !== undefined && colliderId !== entry.colliderId) continue;
      this.exists = true;
      if (!entry.active) continue;
      let saved = this.shapes[this.count];
      if (!saved) this.shapes.push((saved = { inverse: mat4.create() }));
      if (!sameModel || saved.entry !== entry) {
        mat4.multiply(this.combined, model.worldMatrix, entry.matrix as unknown as ReadonlyMat4);
        if (!mat4.invert(saved.inverse, this.combined)) {
          saved.entry = undefined;
          continue;
        }
        saved.entry = entry;
      }
      this.count++;
    }
    this.valid = this.count > 0;
  }

  distance(origin: Vec3, direction: Vec3, maxDistance: number): number | undefined {
    let closest = Infinity;
    for (let i = 0; i < this.count; i++) {
      const item = this.shapes[i]!;
      vec3.transformMat4(this.localOrigin, origin, item.inverse);
      vec3.transformDirectionMat4(this.localDirection, direction, item.inverse);
      if (!item.entry) continue;
      const hit = intersectCollider3D(
        item.entry.shape,
        this.localOrigin,
        this.localDirection,
        maxDistance,
        this.hit
      );
      if (hit && hit.distance < closest) closest = hit.distance;
    }
    return closest < Infinity ? closest : undefined;
  }
}

const rotation = quat.create();
const lookDirection = vec3.create();
export function captureCameras3D(realm: Realm3D, out: CameraSnapshot3D[]): void {
  let count = 0;
  for (const [entityId, camera] of realm.world.components.entries<Camera3DComponent>('Camera3D')) {
    const model = realm.world.getComponent<Model3DComponent>(entityId, 'Model3D');
    if (!model) continue;
    let saved = out[count];
    if (!saved)
      out[count] = saved = {
        id: 0,
        slot: 0,
        perspective: true,
        fov: 60,
        scale: 10,
        near: 0.1,
        far: 1000,
        position: vec3.create(),
        forward: vec3.create(),
        right: vec3.create(),
        up: vec3.create()
      };
    saved.id = camera.cameraId;
    saved.slot = camera.desc.cameraSlot ?? 0;
    saved.perspective = camera.desc.kind !== 'orthographic';
    saved.fov = camera.desc.fovY ?? 60;
    saved.scale = camera.desc.orthoScale ?? 10;
    saved.near = camera.desc.near ?? 0.1;
    saved.far = camera.desc.far ?? 1000;
    mat4.getTranslation(saved.position, model.worldMatrix);
    mat4.getRotation(rotation, model.worldMatrix);
    vec3.transformQuat(saved.forward, FORWARD, rotation);
    vec3.transformQuat(saved.up, UP, rotation);
    vec3.transformQuat(saved.right, RIGHT, rotation);
    const lookAt = camera.desc.lookAt;
    if (lookAt) {
      vec3.subtract(lookDirection, lookAt.target, saved.position);
      if (vec3.dot(lookDirection, lookDirection) > 1e-8) {
        vec3.normalize(saved.forward, lookDirection);
        vec3.cross(saved.right, saved.forward, lookAt.up ?? UP);
        if (vec3.dot(saved.right, saved.right) <= 1e-8)
          vec3.cross(saved.right, saved.forward, Math.abs(saved.forward[1]) < 0.99 ? UP : ALT_UP);
        vec3.normalize(saved.right, saved.right);
        vec3.cross(saved.up, saved.right, saved.forward);
        vec3.normalize(saved.up, saved.up);
      }
    }
    count++;
  }
  out.length = count;
}

export function pointerToRay3D(
  origin: Vec3,
  direction: Vec3,
  x: number,
  y: number,
  viewport: readonly [number, number, number, number],
  camera: CameraSnapshot3D
): number | undefined {
  const [left, top, width, height] = viewport;
  if (
    width <= 0 ||
    height <= 0 ||
    x < left ||
    y < top ||
    x >= left + width ||
    y >= top + height ||
    (camera.perspective && camera.near <= 0) ||
    camera.far <= camera.near
  )
    return;
  const u = (2 * (x - left)) / width - 1;
  const v = 1 - (2 * (y - top)) / height;
  let offsetX: number, offsetY: number;
  if (camera.perspective) {
    const half = Math.tan((camera.fov * Math.PI) / 360);
    offsetX = (u * half * width) / height;
    offsetY = v * half;
    for (let i = 0; i < 3; i++)
      direction[i] = camera.forward[i]! + camera.right[i]! * offsetX + camera.up[i]! * offsetY;
    vec3.normalize(direction, direction);
    const cosine = vec3.dot(direction, camera.forward);
    if (cosine <= 0) return;
    vec3.scaleAndAdd(origin, camera.position, direction, camera.near / cosine);
    return (camera.far - camera.near) / cosine;
  }
  offsetX = (u * camera.scale * width) / height / 2;
  offsetY = (v * camera.scale) / 2;
  for (let i = 0; i < 3; i++) {
    direction[i] = camera.forward[i]!;
    origin[i] =
      camera.position[i]! +
      camera.right[i]! * offsetX +
      camera.up[i]! * offsetY +
      camera.forward[i]! * camera.near;
  }
  return camera.far - camera.near;
}
