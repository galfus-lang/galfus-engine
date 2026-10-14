import type { DescSpec, FunctionSpec } from './types';

export const realm3dDescriptors: DescSpec[] = [
  {
    kind: 'object',
    name: 'Transform3DDesc',
    doc: '3D spatial transform containing position, rotation quaternion, and scale.',
    fields: {
      position: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      rotation: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      scale: { type: { tuple: ['number', 'number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Camera3DDesc',
    doc: '3D Camera configuration supporting perspective and orthographic projection with Reverse-Z.',
    fields: {
      kind: { type: { enum: ['perspective', 'orthographic'] }, optional: true },
      fovY: { type: 'number', optional: true },
      near: { type: 'number', optional: true },
      far: { type: 'number', optional: true },
      orthoScale: { type: 'number', optional: true },
      cameraSlot: { type: 'number', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Vertex3DDesc',
    doc: 'Vertex data for 3D meshes (position, normal, UV, tangent).',
    fields: {
      position: { type: { tuple: ['number', 'number', 'number'] } },
      normal: { type: { tuple: ['number', 'number', 'number'] } },
      uv: { type: { tuple: ['number', 'number'] } },
      tangent: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Geometry3DDesc',
    doc: '3D mesh definition with built-in primitives (cube, plane, sphere) or custom vertices and indices.',
    fields: {
      primitive: { type: { enum: ['cube', 'plane', 'sphere', 'custom'] }, optional: true },
      size: { type: 'number', optional: true },
      radius: { type: 'number', optional: true },
      subdivisions: { type: 'number', optional: true },
      vertices: { type: { array: { ref: 'Vertex3DDesc' } }, optional: true },
      indices: { type: { array: 'number' }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Material3DDesc',
    doc: 'PBR 3D material properties and surface configuration.',
    fields: {
      surfaceType: { type: { enum: ['opaque', 'transparent', 'masked'] }, optional: true },
      baseColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      emissiveColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      roughness: { type: 'number', optional: true },
      metallic: { type: 'number', optional: true },
      reflectance: { type: 'number', optional: true },
      albedoTextureId: { type: 'number', optional: true },
      normalTextureId: { type: 'number', optional: true },
      shaderEffect: { type: 'string', optional: true },
      customParams: {
        type: { array: { tuple: ['number', 'number', 'number', 'number'] } },
        optional: true
      }
    }
  },
  {
    kind: 'object',
    name: 'Model3DDesc',
    doc: '3D model instance binding a geometry and material.',
    fields: {
      geometryId: { type: 'number' },
      materialId: { type: 'number' },
      castShadow: { type: 'boolean', optional: true },
      receiveShadow: { type: 'boolean', optional: true },
      castOutline: { type: 'boolean', optional: true },
      outlineColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      active: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Light3DDesc',
    doc: '3D dynamic light source (directional, point, or spot).',
    fields: {
      kind: { type: { enum: ['directional', 'point', 'spot'] }, optional: true },
      color: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      intensity: { type: 'number', optional: true },
      range: { type: 'number', optional: true },
      spotInnerAngleRad: { type: 'number', optional: true },
      spotOuterAngleRad: { type: 'number', optional: true },
      castShadow: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'SkyboxConfig3DDesc',
    doc: 'Atmospheric procedural skybox gradient and sun parameters.',
    fields: {
      mode: { type: { enum: ['none', 'procedural', 'cubemap'] }, optional: true },
      skyColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      horizonColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      groundColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      sunDirection: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      sunColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      intensity: { type: 'number', optional: true },
      sunSize: { type: 'number', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'OutlineConfig3DDesc',
    doc: 'Screen-space silhouette outline dilation settings for Realm 3D.',
    fields: {
      enabled: { type: 'boolean', optional: true },
      width: { type: 'number', optional: true },
      threshold: { type: 'number', optional: true },
      strength: { type: 'number', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'EnvironmentRealm3DDesc',
    doc: 'Global atmospheric, fog, and ambient lighting parameters for Realm 3D.',
    fields: {
      ambientColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      clearColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      fogColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      fogMode: { type: { enum: ['none', 'linear', 'exponential'] }, optional: true },
      fogStart: { type: 'number', optional: true },
      fogEnd: { type: 'number', optional: true },
      fogDensity: { type: 'number', optional: true },
      exposure: { type: 'number', optional: true },
      skybox: { type: { ref: 'SkyboxConfig3DDesc' }, optional: true },
      outline: { type: { ref: 'OutlineConfig3DDesc' }, optional: true }
    }
  }
];

export const realm3dFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_realm_3d_create',
    methodName: 'realm3dCreate',
    doc: 'Creates and registers a new 3D Realm in the Multiverse.',
    params: [{ name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy',
    methodName: 'realm3dDestroy',
    doc: 'Destroys and unregisters a 3D Realm from the Multiverse.',
    params: [{ name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_camera',
    methodName: 'realm3dCreateCamera',
    doc: 'Registers or updates a 3D Camera with its spatial Transform in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      { name: 'camera', type: { json: 'Camera3DDesc' }, doc: 'Camera description' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'Camera transform' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_camera_transform',
    methodName: 'realm3dSetCameraTransform',
    doc: 'Updates the transform of an existing Camera in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'New camera transform' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_geometry',
    methodName: 'realm3dCreateGeometry',
    doc: 'Registers or updates a 3D Geometry mesh in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'geometryId', type: 'u32', doc: 'Logical ID of the Geometry.' },
      { name: 'geometry', type: { json: 'Geometry3DDesc' }, doc: 'Geometry description' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_material',
    methodName: 'realm3dCreateMaterial',
    doc: 'Registers or updates a 3D Material in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'materialId', type: 'u32', doc: 'Logical ID of the Material.' },
      { name: 'material', type: { json: 'Material3DDesc' }, doc: 'Material description' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_model',
    methodName: 'realm3dCreateModel',
    doc: 'Registers or updates a 3D Model instance in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the Model.' },
      { name: 'model', type: { json: 'Model3DDesc' }, doc: 'Model description' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'Model transform' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_model_transform',
    methodName: 'realm3dSetModelTransform',
    doc: 'Updates the transform of an existing Model instance in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the Model.' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'New model transform' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_light',
    methodName: 'realm3dCreateLight',
    doc: 'Registers or updates a 3D Light in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'lightId', type: 'u32', doc: 'Logical ID of the Light.' },
      { name: 'light', type: { json: 'Light3DDesc' }, doc: 'Light description' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'Light transform' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_light_transform',
    methodName: 'realm3dSetLightTransform',
    doc: 'Updates the transform of an existing Light in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'lightId', type: 'u32', doc: 'Logical ID of the Light.' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'New light transform' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_environment',
    methodName: 'realm3dSetEnvironment',
    doc: 'Sets global atmospheric environment properties for the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      {
        name: 'environment',
        type: { json: 'EnvironmentRealm3DDesc' },
        doc: 'Environment description'
      }
    ],
    returnType: 'i32'
  }
];
