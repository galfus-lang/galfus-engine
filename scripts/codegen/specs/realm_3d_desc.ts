import type { DescSpec } from './types';

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
    name: 'Geometry3DDesc',
    doc: 'Procedural 3D primitive configuration. Custom geometry uses binary vertex and index buffers.',
    fields: {
      primitive: {
        type: {
          enum: ['cube', 'plane', 'quad', 'sphere', 'cylinder', 'capsule', 'pyramid', 'torus']
        },
        optional: true
      },
      size: { type: 'number', optional: true },
      radius: { type: 'number', optional: true },
      subdivisions: { type: 'number', optional: true }
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
  },
  {
    kind: 'object',
    name: 'InstancedModel3DDesc',
    doc: 'Instanced 3D model configuration linking a geometry and material to an instanced GPU collection.',
    fields: {
      geometryId: { type: 'number' },
      materialId: { type: 'number' },
      capacity: { type: 'number', optional: true },
      castShadow: { type: 'boolean', optional: true },
      receiveShadow: { type: 'boolean', optional: true },
      active: { type: 'boolean', optional: true }
    }
  }
];
