/**
 * Realm 3D component declarations.
 */
import type { Component } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
import type {
  Camera3DDesc,
  InstancedModel3DDesc,
  Light3DDesc,
  Material3DDesc,
  Model3DDesc,
  ParticleEmitter3DDesc,
  Portal3DDesc
} from '@galfus/transport-types';

export interface Model3DComponent extends Component {
  readonly type: 'Model3D';
  readonly modelId: number;
  desc: Model3DDesc;
  isDirty: boolean;
}

export function createModel3D(modelId: number, desc: Model3DDesc): Model3DComponent {
  return {
    type: 'Model3D',
    modelId,
    desc,
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

export interface Material3DComponent extends Component {
  readonly type: 'Material3D';
  readonly materialId: number;
  desc: Material3DDesc;
  isDirty: boolean;
}

export function createMaterial3D(materialId: number, desc: Material3DDesc): Material3DComponent {
  return {
    type: 'Material3D',
    materialId,
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

export interface Geometry3DComponent extends Component {
  readonly type: 'Geometry3D';
  readonly geometryId: number;
  primitive: Primitive3DKind;
  isDirty: boolean;
}

export function createGeometry3D(
  geometryId: number,
  primitive: Primitive3DKind
): Geometry3DComponent {
  return {
    type: 'Geometry3D',
    geometryId,
    primitive,
    isDirty: true
  };
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
