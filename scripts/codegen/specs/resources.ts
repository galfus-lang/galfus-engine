import type { DescSpec, FunctionSpec } from './types';

export const resourceDescriptors: DescSpec[] = [
  {
    kind: 'enum',
    name: 'NormalizedTextureFormat',
    doc: 'Normalized pixel format for GPU textures.',
    values: [
      'r8Unorm',
      'rg8Unorm',
      'rgba8Unorm',
      'rgba8UnormSrgb',
      'bgra8Unorm',
      'bgra8UnormSrgb',
      'r16Float',
      'rg16Float',
      'rgba16Float',
      'r32Float',
      'rg32Float',
      'rgba32Float',
      'depth32Float',
      'depth24Plus',
      'depth24PlusStencil8'
    ]
  },
  {
    kind: 'enum',
    name: 'TextureDimension',
    doc: 'Dimensionality of a GPU texture.',
    values: ['d1', 'd2', 'd3']
  },
  {
    kind: 'object',
    name: 'TextureUsageFlags',
    doc: 'GPU texture usage flags.',
    fields: {
      copySrc: { type: 'boolean', optional: true },
      copyDst: { type: 'boolean', optional: true },
      textureBinding: { type: 'boolean', optional: true },
      storageBinding: { type: 'boolean', optional: true },
      renderAttachment: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'GpuTextureDesc',
    doc: 'Descriptor for creating or allocating a GPU texture.',
    fields: {
      label: { type: 'string', optional: true },
      width: { type: 'number' },
      height: { type: 'number' },
      depthOrLayers: { type: 'number', optional: true },
      mipLevels: { type: 'number', optional: true },
      sampleCount: { type: 'number', optional: true },
      dimension: { type: { ref: 'TextureDimension' }, optional: true },
      format: { type: { ref: 'NormalizedTextureFormat' } },
      usages: { type: { ref: 'TextureUsageFlags' }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'TextureUpdateDesc',
    doc: 'Sub-rectangle destination coordinates for updating a texture region.',
    fields: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' }
    }
  },
  {
    kind: 'object',
    name: 'BufferUsageFlags',
    doc: 'GPU buffer usage flags.',
    fields: {
      vertex: { type: 'boolean', optional: true },
      index: { type: 'boolean', optional: true },
      uniform: { type: 'boolean', optional: true },
      storage: { type: 'boolean', optional: true },
      copySrc: { type: 'boolean', optional: true },
      copyDst: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'BufferDesc',
    doc: 'Descriptor for creating a shared GPU buffer.',
    fields: {
      label: { type: 'string', optional: true },
      usages: { type: { ref: 'BufferUsageFlags' } }
    }
  }
];

export const resourceFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_resource_create_texture',
    methodName: 'resourceCreateTexture',
    doc: 'Allocates and initializes a shared GPU texture under a host logical ID with raw pixel bytes.',
    params: [
      {
        name: 'textureId',
        type: 'u32',
        doc: 'Host logical ID of the texture'
      },
      {
        name: 'desc',
        type: { json: 'GpuTextureDesc' },
        doc: 'Texture creation descriptor'
      },
      {
        name: 'data',
        type: 'ptr',
        doc: 'Pointer to raw pixel data bytes'
      },
      {
        name: 'dataLen',
        type: 'u64',
        doc: 'Length of raw pixel data in bytes'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_resource_update_texture',
    methodName: 'resourceUpdateTexture',
    doc: 'Updates a sub-rectangle of an existing logical texture with raw pixel bytes.',
    params: [
      {
        name: 'textureId',
        type: 'u32',
        doc: 'Host logical ID of the texture'
      },
      {
        name: 'rect',
        type: { json: 'TextureUpdateDesc' },
        doc: 'Sub-rectangle coordinates'
      },
      {
        name: 'data',
        type: 'ptr',
        doc: 'Pointer to raw pixel data bytes'
      },
      {
        name: 'dataLen',
        type: 'u64',
        doc: 'Length of raw pixel data in bytes'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_resource_dispose_texture',
    methodName: 'resourceDisposeTexture',
    doc: 'Disposes a shared logical texture from GPU memory.',
    params: [
      {
        name: 'textureId',
        type: 'u32',
        doc: 'Host logical ID of the texture to dispose'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_resource_create_buffer',
    methodName: 'resourceCreateBuffer',
    doc: 'Allocates and initializes a shared GPU buffer under a host logical ID with raw byte contents.',
    params: [
      {
        name: 'bufferId',
        type: 'u32',
        doc: 'Host logical ID of the buffer'
      },
      {
        name: 'desc',
        type: { json: 'BufferDesc' },
        doc: 'Buffer creation configuration descriptor'
      },
      {
        name: 'data',
        type: 'ptr',
        doc: 'Pointer to raw buffer byte contents'
      },
      {
        name: 'dataLen',
        type: 'u64',
        doc: 'Length of raw buffer contents in bytes'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_resource_update_buffer',
    methodName: 'resourceUpdateBuffer',
    doc: 'Updates byte contents of an existing logical buffer at a given offset with raw byte contents.',
    params: [
      {
        name: 'bufferId',
        type: 'u32',
        doc: 'Host logical ID of the buffer'
      },
      {
        name: 'offset',
        type: 'u64',
        doc: 'Byte offset in destination buffer'
      },
      {
        name: 'data',
        type: 'ptr',
        doc: 'Pointer to raw byte contents'
      },
      {
        name: 'dataLen',
        type: 'u64',
        doc: 'Length of raw byte contents in bytes'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_resource_dispose_buffer',
    methodName: 'resourceDisposeBuffer',
    doc: 'Disposes a shared logical buffer from GPU memory.',
    params: [
      {
        name: 'bufferId',
        type: 'u32',
        doc: 'Host logical ID of the buffer to dispose'
      }
    ],
    returnType: 'i32'
  }
];
