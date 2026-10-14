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
    name: 'TextureCreatePayload',
    doc: 'Payload for creating a texture with initial pixel data.',
    fields: {
      desc: { type: { ref: 'GpuTextureDesc' } },
      dataBase64: { type: 'string' }
    }
  },
  {
    kind: 'object',
    name: 'TextureUpdatePayload',
    doc: 'Payload for updating a texture sub-rectangle with pixel data.',
    fields: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
      dataBase64: { type: 'string' }
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
    name: 'BufferCreatePayload',
    doc: 'Payload for creating a buffer with initial byte data.',
    fields: {
      label: { type: 'string', optional: true },
      usages: { type: { ref: 'BufferUsageFlags' } },
      dataBase64: { type: 'string' }
    }
  },
  {
    kind: 'object',
    name: 'BufferUpdatePayload',
    doc: 'Payload for updating buffer contents at an offset.',
    fields: {
      offset: { type: 'number' },
      dataBase64: { type: 'string' }
    }
  }
];

export const resourceFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_resource_create_texture',
    methodName: 'resourceCreateTexture',
    doc: 'Allocates and initializes a shared GPU texture under a host logical ID.',
    params: [
      {
        name: 'textureId',
        type: 'u32',
        doc: 'Host logical ID of the texture'
      },
      {
        name: 'payload',
        type: { json: 'TextureCreatePayload' },
        doc: 'Texture creation descriptor and base64 pixel data'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_resource_update_texture',
    methodName: 'resourceUpdateTexture',
    doc: 'Updates a sub-rectangle of an existing logical texture with base64 pixel data.',
    params: [
      {
        name: 'textureId',
        type: 'u32',
        doc: 'Host logical ID of the texture'
      },
      {
        name: 'payload',
        type: { json: 'TextureUpdatePayload' },
        doc: 'Sub-rectangle coordinates and base64 pixel data'
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
    doc: 'Allocates and initializes a shared GPU buffer under a host logical ID.',
    params: [
      {
        name: 'bufferId',
        type: 'u32',
        doc: 'Host logical ID of the buffer'
      },
      {
        name: 'payload',
        type: { json: 'BufferCreatePayload' },
        doc: 'Buffer creation descriptor and base64 byte contents'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_resource_update_buffer',
    methodName: 'resourceUpdateBuffer',
    doc: 'Updates byte contents of an existing logical buffer at a given offset.',
    params: [
      {
        name: 'bufferId',
        type: 'u32',
        doc: 'Host logical ID of the buffer'
      },
      {
        name: 'payload',
        type: { json: 'BufferUpdatePayload' },
        doc: 'Offset and base64 byte contents'
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
