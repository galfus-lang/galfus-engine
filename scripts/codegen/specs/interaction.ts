import type { DescSpec, FunctionSpec } from './types';

export const interactionDescriptors: DescSpec[] = [
  {
    kind: 'union',
    name: 'ColliderShape2D',
    doc: 'Geometric shape definition for a 2D collider.',
    variants: [
      {
        inline: {
          type: { type: { literal: 'rectangle' } },
          halfExtents: { type: { tuple: ['number', 'number'] } },
          offset: { type: { tuple: ['number', 'number'] }, optional: true }
        }
      },
      {
        inline: {
          type: { type: { literal: 'circle' } },
          radius: { type: 'number' },
          offset: { type: { tuple: ['number', 'number'] }, optional: true }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'Collider2DDesc',
    doc: 'Descriptor for registering a 2D collider on a model.',
    fields: {
      shape: { type: { ref: 'ColliderShape2D' } },
      offset: { type: { tuple: ['number', 'number'] }, optional: true },
      layer: { type: 'number', optional: true },
      mask: { type: 'number', optional: true }
    }
  },
  {
    kind: 'union',
    name: 'ColliderShape3D',
    doc: 'Geometric shape definition for a 3D collider.',
    variants: [
      {
        inline: {
          type: { type: { literal: 'box' } },
          halfExtents: { type: { tuple: ['number', 'number', 'number'] } },
          offset: { type: { tuple: ['number', 'number', 'number'] }, optional: true }
        }
      },
      {
        inline: {
          type: { type: { literal: 'sphere' } },
          radius: { type: 'number' },
          offset: { type: { tuple: ['number', 'number', 'number'] }, optional: true }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'Collider3DDesc',
    doc: 'Descriptor for registering a 3D collider on a model.',
    fields: {
      shape: { type: { ref: 'ColliderShape3D' } },
      offset: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      layer: { type: 'number', optional: true },
      mask: { type: 'number', optional: true }
    }
  },
  {
    kind: 'enum',
    name: 'InteractionType',
    doc: 'Category of model interaction event emitted by the Core picking engine.',
    values: [
      'hover',
      'leave',
      'down',
      'up',
      'click',
      'move',
      'pressMove',
      'pressUp',
      'cancel',
      'scroll'
    ]
  },
  {
    kind: 'object',
    name: 'InteractionEvent',
    doc: 'High-level interaction event emitted toward a logical model by Core picking.',
    fields: {
      interactionType: { type: { ref: 'InteractionType' } },
      windowId: { type: 'number' },
      pointerId: { type: 'number' },
      realmId: { type: 'number' },
      modelId: { type: 'number' },
      colliderId: { type: 'number' },
      elementId: { type: 'number', optional: true },
      button: { type: 'number', optional: true },
      localPos: { type: { tuple: ['number', 'number'] } },
      uv: { type: { tuple: ['number', 'number'] } },
      delta: { type: { tuple: ['number', 'number'] } },
      scrollDelta: { type: { tuple: ['number', 'number'] }, optional: true }
    }
  }
];

export const interactionFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_realm_2d_create_collider',
    methodName: 'realm2dCreateCollider',
    doc: 'Registers or updates a 2D collider attached to a model.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm' },
      { name: 'colliderId', type: 'u32', doc: 'Logical ID of the collider' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the target model' },
      {
        name: 'shape',
        type: { json: 'Collider2DDesc' },
        doc: 'Collider geometry and filtering options'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_collider',
    methodName: 'realm2dDestroyCollider',
    doc: 'Destroys an existing 2D collider.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm' },
      { name: 'colliderId', type: 'u32', doc: 'Logical ID of the collider to destroy' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_collider',
    methodName: 'realm3dCreateCollider',
    doc: 'Registers or updates a 3D collider attached to a model.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm' },
      { name: 'colliderId', type: 'u32', doc: 'Logical ID of the collider' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the target model' },
      {
        name: 'shape',
        type: { json: 'Collider3DDesc' },
        doc: 'Collider geometry and filtering options'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_collider',
    methodName: 'realm3dDestroyCollider',
    doc: 'Destroys an existing 3D collider.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm' },
      { name: 'colliderId', type: 'u32', doc: 'Logical ID of the collider to destroy' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_handle_pointer_event',
    methodName: 'multiverseHandlePointerEvent',
    doc: 'Submits a platform pointer event into the Multiverse interaction and picking engine.',
    params: [
      {
        name: 'event',
        type: 'string',
        doc: 'Serialized JSON string of the pointer event'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_poll_interaction_events',
    methodName: 'multiversePollInteractionEvents',
    doc: 'Drains all pending interaction events emitted toward logical models.',
    params: [],
    returnType: 'string'
  }
];
