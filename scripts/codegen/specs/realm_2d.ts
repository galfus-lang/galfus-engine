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
      surfaceType: {
        type: { enum: ['opaque', 'transparent', 'masked', 'additive'] },
        optional: true
      },
      textureId: { type: 'number', optional: true },
      normalTextureId: { type: 'number', optional: true },
      emissiveTextureId: { type: 'number', optional: true },
      textureSlots: { type: { array: 'number' }, optional: true },
      samplerIndex: { type: 'number', optional: true },
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
  },
  {
    kind: 'object',
    name: 'EmissionShape2DDesc',
    doc: '2D particle emission shape (point, circle, rectangle, line).',
    fields: {
      type: { type: { enum: ['point', 'circle', 'rectangle', 'line'] } },
      radius: { type: 'number', optional: true },
      extents: { type: { tuple: ['number', 'number'] }, optional: true },
      direction: { type: { tuple: ['number', 'number'] }, optional: true },
      length: { type: 'number', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'ParticleEmitter2DDesc',
    doc: '2D particle emitter configuration (rates, lifetime, speed, colors, sizes, gravity, drag).',
    fields: {
      materialId: { type: 'number', optional: true },
      maxParticles: { type: 'number', optional: true },
      spawnRate: { type: 'number', optional: true },
      lifetimeRange: { type: { tuple: ['number', 'number'] }, optional: true },
      speedRange: { type: { tuple: ['number', 'number'] }, optional: true },
      direction: { type: { tuple: ['number', 'number'] }, optional: true },
      spreadAngleRad: { type: 'number', optional: true },
      gravity: { type: { tuple: ['number', 'number'] }, optional: true },
      drag: { type: 'number', optional: true },
      startSizeRange: { type: { tuple: ['number', 'number'] }, optional: true },
      endSizeRange: { type: { tuple: ['number', 'number'] }, optional: true },
      startColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      endColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      rotationSpeedRange: { type: { tuple: ['number', 'number'] }, optional: true },
      uvRect: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      emissionShape: { type: { ref: 'EmissionShape2DDesc' }, optional: true },
      zLayer: { type: 'number', optional: true },
      castShadow: { type: 'boolean', optional: true },
      receiveShadow: { type: 'boolean', optional: true },
      active: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Svg2DDesc',
    doc: '2D SVG vector entity with mutable DOM and GPU rasterization synchronization.',
    fields: {
      label: { type: 'string', optional: true },
      source: { type: 'string' },
      dimensions: { type: { tuple: ['number', 'number'] }, optional: true },
      scaleFactor: { type: 'number', optional: true },
      materialId: { type: 'number', optional: true },
      castShadow: { type: 'boolean', optional: true },
      receiveShadow: { type: 'boolean', optional: true }
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
  },
  {
    cName: 'galfus_realm_2d_create_particle_emitter',
    methodName: 'realm2dCreateParticleEmitter',
    doc: 'Creates or updates a 2D particle emitter entity with an initial transform.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'emitterId', type: 'u32', doc: 'Logical ID of the Particle Emitter.' },
      { name: 'emitter', type: { json: 'ParticleEmitter2DDesc' }, doc: 'Emitter configuration.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_particle_emitter_transform',
    methodName: 'realm2dSetParticleEmitterTransform',
    doc: 'Updates the spatial transform of an existing 2D particle emitter.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'emitterId', type: 'u32', doc: 'Logical ID of the Particle Emitter.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_particle_emitter_burst',
    methodName: 'realm2dParticleEmitterBurst',
    doc: 'Triggers an immediate burst of particles from an existing 2D emitter.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'emitterId', type: 'u32', doc: 'Logical ID of the Particle Emitter.' },
      { name: 'count', type: 'u32', doc: 'Number of particles to spawn in the burst.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_particle_emitter',
    methodName: 'realm2dDestroyParticleEmitter',
    doc: 'Destroys an existing 2D particle emitter entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'emitterId', type: 'u32', doc: 'Logical ID of the Particle Emitter.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_camera',
    methodName: 'realm2dDestroyCamera',
    doc: 'Destroys an existing 2D camera entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_material',
    methodName: 'realm2dDestroyMaterial',
    doc: 'Destroys an existing 2D material entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'materialId', type: 'u32', doc: 'Logical ID of the Material.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_sprite',
    methodName: 'realm2dDestroySprite',
    doc: 'Destroys an existing 2D sprite entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'spriteId', type: 'u32', doc: 'Logical ID of the Sprite.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_shape',
    methodName: 'realm2dDestroyShape',
    doc: 'Destroys an existing 2D shape entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'shapeId', type: 'u32', doc: 'Logical ID of the Shape.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_light',
    methodName: 'realm2dDestroyLight',
    doc: 'Destroys an existing 2D light entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'lightId', type: 'u32', doc: 'Logical ID of the Light.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_sprite_transform_raw',
    methodName: 'realm2dSetSpriteTransformRaw',
    doc: 'Updates 2D sprite transform directly from a 6-float buffer [px, py, rot, sx, sy, z_layer].',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'spriteId', type: 'u32', doc: 'Logical ID of the Sprite.' },
      { name: 'ptr', type: 'ptr', doc: 'Pointer to 6-element float array' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_camera_transform_raw',
    methodName: 'realm2dSetCameraTransformRaw',
    doc: 'Updates 2D camera transform directly from a 6-float buffer [px, py, rot, sx, sy, z_layer].',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      { name: 'ptr', type: 'ptr', doc: 'Pointer to 6-element float array' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_get_sprite_transform',
    methodName: 'realm2dGetSpriteTransformRaw',
    doc: 'Reads the transform of an existing Sprite instance into an out 6-float buffer.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'spriteId', type: 'u32', doc: 'Logical ID of the Sprite.' },
      { name: 'outPtr', type: 'ptr', doc: 'Pointer to out 6-element float array' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_get_camera_transform',
    methodName: 'realm2dGetCameraTransformRaw',
    doc: 'Reads the transform of an existing Camera instance into an out 6-float buffer.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'cameraId', type: 'u32', doc: 'Logical ID of the Camera.' },
      { name: 'outPtr', type: 'ptr', doc: 'Pointer to out 6-element float array' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_create_svg',
    methodName: 'realm2dCreateSvg',
    doc: 'Creates or updates a 2D SVG vector entity with an initial transform.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' },
      { name: 'svg', type: { json: 'Svg2DDesc' }, doc: 'SVG entity descriptor.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_svg_source',
    methodName: 'realm2dSetSvgSource',
    doc: 'Replaces the complete source XML markup string of an existing SVG entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' },
      { name: 'source', type: 'string', doc: 'New SVG XML markup string.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_svg_attribute',
    methodName: 'realm2dSetSvgAttribute',
    doc: 'Sets or overwrites an XML attribute on the matching element ID in the SVG.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' },
      { name: 'elementId', type: 'string', doc: 'Target element ID in the SVG DOM.' },
      { name: 'name', type: 'string', doc: 'Attribute name (e.g. href, fill, width).' },
      { name: 'value', type: 'string', doc: 'Attribute value.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_remove_svg_attribute',
    methodName: 'realm2dRemoveSvgAttribute',
    doc: 'Removes an XML attribute from the matching element ID in the SVG.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' },
      { name: 'elementId', type: 'string', doc: 'Target element ID in the SVG DOM.' },
      { name: 'name', type: 'string', doc: 'Attribute name to remove.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_svg_text',
    methodName: 'realm2dSetSvgText',
    doc: 'Updates the inner text content of the matching element ID in the SVG.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' },
      { name: 'elementId', type: 'string', doc: 'Target element ID in the SVG DOM.' },
      { name: 'text', type: 'string', doc: 'New inner text content.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_svg_transform',
    methodName: 'realm2dSetSvgTransform',
    doc: 'Updates the spatial transform of an existing SVG entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_svg_transform_raw',
    methodName: 'realm2dSetSvgTransformRaw',
    doc: 'Updates 2D SVG transform directly from a 6-float buffer [px, py, rot, sx, sy, z_layer].',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' },
      { name: 'ptr', type: 'ptr', doc: 'Pointer to 6-element float array' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_get_svg_transform',
    methodName: 'realm2dGetSvgTransformRaw',
    doc: 'Reads the transform of an existing SVG entity into an out 6-float buffer.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' },
      { name: 'outPtr', type: 'ptr', doc: 'Pointer to write 6 consecutive f32 values.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_svg',
    methodName: 'realm2dDestroySvg',
    doc: 'Destroys an existing 2D SVG entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'svgId', type: 'u32', doc: 'Logical ID of the SVG entity.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_load_font_data',
    methodName: 'realm2dLoadFontData',
    doc: 'Registers raw TTF/OTF font binary data from memory (zero filesystem access) via base64. Returns the detected font family name.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'dataBase64', type: 'string', doc: 'Base64 encoded TTF/OTF font binary bytes.' }
    ],
    returnType: 'string'
  }
];
