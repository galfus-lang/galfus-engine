import type { DescSpec, FunctionSpec } from './types';

export const multiverseDescriptors: DescSpec[] = [
  {
    kind: 'union',
    name: 'TargetKind',
    doc: 'Target type: window surface swapchain or offscreen GPU texture.',
    variants: [
      {
        inline: {
          type: { type: { literal: 'window' } },
          windowId: { type: 'number' }
        }
      },
      {
        inline: {
          type: { type: { literal: 'texture' } },
          width: { type: 'number' },
          height: { type: 'number' },
          format: { type: 'string', optional: true }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'TargetDesc',
    doc: 'Descriptor for creating a Target in the Multiverse.',
    fields: {
      kind: { type: { ref: 'TargetKind' } },
      size: { type: { tuple: ['number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'union',
    name: 'ViewportRect',
    doc: 'Viewport rectangle defined in pixels or normalized (0.0 to 1.0) coordinates.',
    variants: [
      {
        inline: {
          unit: { type: { literal: 'pixels' } },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' }
        }
      },
      {
        inline: {
          unit: { type: { literal: 'normalized' } },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' }
        }
      }
    ]
  },
  {
    kind: 'union',
    name: 'InvocationFilter',
    doc: 'Filter pass applied after a Realm renders to its Target.',
    variants: [
      { literal: 'sepia' },
      {
        inline: {
          custom: {
            type: {
              inline: {
                shaderId: { type: 'number' }
              }
            }
          }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'InvocationDesc',
    doc: 'Descriptor linking a Realm to a Target with optional viewport and filters.',
    fields: {
      realmId: { type: 'number' },
      targetId: { type: 'number' },
      cameraSlot: { type: 'number', optional: true },
      viewport: { type: { ref: 'ViewportRect' }, optional: true },
      filters: { type: { array: { ref: 'InvocationFilter' } }, optional: true },
      zIndex: { type: 'number', optional: true },
      enabled: { type: 'boolean', optional: true },
      clearColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'TargetTextureBinding',
    doc: 'Binds an output Target texture to a Realm input slot.',
    fields: {
      sourceTargetId: { type: 'number' },
      realmId: { type: 'number' },
      slot: { type: 'string' }
    }
  },
  {
    kind: 'object',
    name: 'ResolvedInvocationStep',
    doc: 'Resolved step in the Multiverse frame schedule.',
    fields: {
      invocationId: { type: 'number' },
      realmId: { type: 'number' },
      cameraSlot: { type: 'number', optional: true },
      resolvedViewport: { type: { tuple: ['number', 'number', 'number', 'number'] } },
      zIndex: { type: 'number' },
      clearColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      filters: { type: { array: { ref: 'InvocationFilter' } } }
    }
  },
  {
    kind: 'object',
    name: 'TargetExecutionBlock',
    doc: 'Group of ordered invocations targeting a single render target.',
    fields: {
      targetId: { type: 'number' },
      invocations: { type: { array: { ref: 'ResolvedInvocationStep' } } }
    }
  },
  {
    kind: 'object',
    name: 'MultiverseSchedule',
    doc: 'Complete execution graph schedule resolved for a frame.',
    fields: {
      targetBlocks: { type: { array: { ref: 'TargetExecutionBlock' } } }
    }
  }
];

export const multiverseFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_multiverse_attach_window',
    methodName: 'multiverseAttachWindow',
    doc: 'Attaches a platform window to the Multiverse context for surface rendering.',
    params: [
      {
        name: 'windowId',
        type: 'u32',
        doc: 'Logical ID of the window to attach'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_create_target',
    methodName: 'multiverseCreateTarget',
    doc: 'Registers a new Target in the Multiverse using a TargetDesc descriptor.',
    params: [
      {
        name: 'targetId',
        type: 'u32',
        doc: 'Logical ID of the Target'
      },
      {
        name: 'desc',
        type: { json: 'TargetDesc' },
        doc: 'Target description'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_destroy_target',
    methodName: 'multiverseDestroyTarget',
    doc: 'Destroys a Target in the Multiverse.',
    params: [
      {
        name: 'targetId',
        type: 'u32',
        doc: 'Target ID to destroy'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_register_color_realm',
    methodName: 'multiverseRegisterColorRealm',
    doc: 'Registers a solid color test Realm in the Multiverse.',
    params: [
      {
        name: 'realmId',
        type: 'u32',
        doc: 'Logical ID of the Realm'
      },
      {
        name: 'r',
        type: 'f32',
        doc: 'Red channel (0.0 to 1.0)'
      },
      {
        name: 'g',
        type: 'f32',
        doc: 'Green channel (0.0 to 1.0)'
      },
      {
        name: 'b',
        type: 'f32',
        doc: 'Blue channel (0.0 to 1.0)'
      },
      {
        name: 'a',
        type: 'f32',
        doc: 'Alpha channel (0.0 to 1.0)'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_unregister_realm',
    methodName: 'multiverseUnregisterRealm',
    doc: 'Unregisters a Realm from the Multiverse.',
    params: [
      {
        name: 'realmId',
        type: 'u32',
        doc: 'Logical ID of the Realm to unregister'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_register_shader',
    methodName: 'multiverseRegisterShader',
    doc: 'Registers a custom WGSL post-processing shader with an ID.',
    params: [
      {
        name: 'shaderId',
        type: 'u32',
        doc: 'Custom shader logical ID'
      },
      {
        name: 'source',
        type: 'string',
        doc: 'WGSL source code string'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_create_invocation',
    methodName: 'multiverseCreateInvocation',
    doc: 'Creates an Invocation in the Multiverse linking a Realm to a Target.',
    params: [
      {
        name: 'invocationId',
        type: 'u32',
        doc: 'Logical ID of the Invocation'
      },
      {
        name: 'desc',
        type: { json: 'InvocationDesc' },
        doc: 'Invocation description'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_destroy_invocation',
    methodName: 'multiverseDestroyInvocation',
    doc: 'Destroys an Invocation in the Multiverse.',
    params: [
      {
        name: 'invocationId',
        type: 'u32',
        doc: 'Invocation ID to destroy'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_set_invocation_enabled',
    methodName: 'multiverseSetInvocationEnabled',
    doc: 'Enables or disables an Invocation in the Multiverse.',
    params: [
      {
        name: 'invocationId',
        type: 'u32',
        doc: 'Invocation ID'
      },
      {
        name: 'enabled',
        type: 'bool',
        doc: 'Whether the invocation is active'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_set_invocation_viewport',
    methodName: 'multiverseSetInvocationViewport',
    doc: 'Updates the viewport rectangle of an existing Invocation.',
    params: [
      {
        name: 'invocationId',
        type: 'u32',
        doc: 'Invocation ID'
      },
      {
        name: 'viewport',
        type: { json: 'ViewportRect' },
        doc: 'Viewport rectangle'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_set_invocation_filters',
    methodName: 'multiverseSetInvocationFilters',
    doc: 'Updates the post-process filter chain for an Invocation.',
    params: [
      {
        name: 'invocationId',
        type: 'u32',
        doc: 'Invocation ID'
      },
      {
        name: 'filters',
        type: { jsonArray: 'InvocationFilter' },
        doc: 'Array of post-processing filters'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_set_invocation_clear_color',
    methodName: 'multiverseSetInvocationClearColor',
    doc: 'Updates the clear color of an Invocation.',
    params: [
      {
        name: 'invocationId',
        type: 'u32',
        doc: 'Invocation ID'
      },
      {
        name: 'r',
        type: 'f32',
        doc: 'Red channel (0.0 to 1.0)'
      },
      {
        name: 'g',
        type: 'f32',
        doc: 'Green channel (0.0 to 1.0)'
      },
      {
        name: 'b',
        type: 'f32',
        doc: 'Blue channel (0.0 to 1.0)'
      },
      {
        name: 'a',
        type: 'f32',
        doc: 'Alpha channel (0.0 to 1.0)'
      },
      {
        name: 'hasClear',
        type: 'bool',
        doc: 'True to set clear color, false to disable clearing'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_set_invocation_camera_slot',
    methodName: 'multiverseSetInvocationCameraSlot',
    doc: 'Updates the camera slot bound to an existing Invocation.',
    params: [
      {
        name: 'invocationId',
        type: 'u32',
        doc: 'Invocation ID'
      },
      {
        name: 'cameraSlot',
        type: 'u32',
        doc: 'Camera slot index within the realm'
      },
      {
        name: 'hasSlot',
        type: 'bool',
        doc: 'True to bind camera slot, false to unbind'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_bind_target_texture',
    methodName: 'multiverseBindTargetTexture',
    doc: 'Binds a Target output texture to a Realm input slot.',
    params: [
      {
        name: 'binding',
        type: { json: 'TargetTextureBinding' },
        doc: 'Target texture binding descriptor'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_unbind_target_texture',
    methodName: 'multiverseUnbindTargetTexture',
    doc: 'Unbinds a Target texture from a Realm input slot.',
    params: [
      {
        name: 'realmId',
        type: 'u32',
        doc: 'Realm ID'
      },
      {
        name: 'slot',
        type: 'string',
        doc: 'Target texture slot name'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_update_window_size',
    methodName: 'multiverseUpdateWindowSize',
    doc: 'Updates the size of a window Target (e.g. on window resize).',
    params: [
      {
        name: 'windowId',
        type: 'u32',
        doc: 'Window logical ID'
      },
      {
        name: 'width',
        type: 'u32',
        doc: 'Width in physical pixels'
      },
      {
        name: 'height',
        type: 'u32',
        doc: 'Height in physical pixels'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_resolve',
    methodName: 'multiverseResolve',
    doc: 'Resolves and returns the Multiverse execution schedule as structured data.',
    params: [],
    returnType: { json: 'MultiverseSchedule' }
  },
  {
    cName: 'galfus_multiverse_dispatch',
    methodName: 'multiverseDispatch',
    doc: 'Dispatches the Multiverse schedule for a frame.',
    params: [
      {
        name: 'frameId',
        type: 'u64',
        doc: 'Monotonically increasing frame counter'
      },
      {
        name: 'deltaTime',
        type: 'f32',
        doc: 'Delta time in seconds since previous frame'
      }
    ],
    returnType: 'i32'
  }
];
