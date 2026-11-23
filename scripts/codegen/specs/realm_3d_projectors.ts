import type { DescSpec, FunctionSpec } from './types';

export const realm3dProjectorDescriptors: DescSpec[] = [
  {
    kind: 'object',
    name: 'Projector3DDesc',
    doc: 'Forward PBR 3D decal or occluded texture projector.',
    fields: {
      kind: { type: { enum: ['orthographic', 'perspective'] }, optional: true },
      blendMode: { type: { enum: ['alpha', 'multiply', 'additive'] }, optional: true },
      textureId: { type: 'number', optional: true },
      color: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      uvRect: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      size: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      fovY: { type: 'number', optional: true },
      aspect: { type: 'number', optional: true },
      near: { type: 'number', optional: true },
      far: { type: 'number', optional: true },
      angleFade: { type: 'number', optional: true },
      roughnessOverride: { type: 'number', optional: true },
      metallicOverride: { type: 'number', optional: true },
      layerMask: { type: 'number', optional: true },
      occlusionMask: { type: 'number', optional: true },
      castOcclusion: { type: 'boolean', optional: true },
      active: { type: 'boolean', optional: true }
    }
  }
];

export const realm3dProjectorFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_realm_3d_create_projector',
    methodName: 'realm3dCreateProjector',
    doc: 'Registers or updates a 3D decal or texture projector.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'projectorId', type: 'u32', doc: 'Logical ID of the Projector.' },
      { name: 'projector', type: { json: 'Projector3DDesc' }, doc: 'Projector configuration.' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_projector_transform',
    methodName: 'realm3dSetProjectorTransform',
    doc: 'Fast-path spatial transform update for an existing 3D projector.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'projectorId', type: 'u32', doc: 'Logical ID of the Projector.' },
      { name: 'transform', type: { nativeStruct: 'Transform3D' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_projector',
    methodName: 'realm3dDestroyProjector',
    doc: 'Destroys an existing 3D projector or decal.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'projectorId', type: 'u32', doc: 'Logical ID of the Projector.' }
    ],
    returnType: 'i32'
  }
];
