import type { DescSpec, FunctionSpec } from './types';

export const interactionSurfaceDescriptors: DescSpec[] = [
  {
    kind: 'object',
    name: 'InteractionSurface',
    doc: 'Routes a collider to an offscreen target bound to a realm texture slot.',
    fields: {
      realmId: { type: 'number' },
      modelId: { type: 'number' },
      colliderId: { type: 'number' },
      slot: { type: 'string' },
      flipY: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'UiInteractionSurface',
    doc: 'Routes an individual SpritePanel to its bound texture target.',
    fields: {
      realmId: { type: 'number' },
      modelId: { type: 'number' },
      colliderId: { type: 'number' },
      elementId: { type: 'number' },
      slot: { type: 'string' }
    }
  }
];

export const interactionSurfaceFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_multiverse_connect_ui_interaction_surface',
    methodName: 'multiverseConnectUiInteractionSurface',
    doc: 'Connects a SpritePanel to its bound target.',
    params: [
      {
        name: 'surface',
        type: { json: 'UiInteractionSurface' },
        doc: 'UI interaction surface descriptor'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_disconnect_ui_interaction_surface',
    methodName: 'multiverseDisconnectUiInteractionSurface',
    doc: 'Disconnects a SpritePanel interaction surface.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Realm ID' },
      { name: 'modelId', type: 'u32', doc: 'UI model ID' },
      { name: 'elementId', type: 'u32', doc: 'UI element ID' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_connect_interaction_surface',
    methodName: 'multiverseConnectInteractionSurface',
    doc: 'Connects a collider to an already bound target texture.',
    params: [
      {
        name: 'surface',
        type: { json: 'InteractionSurface' },
        doc: 'Interaction surface descriptor'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_disconnect_interaction_surface',
    methodName: 'multiverseDisconnectInteractionSurface',
    doc: 'Disconnects a collider interaction surface.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Realm ID' },
      { name: 'colliderId', type: 'u32', doc: 'Collider ID' }
    ],
    returnType: 'i32'
  }
];
