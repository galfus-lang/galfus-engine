import type { SvgElementRect } from '@galfus/transport-types';
import {
  type Collider2DComponent,
  type ColliderEntry,
  type ColliderShape2D,
  getColliderEntries
} from '../collision/components';
import { containsColliderPoint2D } from '../collision/query2d';
import { mat2d, type Mat2d, type ReadonlyMat2d, vec2 } from '../math';
import type {
  Camera2DComponent,
  Model2DComponent,
  Shape2DComponent,
  Sprite2DComponent,
  Svg2DComponent
} from '../realm2d/components';
import type { Realm2D } from '../realm2d/realm';
import type { InteractiveTarget } from './types';

interface ShapeSnapshot {
  inverse: Mat2d;
  entry?: ColliderEntry<ColliderShape2D>;
}
export interface CameraSnapshot2D {
  id: number;
  slot: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  near: number;
  far: number;
}
/** Reused storage for the 2D state submitted by one successful dispatch. */
export class TargetSnapshot2D {
  private readonly shapes: ShapeSnapshot[] = [];
  private count = 0;
  private readonly combined = mat2d.create();
  private readonly previousModel = mat2d.create();
  private hasModel = false;
  private readonly svgInverse = mat2d.create();
  private svgRect?: Readonly<SvgElementRect>;
  private svgWidth = 0;
  private svgHeight = 0;
  private readonly point: [number, number] = [0, 0];
  private readonly svgPosition = vec2.create();
  private readonly svgScale = vec2.create();
  zLayer = 0;
  drawOrder = 0;
  resourceId = 0;
  valid = false;
  exists = false;

  capture(realm: Realm2D, entityId: number, target: InteractiveTarget): void {
    const wasValid = this.valid;
    this.valid = false;
    this.exists = false;
    this.count = 0;
    const model = realm.world.getComponent<Model2DComponent>(entityId, 'Model2D');
    if (!model) return;
    let sameModel = this.hasModel;
    for (let i = 0; i < 6; i++)
      if (this.previousModel[i] !== model.worldMatrix[i]) sameModel = false;
    mat2d.copy(this.previousModel, model.worldMatrix);
    this.hasModel = true;
    this.zLayer = model.zLayer;
    this.drawOrder =
      realm.world.getComponent<Svg2DComponent>(entityId, 'Svg2D')?.desc.drawOrder ??
      realm.world.getComponent<Sprite2DComponent>(entityId, 'Sprite2D')?.desc.drawOrder ??
      realm.world.getComponent<Shape2DComponent>(entityId, 'Shape2D')?.desc.drawOrder ??
      model.drawOrder;
    this.resourceId = model.modelId;
    if (target.type === 'collider') {
      const component = realm.world.getComponent<Collider2DComponent>(entityId, 'Collider2D');
      if (!component) return;
      for (const entry of getColliderEntries(component)) {
        if (target.colliderId !== undefined && entry.colliderId !== target.colliderId) continue;
        this.exists = true;
        if (!entry.active) continue;
        let saved = this.shapes[this.count];
        if (!saved) {
          saved = { inverse: mat2d.create() };
          this.shapes.push(saved);
        }
        if (!sameModel || saved.entry !== entry) {
          mat2d.multiply(
            this.combined,
            model.worldMatrix,
            entry.matrix as unknown as ReadonlyMat2d
          );
          if (!mat2d.invert(saved.inverse, this.combined)) {
            saved.entry = undefined;
            continue;
          }
          saved.entry = entry;
        }
        this.count++;
      }
      this.valid = this.count > 0;
      return;
    }
    const svg = realm.world.getComponent<Svg2DComponent>(entityId, 'Svg2D');
    if (!svg || svg.svgId !== target.svgId) return;
    const rect = realm.getSvgElementRect(svg.svgId, target.elementId);
    if (!rect || !rect.viewportWidth || !rect.viewportHeight) return;
    const width = svg.desc.dimensions?.[0] ?? rect.viewportWidth;
    const height = svg.desc.dimensions?.[1] ?? rect.viewportHeight;
    if (
      wasValid &&
      sameModel &&
      rect === this.svgRect &&
      width === this.svgWidth &&
      height === this.svgHeight
    ) {
      this.valid = true;
      return;
    }
    // Renderer decomposes the world transform into translation, rotation and signed scale.
    mat2d.getTranslation(this.svgPosition, model.worldMatrix);
    mat2d.getScaling(this.svgScale, model.worldMatrix);
    mat2d.fromRotationTranslationScale(
      this.combined,
      this.svgPosition,
      mat2d.getRotation(model.worldMatrix),
      this.svgScale
    );
    if (!mat2d.invert(this.svgInverse, this.combined)) return;
    this.svgRect = rect;
    this.svgWidth = width;
    this.svgHeight = height;
    this.valid = this.svgWidth > 0 && this.svgHeight > 0;
  }

