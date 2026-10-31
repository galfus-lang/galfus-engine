/**
 * Realm 3D component declarations.
 * Incorporates spatial Model3D with contiguous local/world matrices and SpatialDirtyFlags.
 */
import type { Component } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
import { mat4, quat, vec3, type Mat4, type Quat, type Vec3 } from '../math/index';
import { SpatialDirtyFlags } from '../spatial/flags';
import type {
  Camera3DDesc,
  InstancedModel3DDesc,
  Light3DDesc,
  Material3DDesc,
  Model3DDesc,
  ParticleEmitter3DDesc,
  Portal3DDesc
} from '@galfus/transport-types';

const SCRATCH_P = vec3.create();
const SCRATCH_S = vec3.create();
const SCRATCH_Q = quat.create();

/**
 * 3D Spatial node component holding dual 4x4 matrices (local and resolved world)
 * and a two-stage dirty flag state machine (LocalDirty -> WorldDirty -> Clean).
 */
export class Model3DComponent implements Component {
  readonly type = 'Model3D' as const;
  readonly modelId: number;
  readonly localMatrix: Mat4;
  readonly worldMatrix: Mat4;
  flags: SpatialDirtyFlags;

  constructor(modelId: number, initialLocal?: Float32Array | number[]) {
    this.modelId = modelId;
    this.localMatrix = mat4.create();
    this.worldMatrix = mat4.create();
    if (initialLocal) {
      this.localMatrix.set(initialLocal);
      this.worldMatrix.set(initialLocal);
    }
    this.flags = SpatialDirtyFlags.LocalDirty | SpatialDirtyFlags.WorldDirty;
  }

  setPosition(x: number, y: number, z: number): this;
  setPosition(position: [number, number, number] | Vec3): this;
  setPosition(xOrPos: number | [number, number, number] | Vec3, y?: number, z?: number): this {
    if (typeof xOrPos === 'number') {
      this.localMatrix[12] = xOrPos;
      this.localMatrix[13] = y ?? 0;
      this.localMatrix[14] = z ?? 0;
    } else {
      this.localMatrix[12] = xOrPos[0];
      this.localMatrix[13] = xOrPos[1];
      this.localMatrix[14] = xOrPos[2];
    }
    this.flags |= SpatialDirtyFlags.LocalDirty;
    return this;
  }

  setRotation(x: number, y: number, z: number, w: number): this;
  setRotation(rotation: [number, number, number, number] | Quat): this;
  setRotation(
    xOrRot: number | [number, number, number, number] | Quat,
    y?: number,
    z?: number,
    w?: number
  ): this {
    mat4.getTranslation(SCRATCH_P, this.localMatrix);
    mat4.getScaling(SCRATCH_S, this.localMatrix);
    let q: Quat;
    if (typeof xOrRot === 'number') {
      quat.set(SCRATCH_Q, xOrRot, y ?? 0, z ?? 0, w ?? 1);
      q = SCRATCH_Q;
    } else {
      q = xOrRot as Quat;
    }
    mat4.fromRotationTranslationScale(this.localMatrix, q, SCRATCH_P, SCRATCH_S);
    this.flags |= SpatialDirtyFlags.LocalDirty;
    return this;
  }

  setScale(x: number, y: number, z: number): this;
  setScale(scale: [number, number, number] | Vec3): this;
  setScale(xOrScale: number | [number, number, number] | Vec3, y?: number, z?: number): this {
    if (typeof xOrScale === 'number') {
      this.localMatrix[0] = xOrScale;
      this.localMatrix[5] = y ?? 1;
      this.localMatrix[10] = z ?? 1;
    } else {
      this.localMatrix[0] = xOrScale[0];
      this.localMatrix[5] = xOrScale[1];
      this.localMatrix[10] = xOrScale[2];
    }
    this.flags |= SpatialDirtyFlags.LocalDirty;
    return this;
  }

