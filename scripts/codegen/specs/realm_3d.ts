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
      tangent: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      joints: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      weights: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Geometry3DDesc',
    doc: '3D mesh definition with built-in primitives (cube, plane, sphere) or custom vertices and indices.',
    fields: {
      primitive: {
        type: {
          enum: [
            'cube',
            'plane',
            'quad',
            'sphere',
            'cylinder',
            'capsule',
            'pyramid',
            'torus',
            'custom'
          ]
        },
        optional: true
      },
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
      surfaceType: {
        type: {
          enum: ['opaque', 'transparent', 'masked', 'additive', 'refractive', 'mirror', 'portal']
        },
        optional: true
      },
      baseColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      emissiveColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      roughness: { type: 'number', optional: true },
      metallic: { type: 'number', optional: true },
      reflectance: { type: 'number', optional: true },
      refractionIndex: { type: 'number', optional: true },
      refractionDistortion: { type: 'number', optional: true },
      albedoTextureId: { type: 'number', optional: true },
      normalTextureId: { type: 'number', optional: true },
      metallicRoughnessTextureId: { type: 'number', optional: true },
      occlusionTextureId: { type: 'number', optional: true },
      emissiveTextureId: { type: 'number', optional: true },
      textureSlots: { type: { array: 'number' }, optional: true },
      samplerIndex: { type: 'number', optional: true },
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
      boneOffset: { type: 'number', optional: true },
      boneCount: { type: 'number', optional: true },
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
      sunSize: { type: 'number', optional: true },
      rotation: { type: 'number', optional: true },
      textureId: { type: 'number', optional: true }
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
    name: 'SsaoConfig3DDesc',
    doc: 'Screen-space ambient occlusion (SSAO) configuration parameters.',
    fields: {
      enabled: { type: 'boolean', optional: true },
      radius: { type: 'number', optional: true },
      bias: { type: 'number', optional: true },
      power: { type: 'number', optional: true },
      intensity: { type: 'number', optional: true },
      blurRadius: { type: 'number', optional: true }
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
      outline: { type: { ref: 'OutlineConfig3DDesc' }, optional: true },
      ssao: { type: { ref: 'SsaoConfig3DDesc' }, optional: true },
      bloom: { type: { ref: 'BloomConfig3DDesc' }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'BloomConfig3DDesc',
    doc: 'Screen-space multi-scale Bloom HDR glow parameters.',
    fields: {
      enabled: { type: 'boolean', optional: true },
      threshold: { type: 'number', optional: true },
      knee: { type: 'number', optional: true },
      intensity: { type: 'number', optional: true },
      scatter: { type: 'number', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'EmissionShape3DDesc',
    doc: '3D particle emission shape (point, sphere, box, cone, cylinder).',
    fields: {
      type: { type: { enum: ['point', 'sphere', 'box', 'cone', 'cylinder'] } },
      radius: { type: 'number', optional: true },
      extents: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      angleRad: { type: 'number', optional: true },
      height: { type: 'number', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Portal3DDesc',
    doc: 'Planar mirror or optical portal gateway configuration.',
    fields: {
      modelId: {
        type: 'number',
        doc: 'Entrance model ID defining portal surface and spatial transform.'
      },
      exitTransform: {
        type: { ref: 'Transform3DDesc' },
        optional: true,
        doc: 'Optional destination transform. If omitted, operates as a planar mirror.'
      },
      active: { type: 'boolean', optional: true, doc: 'Whether the mirror/portal is active.' },
      resolutionScale: {
        type: 'number',
        optional: true,
        doc: 'Offscreen buffer resolution scale factor (default 1.0).'
      }
    }
  },
  {
    kind: 'object',
    name: 'ParticleEmitter3DDesc',
    doc: '3D particle emitter configuration (rates, lifetime, speed, colors, sizes, gravity, drag).',
    fields: {
      label: { type: 'string', optional: true },
      materialId: { type: 'number', optional: true },
      maxParticles: { type: 'number', optional: true },
      spawnRate: { type: 'number', optional: true },
      lifetimeRange: { type: { tuple: ['number', 'number'] }, optional: true },
      speedRange: { type: { tuple: ['number', 'number'] }, optional: true },
      direction: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      spreadAngleRad: { type: 'number', optional: true },
      gravity: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      drag: { type: 'number', optional: true },
      startSizeRange: { type: { tuple: ['number', 'number'] }, optional: true },
      endSizeRange: { type: { tuple: ['number', 'number'] }, optional: true },
      startColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      endColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      rotationSpeedRange: { type: { tuple: ['number', 'number'] }, optional: true },
      uvRect: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      emissionShape: { type: { ref: 'EmissionShape3DDesc' }, optional: true },
      active: { type: 'boolean', optional: true }
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
  },
  {
    cName: 'galfus_realm_3d_update_bones',
    methodName: 'realm3dUpdateBones',
    doc: 'Uploads bone matrices (flattened array of 16-element 4x4 matrices) for a model in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the Model.' },
      {
        name: 'matrices',
        type: { jsonArray: 'number' },
        doc: 'Array of bone transform floats (multiples of 16)'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_draw_line',
    methodName: 'realm3dDrawLine',
    doc: 'Queues a 3D debug line segment between start and end with an RGBA color.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'x0', type: 'f32', doc: 'Start X coordinate.' },
      { name: 'y0', type: 'f32', doc: 'Start Y coordinate.' },
      { name: 'z0', type: 'f32', doc: 'Start Z coordinate.' },
      { name: 'x1', type: 'f32', doc: 'End X coordinate.' },
      { name: 'y1', type: 'f32', doc: 'End Y coordinate.' },
      { name: 'z1', type: 'f32', doc: 'End Z coordinate.' },
      { name: 'r', type: 'f32', doc: 'Red color channel [0.0..1.0].' },
      { name: 'g', type: 'f32', doc: 'Green color channel [0.0..1.0].' },
      { name: 'b', type: 'f32', doc: 'Blue color channel [0.0..1.0].' },
      { name: 'a', type: 'f32', doc: 'Alpha opacity channel [0.0..1.0].' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_draw_aabb',
    methodName: 'realm3dDrawAabb',
    doc: 'Queues a 3D debug Axis-Aligned Bounding Box (AABB) wireframe.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'minX', type: 'f32', doc: 'Min X boundary.' },
      { name: 'minY', type: 'f32', doc: 'Min Y boundary.' },
      { name: 'minZ', type: 'f32', doc: 'Min Z boundary.' },
      { name: 'maxX', type: 'f32', doc: 'Max X boundary.' },
      { name: 'maxY', type: 'f32', doc: 'Max Y boundary.' },
      { name: 'maxZ', type: 'f32', doc: 'Max Z boundary.' },
      { name: 'r', type: 'f32', doc: 'Red color channel.' },
      { name: 'g', type: 'f32', doc: 'Green color channel.' },
      { name: 'b', type: 'f32', doc: 'Blue color channel.' },
      { name: 'a', type: 'f32', doc: 'Alpha opacity channel.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_clear_gizmos',
    methodName: 'realm3dClearGizmos',
    doc: 'Clears any queued debug gizmos in the 3D Realm.',
    params: [{ name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_particle_emitter',
    methodName: 'realm3dCreateParticleEmitter',
    doc: 'Creates or updates a 3D particle emitter entity with an initial transform.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'emitterId', type: 'u32', doc: 'Logical ID of the Particle Emitter.' },
      { name: 'emitter', type: { json: 'ParticleEmitter3DDesc' }, doc: 'Emitter configuration.' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_particle_emitter_transform',
    methodName: 'realm3dSetParticleEmitterTransform',
    doc: 'Updates the spatial transform of an existing 3D particle emitter.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'emitterId', type: 'u32', doc: 'Logical ID of the Particle Emitter.' },
      { name: 'transform', type: { json: 'Transform3DDesc' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_particle_emitter_burst',
    methodName: 'realm3dParticleEmitterBurst',
    doc: 'Triggers an immediate burst of particles from an existing 3D emitter.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'emitterId', type: 'u32', doc: 'Logical ID of the Particle Emitter.' },
      { name: 'count', type: 'u32', doc: 'Number of particles to spawn in the burst.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_particle_emitter',
    methodName: 'realm3dDestroyParticleEmitter',
    doc: 'Destroys an existing 3D particle emitter entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'emitterId', type: 'u32', doc: 'Logical ID of the Particle Emitter.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_portal',
    methodName: 'realm3dCreatePortal',
    doc: 'Registers or updates a 3D optical portal or planar mirror.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'portalId', type: 'u32', doc: 'Logical ID of the Portal.' },
      { name: 'portal', type: { json: 'Portal3DDesc' }, doc: 'Portal configuration.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_portal_active',
    methodName: 'realm3dSetPortalActive',
    doc: 'Sets whether an existing 3D portal or mirror is active.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'portalId', type: 'u32', doc: 'Logical ID of the Portal.' },
      { name: 'active', type: 'bool', doc: 'Active state.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_portal',
    methodName: 'realm3dDestroyPortal',
    doc: 'Destroys an existing 3D portal or mirror.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'portalId', type: 'u32', doc: 'Logical ID of the Portal.' }
    ],
    returnType: 'i32'
  }
];
