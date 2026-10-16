import type { DescSpec, FunctionSpec } from './types';

export const realm2dDescriptors: DescSpec[] = [
  {
    kind: 'object',
    name: 'Transform2DDesc',
    doc: '2D spatial transform containing position, rotation angle (radians), scale, and z-layer order.',
    fields: {
      position: { type: { tuple: ['number', 'number'] } },
      rotation: { type: 'number', optional: true },
      scale: { type: { tuple: ['number', 'number'] }, optional: true },
      zLayer: { type: 'number', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Camera2DDesc',
    doc: '2D orthographic camera with Reverse-Z depth mapping.',
    fields: {
      orthoScale: { type: 'number' },
      near: { type: 'number', optional: true },
      far: { type: 'number', optional: true },
      layerMask: { type: 'number', optional: true },
      order: { type: 'number', optional: true },
      cameraSlot: { type: 'number', optional: true },
      active: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Material2DDesc',
    doc: '2D material properties with surface classification, texture ID, and optional WGSL surface effect.',
    fields: {
      baseColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      surfaceType: { type: { enum: ['opaque', 'transparent', 'masked'] }, optional: true },
      textureId: { type: 'number', optional: true },
      alphaCutoff: { type: 'number', optional: true },
      shaderEffect: { type: 'string', optional: true },
      customParams: {
        type: { array: { tuple: ['number', 'number', 'number', 'number'] } },
        optional: true
      }
    }
  },
  {
    kind: 'object',
    name: 'Sprite2DDesc',
    doc: '2D instanced sprite quad with texture mapping, UV rects, and shadow occlusion.',
    fields: {
      dimensions: { type: { tuple: ['number', 'number'] } },
      pivot: { type: { tuple: ['number', 'number'] }, optional: true },
      uvRect: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      materialId: { type: 'number', optional: true },
      castShadow: { type: 'boolean', optional: true },
      receiveShadow: { type: 'boolean', optional: true },
      occluderOnly: { type: 'boolean', optional: true },
      shadowHeight: { type: 'number', optional: true },
      shadowLayerMask: { type: 'number', optional: true },
      heightRange: { type: { tuple: ['number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Shape2DDesc',
    doc: '2D vector shape (Rectangle, Circle, or N-gon Polygon) with procedural SDF shading and silhouette shadows.',
    fields: {
      kind: { type: { enum: ['rectangle', 'circle', 'polygon'] } },
      size: { type: { tuple: ['number', 'number'] }, optional: true },
      radius: { type: 'number', optional: true },
      segments: { type: 'number', optional: true },
      vertices: { type: { array: { tuple: ['number', 'number'] } }, optional: true },
      materialId: { type: 'number', optional: true },
      castShadow: { type: 'boolean', optional: true },
      receiveShadow: { type: 'boolean', optional: true },
      occluderOnly: { type: 'boolean', optional: true },
      shadowHeight: { type: 'number', optional: true },
      shadowLayerMask: { type: 'number', optional: true },
      heightRange: { type: { tuple: ['number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Light2DDesc',
    doc: '2D point light with radial attenuation, penumbra softening, and shadow casting.',
    fields: {
      position: { type: { tuple: ['number', 'number'] }, optional: true },
      z: { type: 'number', optional: true },
      color: { type: { tuple: ['number', 'number', 'number'] } },
      intensity: { type: 'number' },
      range: { type: 'number' },
      lightRadius: { type: 'number', optional: true },
      shadowLayerMask: { type: 'number', optional: true },
      castShadow: { type: 'boolean', optional: true },
      active: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Shadow2DConfigDesc',
    doc: 'Global 2D polar shadow map tuning parameters.',
    fields: {
      shadowContactOffset: { type: 'number', optional: true },
      ambient: { type: 'number', optional: true },
      lightRadius: { type: 'number', optional: true },
      angularResolution: { type: 'number', optional: true }
    }
  }
];

export const realm2dFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_realm_2d_create',
    methodName: 'realm2dCreate',
    doc: 'Creates and registers a new 2D Realm in the Multiverse.',
    params: [{ name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy',
    methodName: 'realm2dDestroy',
    doc: 'Destroys and unregisters a 2D Realm from the Multiverse.',
    params: [{ name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_create_camera',
    methodName: 'realm2dCreateCamera',
    doc: 'Creates or updates a 2D camera with an initial transform.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      { name: 'camera', type: { json: 'Camera2DDesc' }, doc: 'Camera configuration.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'Initial camera transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_camera_transform',
    methodName: 'realm2dSetCameraTransform',
    doc: 'Updates the spatial transform of an existing 2D camera.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_create_material',
    methodName: 'realm2dCreateMaterial',
    doc: 'Creates or updates a 2D material definition.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'materialId', type: 'u32', doc: 'Logical ID of the Material.' },
      { name: 'material', type: { json: 'Material2DDesc' }, doc: 'Material properties.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_create_sprite',
    methodName: 'realm2dCreateSprite',
    doc: 'Creates or updates a 2D instanced sprite with an initial transform.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'spriteId', type: 'u32', doc: 'Logical ID of the Sprite.' },
      { name: 'sprite', type: { json: 'Sprite2DDesc' }, doc: 'Sprite definition.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_sprite_transform',
    methodName: 'realm2dSetSpriteTransform',
    doc: 'Updates the spatial transform of an existing 2D sprite.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'spriteId', type: 'u32', doc: 'Logical ID of the Sprite.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_create_shape',
    methodName: 'realm2dCreateShape',
    doc: 'Creates or updates a 2D vector shape (Rectangle, Circle, Polygon) with an initial transform.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'shapeId', type: 'u32', doc: 'Logical ID of the Shape.' },
      { name: 'shape', type: { json: 'Shape2DDesc' }, doc: 'Shape definition.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_shape_transform',
    methodName: 'realm2dSetShapeTransform',
    doc: 'Updates the spatial transform of an existing 2D shape.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'shapeId', type: 'u32', doc: 'Logical ID of the Shape.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_create_light',
    methodName: 'realm2dCreateLight',
    doc: 'Creates or updates a 2D point light with an initial transform.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'lightId', type: 'u32', doc: 'Logical ID of the Light.' },
      { name: 'light', type: { json: 'Light2DDesc' }, doc: 'Light properties.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_light_transform',
    methodName: 'realm2dSetLightTransform',
    doc: 'Updates the spatial transform of an existing 2D light.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'lightId', type: 'u32', doc: 'Logical ID of the Light.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_shadow_config',
    methodName: 'realm2dSetShadowConfig',
    doc: 'Updates global 2D polar shadow parameters.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'config', type: { json: 'Shadow2DConfigDesc' }, doc: 'Shadow configuration.' }
    ],
    returnType: 'i32'
  }
];
