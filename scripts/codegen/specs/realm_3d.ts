import type { FunctionSpec } from './types';
export { realm3dDescriptors } from './realm_3d_desc';

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
      { name: 'transform', type: { nativeStruct: 'Transform3D' }, doc: 'New camera transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_camera_look_at',
    methodName: 'realm3dSetCameraLookAt',
    doc: 'Sets the optional world-space look-at point and up direction of an existing 3D Camera.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      { name: 'lookAt', type: { nativeStruct: 'CameraLookAt3D' }, doc: 'Look-at configuration.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_get_camera_look_at',
    methodName: 'realm3dGetCameraLookAt',
    doc: 'Gets the current optional look-at configuration of an existing 3D Camera.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      {
        name: 'outLookAt',
        type: { nativeStruct: 'CameraLookAt3D' },
        doc: 'Output look-at state.',
        out: true
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_clear_camera_look_at',
    methodName: 'realm3dClearCameraLookAt',
    doc: 'Clears the optional look-at configuration of an existing 3D Camera.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_geometry',
    methodName: 'realm3dCreateGeometry',
    doc: 'Registers or updates a procedural 3D Geometry mesh in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'geometryId', type: 'u32', doc: 'Logical ID of the Geometry.' },
      { name: 'geometry', type: { json: 'Geometry3DDesc' }, doc: 'Geometry description' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_geometry_raw',
    methodName: 'realm3dCreateGeometryRaw',
    doc: 'Registers custom geometry from 136-byte canonical interleaved Vertex3D records and u32 indices.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'geometryId', type: 'u32', doc: 'Logical ID of the Geometry.' },
      { name: 'vertexData', type: { buffer: 'u8' }, doc: 'Interleaved Vertex3D bytes.' },
      { name: 'vertexDataLen', type: 'u64', doc: 'Length of vertexData in bytes.' },
      { name: 'indices', type: { buffer: 'u32' }, doc: 'Triangle indices.' },
      { name: 'indexCount', type: 'u64', doc: 'Number of u32 indices.' }
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
      { name: 'transform', type: { nativeStruct: 'Transform3D' }, doc: 'New model transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_create_instanced_model',
    methodName: 'realm3dCreateInstancedModel',
    doc: 'Registers or updates an Instanced 3D Model in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'instancedModelId', type: 'u32', doc: 'Logical ID of the Instanced Model.' },
      {
        name: 'model',
        type: { json: 'InstancedModel3DDesc' },
        doc: 'Instanced model configuration.'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_instanced_model_data',
    methodName: 'realm3dSetInstancedModelData',
    doc: 'Uploads packed instance data: 32 f32 values per instance.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'instancedModelId', type: 'u32', doc: 'Logical ID of the Instanced Model.' },
      {
        name: 'data',
        type: { buffer: 'f32' },
        doc: 'Packed instance floats.'
      },
      {
        name: 'floatCount',
        type: 'u64',
        doc: 'Number of f32 values; must be a multiple of 32.'
      }
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
      { name: 'transform', type: { nativeStruct: 'Transform3D' }, doc: 'New light transform.' }
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
    doc: 'Uploads packed 4x4 bone matrices for a model in the 3D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the Model.' },
      {
        name: 'data',
        type: { buffer: 'f32' },
        doc: 'Bone matrix floats.'
      },
      {
        name: 'floatCount',
        type: 'u64',
        doc: 'Number of f32 values; must be a multiple of 16.'
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
      { name: 'transform', type: { nativeStruct: 'Transform3D' }, doc: 'New transform.' }
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
  },
  {
    cName: 'galfus_realm_3d_destroy_camera',
    methodName: 'realm3dDestroyCamera',
    doc: 'Destroys an existing 3D camera entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_material',
    methodName: 'realm3dDestroyMaterial',
    doc: 'Destroys an existing 3D material entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'materialId', type: 'u32', doc: 'Logical ID of the Material.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_geometry',
    methodName: 'realm3dDestroyGeometry',
    doc: 'Destroys an existing 3D geometry entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'geometryId', type: 'u32', doc: 'Logical ID of the Geometry.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_model',
    methodName: 'realm3dDestroyModel',
    doc: 'Destroys an existing 3D model entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the Model.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_instanced_model',
    methodName: 'realm3dDestroyInstancedModel',
    doc: 'Destroys an existing 3D instanced model entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'instancedModelId', type: 'u32', doc: 'Logical ID of the Instanced Model.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_destroy_light',
    methodName: 'realm3dDestroyLight',
    doc: 'Destroys an existing 3D light entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'lightId', type: 'u32', doc: 'Logical ID of the Light.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_get_model_transform',
    methodName: 'realm3dGetModelTransform',
    doc: 'Reads the transform of an existing Model instance.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the Model.' },
      {
        name: 'outTransform',
        type: { nativeStruct: 'Transform3D' },
        doc: 'Output transform.',
        out: true
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_get_camera_transform',
    methodName: 'realm3dGetCameraTransform',
    doc: 'Reads the transform of an existing Camera instance.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      {
        name: 'outTransform',
        type: { nativeStruct: 'Transform3D' },
        doc: 'Output transform.',
        out: true
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_get_model_aabb',
    methodName: 'realm3dGetModelAabbRaw',
    doc: 'Reads the world-space bounding box (min, max) of a 3D model into two 3-float out buffers.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'modelId', type: 'u32', doc: 'Logical ID of the Model.' },
      { name: 'outMin', type: 'ptr', doc: 'Pointer to out 3-element float array for min bounds' },
      { name: 'outMax', type: 'ptr', doc: 'Pointer to out 3-element float array for max bounds' }
    ],
    returnType: 'i32'
  }
];
