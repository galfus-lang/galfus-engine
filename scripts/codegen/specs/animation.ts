import type { DescSpec } from './types';
export { animationFunctions } from './animation_functions';

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
          kind: { type: { literal: 'camera3DLookAt' } },
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
          kind: { type: { literal: 'light3DTransform' } },
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
          kind: {
            type: {
              enum: [
                'uiElementBackgroundColor',
                'uiElementBorderColor',
                'uiElementBorderWidth',
                'uiElementBorderRadius',
                'uiElementOpacity',
                'uiElementPosition',
                'uiElementSize'
              ]
            }
          },
          realmId: { type: 'number' },
          uiId: { type: 'number' },
          elementId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'uiElementBorderSideColor' } },
          realmId: { type: 'number' },
          uiId: { type: 'number' },
          elementId: { type: 'number' },
          side: { type: 'number' }
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
  },
  {
    kind: 'enum',
    name: 'PathValueType',
    doc: 'Target evaluated animation value format produced by the path follower.',
    values: ['transform3D', 'position3D', 'transform2D', 'position2D']
  },
  {
    kind: 'union',
    name: 'PathCommand',
    doc: 'Declarative SVG-like path motion commands with individual duration and easing.',
    variants: [
      {
        inline: {
          type: { type: { literal: 'moveTo' } },
          to: { type: { array: 'number' } }
        }
      },
      {
        inline: {
          type: { type: { literal: 'lineTo' } },
          to: { type: { array: 'number' } },
          duration: { type: 'number', optional: true },
          easing: { type: { ref: 'Easing' }, optional: true }
        }
      },
      {
        inline: {
          type: { type: { literal: 'quadTo' } },
          control: { type: { array: 'number' } },
          to: { type: { array: 'number' } },
          duration: { type: 'number', optional: true },
          easing: { type: { ref: 'Easing' }, optional: true }
        }
      },
      {
        inline: {
          type: { type: { literal: 'cubicTo' } },
          control1: { type: { array: 'number' } },
          control2: { type: { array: 'number' } },
          to: { type: { array: 'number' } },
          duration: { type: 'number', optional: true },
          easing: { type: { ref: 'Easing' }, optional: true }
        }
      },
      {
        inline: {
          type: { type: { literal: 'smoothTo' } },
          to: { type: { array: 'number' } },
          duration: { type: 'number', optional: true },
          easing: { type: { ref: 'Easing' }, optional: true }
        }
      },
      {
        inline: {
          type: { type: { literal: 'pause' } },
          duration: { type: 'number' }
        }
      },
      {
        inline: {
          type: { type: { literal: 'close' } },
          duration: { type: 'number', optional: true },
          easing: { type: { ref: 'Easing' }, optional: true }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'PathFollowConfig',
    doc: 'Configuration for path follow traversal.',
    fields: {
      duration: { type: 'number', optional: true },
      delay: { type: 'number', optional: true },
      easing: { type: { ref: 'Easing' }, optional: true },
      loopMode: { type: { ref: 'LoopMode' }, optional: true },
      orientToPath: { type: 'boolean', optional: true },
      valueType: { type: { ref: 'PathValueType' }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'PathFollowState',
    doc: 'Snapshot query state of an active path follower.',
    fields: {
      status: { type: { ref: 'TransitionStatus' } },
      progress: { type: 'number' },
      elapsed: { type: 'number' },
      remainingDelay: { type: 'number' },
      currentValue: { type: { ref: 'AnimValue' } }
    }
  }
];
