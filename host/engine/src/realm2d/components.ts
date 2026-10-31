/**
 * Realm 2D component declarations.
 * Incorporates spatial Model2D with contiguous local/world matrices and SpatialDirtyFlags.
 */
import type { Component } from '../ecs/component';
import { mat2d, vec2, type Mat2d, type Vec2 } from '../math/index';
import { SpatialDirtyFlags } from '../spatial/flags';
import type {
  Camera2DDesc,
  Light2DDesc,
  ParticleEmitter2DDesc,
  Shape2DDesc,
  Sprite2DDesc,
  Svg2DDesc
} from '@galfus/transport-types';

/**
 * 2D Spatial node component holding dual 2D affine matrices (local and resolved world)
 * and a two-stage dirty flag state machine (LocalDirty -> WorldDirty -> Clean).
 */
export class Model2DComponent implements Component {
  readonly type = 'Model2D' as const;
  readonly modelId: number;
  readonly localMatrix: Mat2d;
  readonly worldMatrix: Mat2d;
  zLayer: number;
  drawOrder: number;
  flags: SpatialDirtyFlags;

  constructor(modelId: number, initialLocal?: Float32Array | number[]) {
    this.modelId = modelId;
    this.localMatrix = mat2d.create();
    this.worldMatrix = mat2d.create();
    if (initialLocal) {
      this.localMatrix.set(initialLocal);
      this.worldMatrix.set(initialLocal);
    }
    this.zLayer = 0;
    this.drawOrder = 0;
    this.flags = SpatialDirtyFlags.LocalDirty | SpatialDirtyFlags.WorldDirty;
  }

  setPosition(x: number, y: number): this {
    this.localMatrix[4] = x;
    this.localMatrix[5] = y;
    this.flags |= SpatialDirtyFlags.LocalDirty;
    return this;
  }

  setRotation(rad: number): this {
    const p = vec2.fromValues(this.localMatrix[4], this.localMatrix[5]);
    const sx = Math.hypot(this.localMatrix[0], this.localMatrix[1]);
    const sy = Math.hypot(this.localMatrix[2], this.localMatrix[3]);
    mat2d.fromRotationTranslationScale(this.localMatrix, p, rad, [sx, sy]);
    this.flags |= SpatialDirtyFlags.LocalDirty;
    return this;
  }

  setTRS(
    position?: [number, number] | Vec2,
    rotationRad = 0,
    scale?: [number, number] | Vec2
  ): this {
    const p = (position ?? [0, 0]) as unknown as Vec2;
    const s = (scale ?? [1, 1]) as unknown as Vec2;
    mat2d.fromRotationTranslationScale(this.localMatrix, p, rotationRad, s);
    this.flags |= SpatialDirtyFlags.LocalDirty;
    return this;
  }

  setLocalMatrix(mat: Float32Array | number[]): this {
    this.localMatrix.set(mat);
    this.flags |= SpatialDirtyFlags.LocalDirty;
    return this;
  }

  setWorldMatrix(mat: Float32Array | number[]): this {
    this.worldMatrix.set(mat);
    this.flags |= SpatialDirtyFlags.WorldDirty;
    return this;
  }

  markLocalDirty(): void {
    this.flags |= SpatialDirtyFlags.LocalDirty;
  }

  markWorldDirty(): void {
    this.flags |= SpatialDirtyFlags.WorldDirty;
  }

  get isDirty(): boolean {
    return this.flags !== SpatialDirtyFlags.Clean;
  }

  set isDirty(val: boolean) {
    if (val) {
      this.flags |= SpatialDirtyFlags.WorldDirty;
    } else {
      this.flags = SpatialDirtyFlags.Clean;
    }
  }
}

export function createModel2D(
  modelId: number,
  initialLocal?: Float32Array | number[]
): Model2DComponent {
  return new Model2DComponent(modelId, initialLocal);
}

export interface Sprite2DComponent extends Component {
  readonly type: 'Sprite2D';
  readonly spriteId: number;
  desc: Sprite2DDesc;
  isDirty: boolean;
}

export function createSprite2D(spriteId: number, desc: Sprite2DDesc): Sprite2DComponent {
  return {
    type: 'Sprite2D',
    spriteId,
    desc,
    isDirty: true
  };
}

export interface Shape2DComponent extends Component {
  readonly type: 'Shape2D';
  readonly shapeId: number;
  desc: Shape2DDesc;
  isDirty: boolean;
}

export function createShape2D(shapeId: number, desc: Shape2DDesc): Shape2DComponent {
  return {
    type: 'Shape2D',
    shapeId,
    desc,
    isDirty: true
  };
}

export interface Light2DComponent extends Component {
  readonly type: 'Light2D';
  readonly lightId: number;
  desc: Light2DDesc;
  isDirty: boolean;
}

export function createLight2D(lightId: number, desc: Light2DDesc): Light2DComponent {
  return {
    type: 'Light2D',
    lightId,
    desc,
    isDirty: true
  };
}

export interface Camera2DComponent extends Component {
  readonly type: 'Camera2D';
  readonly cameraId: number;
  desc: Camera2DDesc;
  isDirty: boolean;
}

export function createCamera2D(cameraId: number, desc: Camera2DDesc): Camera2DComponent {
  return {
    type: 'Camera2D',
    cameraId,
    desc,
    isDirty: true
  };
}

export interface Svg2DComponent extends Component {
  readonly type: 'Svg2D';
  readonly svgId: number;
  desc: Svg2DDesc;
  isDirty: boolean;
}

export function createSvg2D(svgId: number, desc: Svg2DDesc): Svg2DComponent {
  return {
    type: 'Svg2D',
    svgId,
    desc,
    isDirty: true
  };
}

export interface ParticleEmitter2DComponent extends Component {
  readonly type: 'ParticleEmitter2D';
  readonly emitterId: number;
  desc: ParticleEmitter2DDesc;
  isDirty: boolean;
}

export function createParticleEmitter2D(
  emitterId: number,
  desc: ParticleEmitter2DDesc
): ParticleEmitter2DComponent {
  return {
    type: 'ParticleEmitter2D',
    emitterId,
    desc,
    isDirty: true
  };
}