  setTRS(
    position?: [number, number, number] | Vec3,
    rotation?: [number, number, number, number] | Quat,
    scale?: [number, number, number] | Vec3
  ): this {
    const p = (position ?? [0, 0, 0]) as unknown as Vec3;
    const r = (rotation ?? [0, 0, 0, 1]) as unknown as Quat;
    const s = (scale ?? [1, 1, 1]) as unknown as Vec3;
    mat4.fromRotationTranslationScale(this.localMatrix, r, p, s);
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

export function createModel3D(
  modelId: number,
  initialLocal?: Float32Array | number[]
): Model3DComponent {
  return new Model3DComponent(modelId, initialLocal);
}

/**
 * 3D Mesh rendering component linked to an existing spatial Model3D on the same entity.
 */
export interface Mesh3DDesc {
  geometryId: number;
  materialId: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  castOutline?: boolean;
  outlineColor?: [number, number, number, number];
  active?: boolean;
  boneOffset?: number;
  boneCount?: number;
}

export interface Mesh3DComponent extends Component {
  readonly type: 'Mesh3D';
  readonly meshId: number;
  readonly modelId: number;
  geometryId: number;
  materialId: number;
  castShadow: boolean;
  receiveShadow: boolean;
  castOutline: boolean;
  outlineColor: [number, number, number, number];
  active: boolean;
  boneOffset: number;
  boneCount: number;
  isDirty: boolean;
}

export function createMesh3D(meshId: number, modelId: number, desc: Mesh3DDesc): Mesh3DComponent {
  return {
    type: 'Mesh3D',
    meshId,
    modelId,
    geometryId: desc.geometryId,
    materialId: desc.materialId,
    castShadow: desc.castShadow ?? true,
    receiveShadow: desc.receiveShadow ?? true,
    castOutline: desc.castOutline ?? false,
    outlineColor: desc.outlineColor ?? [1, 1, 1, 1],
    active: desc.active ?? true,
    boneOffset: desc.boneOffset ?? 0,
    boneCount: desc.boneCount ?? 0,
    isDirty: true
  };
}

export interface Camera3DComponent extends Component {
  readonly type: 'Camera3D';
  readonly cameraId: number;
  desc: Camera3DDesc;
  isDirty: boolean;
}

export function createCamera3D(cameraId: number, desc: Camera3DDesc): Camera3DComponent {
  return {
    type: 'Camera3D',
    cameraId,
    desc,
    isDirty: true
  };
}

export interface Light3DComponent extends Component {
  readonly type: 'Light3D';
  readonly lightId: number;
  desc: Light3DDesc;
  isDirty: boolean;
}

export function createLight3D(lightId: number, desc: Light3DDesc): Light3DComponent {
  return {
    type: 'Light3D',
    lightId,
    desc,
    isDirty: true
  };
}

export type Primitive3DKind =
  | { kind: 'cube'; size: number }
  | { kind: 'plane'; width: number; depth: number }
  | { kind: 'quad'; width: number; height: number }
  | { kind: 'sphere'; radius: number; rings: number; sectors: number }
  | { kind: 'cylinder'; radius: number; height: number; sectors: number }
  | { kind: 'capsule'; radius: number; cylinderHeight: number; rings: number; sectors: number }
  | { kind: 'pyramid'; width: number; depth: number; height: number }
  | {
      kind: 'torus';
      majorRadius: number;
      minorRadius: number;
      majorSegments: number;
      minorSegments: number;
    }
  | { kind: 'custom'; topology: number; vertexData: Uint8Array; indices: Uint32Array };

export interface GeometryResourceEntry {
  geometryId: number;
  primitive: Primitive3DKind;
  isDirty: boolean;
}

export interface MaterialResourceEntry {
  materialId: number;
  desc: Material3DDesc;
  isDirty: boolean;
}

export interface ParticleEmitter3DComponent extends Component {
  readonly type: 'ParticleEmitter3D';
  readonly emitterId: number;
  desc: ParticleEmitter3DDesc;
  isDirty: boolean;
}

export function createParticleEmitter3D(
  emitterId: number,
  desc: ParticleEmitter3DDesc
): ParticleEmitter3DComponent {
  return {
    type: 'ParticleEmitter3D',
    emitterId,
    desc,
    isDirty: true
  };
}

export interface Portal3DComponent extends Component {
  readonly type: 'Portal3D';
  readonly portalId: number;
  desc: Portal3DDesc;
  isDirty: boolean;
}

export function createPortal3D(portalId: number, desc: Portal3DDesc): Portal3DComponent {
  return {
    type: 'Portal3D',
    portalId,
    desc,
    isDirty: true
  };
}

export interface InstancedModel3DComponent extends Component {
  readonly type: 'InstancedModel3D';
  readonly instancedModelId: number;
  desc: InstancedModel3DDesc;
  isDirty: boolean;
}

export function createInstancedModel3D(
  instancedModelId: number,
  desc: InstancedModel3DDesc
): InstancedModel3DComponent {
  return {
    type: 'InstancedModel3D',
    instancedModelId,
    desc,
    isDirty: true
  };
}

export interface Skin3DComponent extends Component {
  readonly type: 'Skin3D';
  readonly skinId: number;
  readonly modelEntityId: EntityId;
  readonly joints: EntityId[];
  readonly inverseBindMatrices: Float32Array;
  readonly jointMatrices: Float32Array;
  isDirty?: boolean;
}

export function createSkin3D(
  skinId: number,
  modelEntityId: EntityId,
  joints: EntityId[],
  inverseBindMatrices: Float32Array
): Skin3DComponent {
  return {
    type: 'Skin3D',
    skinId,
    modelEntityId,
    joints,
    inverseBindMatrices,
    jointMatrices: new Float32Array(joints.length * 16),
    isDirty: true
  };
}
