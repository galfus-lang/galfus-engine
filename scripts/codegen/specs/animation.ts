import type { DescSpec, FunctionSpec } from './types';

export const animationDescriptors: DescSpec[] = [
  {
    kind: 'enum',
    name: 'LoopMode',
    doc: 'Repetition behavior for animation transitions.',
    values: ['once', 'loop', 'pingPong']
  },
  {
    kind: 'enum',
    name: 'TransitionStatus',
    doc: 'Execution status of an active animation transition.',
    values: ['idle', 'delay', 'running', 'completed']
  },
  {
    kind: 'enum',
    name: 'AnimationEventType',
    doc: 'Lifecycle event classification emitted during transition playback.',
    values: ['started', 'completed', 'looped']
  },
  {
    kind: 'enum',
    name: 'Easing',
    doc: 'Mathematical easing curve or spring profile for property transitions.',
    values: [
      'linear',
      'easeInQuad',
      'easeOutQuad',
      'easeInOutQuad',
      'easeInCubic',
      'easeOutCubic',
      'easeInOutCubic',
      'easeInQuart',
      'easeOutQuart',
      'easeInOutQuart',
      'easeInQuint',
      'easeOutQuint',
      'easeInOutQuint',
      'easeInSine',
      'easeOutSine',
      'easeInOutSine',
      'easeInExpo',
      'easeOutExpo',
      'easeInOutExpo',
      'easeInCirc',
      'easeOutCirc',
      'easeInOutCirc',
      'easeInBack',
      'easeOutBack',
      'easeInOutBack',
      'easeInElastic',
      'easeOutElastic',
      'easeInOutElastic',
      'easeInBounce',
      'easeOutBounce',
      'easeInOutBounce'
    ]
  },
  {
    kind: 'union',
    name: 'AnimValue',
    doc: 'Polymorphic value for animatable properties.',
    variants: [
      {
        inline: {
          type: { type: { literal: 'scalar' } },
          value: { type: 'number' }
        }
      },
      {
        inline: {
          type: { type: { literal: 'vec2' } },
          value: { type: { tuple: ['number', 'number'] } }
        }
      },
      {
        inline: {
          type: { type: { literal: 'vec3' } },
          value: { type: { tuple: ['number', 'number', 'number'] } }
        }
      },
      {
        inline: {
          type: { type: { literal: 'vec4' } },
          value: { type: { tuple: ['number', 'number', 'number', 'number'] } }
        }
      },
      {
        inline: {
          type: { type: { literal: 'quat' } },
          value: { type: { tuple: ['number', 'number', 'number', 'number'] } }
        }
      },
      {
        inline: {
          type: { type: { literal: 'transform3D' } },
          value: {
            type: {
              tuple: [
                'number',
                'number',
                'number',
                'number',
                'number',
                'number',
                'number',
                'number',
                'number',
                'number'
              ]
            }
          }
        }
      },
      {
        inline: {
          type: { type: { literal: 'transform2D' } },
          value: {
            type: {
              tuple: ['number', 'number', 'number', 'number', 'number', 'number']
            }
          }
        }
      }
    ]
  },
  {
    kind: 'union',
    name: 'AnimationTarget',
    doc: 'Identifies the destination property animated by a transition.',
    variants: [
      {
        inline: {
          kind: { type: { literal: 'modelTransform3D' } },
          realmId: { type: 'number' },
          modelId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'camera3DTransform' } },
          realmId: { type: 'number' },
          cameraId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'material3DBaseColor' } },
          realmId: { type: 'number' },
          materialId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'light3DColor' } },
          realmId: { type: 'number' },
          lightId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'spriteTransform2D' } },
          realmId: { type: 'number' },
          spriteId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'camera2DTransform' } },
          realmId: { type: 'number' },
          cameraId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'material2DColor' } },
          realmId: { type: 'number' },
          materialId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'shapeTransform2D' } },
          realmId: { type: 'number' },
          shapeId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'svgTransform2D' } },
          realmId: { type: 'number' },
          svgId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'svgOpacity' } },
          realmId: { type: 'number' },
          svgId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'svgAttributeColor' } },
          realmId: { type: 'number' },
          svgId: { type: 'number' },
          elementId: { type: 'string' },
          attribute: { type: 'string' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'svgAttributeScalar' } },
          realmId: { type: 'number' },
          svgId: { type: 'number' },
          elementId: { type: 'string' },
          attribute: { type: 'string' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'svgAttributeVec2' } },
          realmId: { type: 'number' },
          svgId: { type: 'number' },
          elementId: { type: 'string' },
          attribute: { type: 'string' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'invocationClearColor' } },
          invocationId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'invocationZIndex' } },
          invocationId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'customChannel' } },
          channelId: { type: 'number' }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'TransitionConfig',
    doc: 'Configuration specifying duration, delay, curve, and repetition for a transition.',
    fields: {
      duration: { type: 'number' },
      delay: { type: 'number', optional: true },
      easing: { type: { ref: 'Easing' }, optional: true },
      loopMode: { type: { ref: 'LoopMode' }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'TransitionState',
    doc: 'Snapshot query state of an active transition.',
    fields: {
      status: { type: { ref: 'TransitionStatus' } },
      progress: { type: 'number' },
      elapsed: { type: 'number' },
      remainingDelay: { type: 'number' },
      currentValue: { type: { ref: 'AnimValue' } },
      startValue: { type: { ref: 'AnimValue' } },
      targetValue: { type: { ref: 'AnimValue' } }
    }
  },
  {
    kind: 'object',
    name: 'AnimationEvent',
    doc: 'Lifecycle event emitted during transition execution.',
    fields: {
      transitionId: { type: 'number' },
      eventType: { type: { ref: 'AnimationEventType' } },
      target: { type: { ref: 'AnimationTarget' }, optional: true },
      value: { type: { ref: 'AnimValue' } },
      elapsed: { type: 'number' }
    }
  }
];