  contains(
    worldPoint: [number, number],
    target: InteractiveTarget,
    outUv?: [number, number]
  ): boolean {
    if (!this.valid) return false;
    if (target.type === 'collider') {
      for (let i = 0; i < this.count; i++) {
        const shape = this.shapes[i]!;
        vec2.transformMat2d(this.point, worldPoint, shape.inverse);
        if (shape.entry && containsColliderPoint2D(shape.entry.shape, this.point)) {
          if (outUv && shape.entry.shape.type === 'rectangle') {
            const hx = shape.entry.shape.halfExtents[0];
            const hy = shape.entry.shape.halfExtents[1];
            outUv[0] = Math.max(0, Math.min(1, (this.point[0] + hx) / (2 * hx)));
            outUv[1] = Math.max(0, Math.min(1, (hy - this.point[1]) / (2 * hy)));
          }
          return true;
        }
      }
      return false;
    }
    const rect = this.svgRect!;
    vec2.transformMat2d(this.point, worldPoint, this.svgInverse);
    const x = (this.point[0] / this.svgWidth + 0.5) * rect.viewportWidth;
    const y = (0.5 - this.point[1] / this.svgHeight) * rect.viewportHeight;
    const inside =
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    if (inside && outUv) {
      outUv[0] = Math.max(0, Math.min(1, (x - rect.x) / (rect.width || 1)));
      outUv[1] = Math.max(0, Math.min(1, (y - rect.y) / (rect.height || 1)));
    }
    return inside;
  }
}

export function captureCameras2D(realm: Realm2D, out: CameraSnapshot2D[]): void {
  let count = 0;
  for (const [entityId, camera] of realm.world.components.entries<Camera2DComponent>('Camera2D')) {
    if (camera.desc.active === false) continue;
    const model = realm.world.getComponent<Model2DComponent>(entityId, 'Model2D');
    if (!model) continue;
    let saved = out[count];
    if (!saved)
      out[count] = saved = { id: 0, slot: 0, x: 0, y: 0, rotation: 0, scale: 0, near: 0, far: 0 };
    saved.id = camera.cameraId;
    saved.slot = camera.desc.cameraSlot ?? 0;
    saved.x = model.worldMatrix[4];
    saved.y = model.worldMatrix[5];
    saved.rotation = mat2d.getRotation(model.worldMatrix);
    saved.scale = camera.desc.orthoScale;
    saved.near = camera.desc.near ?? -1000;
    saved.far = camera.desc.far ?? 1000;
    count++;
  }
  out.length = count;
}

/** Maps a physical pixel in a resolved viewport into world coordinates. */
export function pointerToWorld2D(
  out: [number, number],
  x: number,
  y: number,
  viewport: readonly [number, number, number, number],
  camera: CameraSnapshot2D
): boolean {
  const [left, top, width, height] = viewport;
  if (width <= 0 || height <= 0 || x < left || y < top || x >= left + width || y >= top + height)
    return false;
  const localX = (((x - left) / width - 0.5) * camera.scale * width) / height;
  const localY = (0.5 - (y - top) / height) * camera.scale;
  const sin = Math.sin(camera.rotation),
    cos = Math.cos(camera.rotation);
  out[0] = camera.x + localX * cos - localY * sin;
  out[1] = camera.y + localX * sin + localY * cos;
  return true;
}
