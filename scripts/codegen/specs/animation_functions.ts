import type { FunctionSpec } from './types';

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
  },
  {
    cName: 'galfus_animation_create_path_follow',
    methodName: 'animationCreatePathFollow',
    doc: 'Creates a new path follower traversing a declarative SVG-like path.',
    params: [
      { name: 'pathId', type: 'u32', doc: 'Logical ID of the path follower' },
      {
        name: 'commands',
        type: { jsonArray: 'PathCommand' },
        doc: 'List of SVG-like path motion commands'
      },
      {
        name: 'config',
        type: { json: 'PathFollowConfig' },
        doc: 'Path follow configuration',
        optional: true
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_bind_path_follow_target',
    methodName: 'animationBindPathFollowTarget',
    doc: 'Binds a path follower to an entity property target with conflict locking.',
    params: [
      { name: 'pathId', type: 'u32', doc: 'Logical ID of the path follower' },
      { name: 'target', type: { json: 'AnimationTarget' }, doc: 'Target property identifier' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_unbind_path_follow_target',
    methodName: 'animationUnbindPathFollowTarget',
    doc: 'Unbinds a target from a path follower and releases its property lock.',
    params: [{ name: 'pathId', type: 'u32', doc: 'Logical ID of the path follower' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_destroy_path_follow',
    methodName: 'animationDestroyPathFollow',
    doc: 'Destroys a path follower by ID.',
    params: [{ name: 'pathId', type: 'u32', doc: 'Logical ID of the path follower' }],
    returnType: 'i32'
  },
  {
    cName: 'galfus_animation_get_path_follow_state',
    methodName: 'animationGetPathFollowState',
    doc: 'Queries the current playback status and progress of a path follower.',
    params: [{ name: 'pathId', type: 'u32', doc: 'Logical ID of the path follower' }],
    returnType: { json: 'PathFollowState' }
  }
];