export const animationFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_animation_create_transition',
    methodName: 'animationCreateTransition',
    doc: 'Creates a new property transition with an initial value and timing configuration.',
    params: [
      { name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' },
      { name: 'initialValue', type: { json: 'AnimValue' }, doc: 'Initial value descriptor' },
      {
        name: 'config',
        type: { json: 'TransitionConfig' },
        doc: 'Transition timing configuration',
        optional: true
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_bind_target',
    methodName: 'animationBindTarget',
    doc: 'Binds an existing transition to a realm entity or multiverse property target.',
    params: [
      { name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' },
      { name: 'target', type: { json: 'AnimationTarget' }, doc: 'Target property identifier' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_unbind_target',
    methodName: 'animationUnbindTarget',
    doc: 'Unbinds a target from a transition and releases its property lock.',
    params: [{ name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_transition_to',
    methodName: 'animationTransitionTo',
    doc: 'Triggers a smooth transition from the live value towards a new target value.',
    params: [
      { name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' },
      { name: 'targetValue', type: { json: 'AnimValue' }, doc: 'Destination target value' },
      {
        name: 'config',
        type: { json: 'TransitionConfig' },
        doc: 'Optional updated timing configuration',
        optional: true
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_create_scalar_transition',
    methodName: 'animationCreateScalarTransition',
    doc: 'Fast-path helper creating a scalar transition.',
    params: [
      { name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' },
      { name: 'initialScalar', type: 'f32', doc: 'Initial float value' },
      { name: 'duration', type: 'f32', doc: 'Duration in seconds' },
      { name: 'delay', type: 'f32', doc: 'Delay in seconds' },
      { name: 'easingId', type: 'u32', doc: 'Numeric easing index (0 = Linear)' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_transition_to_scalar',
    methodName: 'animationTransitionToScalar',
    doc: 'Fast-path helper smoothly transitioning a scalar property.',
    params: [
      { name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' },
      { name: 'targetScalar', type: 'f32', doc: 'Target float value' },
      { name: 'duration', type: 'f32', doc: 'Duration in seconds' },
      { name: 'delay', type: 'f32', doc: 'Delay in seconds' },
      { name: 'easingId', type: 'u32', doc: 'Numeric easing index (0 = Linear)' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_transition_to_transform3d',
    methodName: 'animationTransitionToTransform3d',
    doc: 'Fast-path transitioning a 3D Transform from 10 raw floats (pos, quat, scale).',
    params: [
      { name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' },
      { name: 'floats', type: 'ptr', doc: 'Pointer to 10 contiguous floats' },
      { name: 'duration', type: 'f32', doc: 'Duration in seconds' },
      { name: 'delay', type: 'f32', doc: 'Delay in seconds' },
      { name: 'easingId', type: 'u32', doc: 'Numeric easing index (0 = Linear)' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_transition_to_transform2d',
    methodName: 'animationTransitionToTransform2d',
    doc: 'Fast-path transitioning a 2D Transform from 6 raw floats (pos, rot, scale, z_layer).',
    params: [
      { name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' },
      { name: 'floats', type: 'ptr', doc: 'Pointer to 6 contiguous floats' },
      { name: 'duration', type: 'f32', doc: 'Duration in seconds' },
      { name: 'delay', type: 'f32', doc: 'Delay in seconds' },
      { name: 'easingId', type: 'u32', doc: 'Numeric easing index (0 = Linear)' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_get_state',
    methodName: 'animationGetState',
    doc: 'Queries the current playback status and progress of a transition.',
    params: [{ name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' }],
    returnType: { json: 'TransitionState' }
  },
  {
    cName: 'galfus_animation_get_value',
    methodName: 'animationGetValue',
    doc: 'Queries the current evaluated value of a transition.',
    params: [{ name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' }],
    returnType: { json: 'AnimValue' }
  },
  {
    cName: 'galfus_animation_destroy_transition',
    methodName: 'animationDestroyTransition',
    doc: 'Destroys an animation transition by ID.',
    params: [{ name: 'transitionId', type: 'u32', doc: 'Logical ID of the transition' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_step',
    methodName: 'animationStep',
    doc: 'Advances all active animation transitions by dt seconds and applies updates to Multiverse.',
    params: [{ name: 'dt', type: 'f32', doc: 'Delta time in seconds' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_pump_events',
    methodName: 'animationPumpEvents',
    doc: 'Drains and returns all queued animation lifecycle events.',
    params: [],
    returnType: { jsonArray: 'AnimationEvent' }
  },
  {
    cName: 'galfus_animation_set_custom_channel',
    methodName: 'animationSetCustomChannel',
    doc: 'Writes directly to a custom animation channel.',
    params: [
      { name: 'channelId', type: 'u32', doc: 'Channel logical ID' },
      { name: 'value', type: { json: 'AnimValue' }, doc: 'Value to set' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_get_custom_channel',
    methodName: 'animationGetCustomChannel',
    doc: 'Reads directly from a custom animation channel.',
    params: [{ name: 'channelId', type: 'u32', doc: 'Channel logical ID' }],
    returnType: { json: 'AnimValue' }
  }
];
