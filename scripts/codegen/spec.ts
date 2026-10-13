export type PrimitiveType = 'void' | 'bool' | 'i32' | 'u32' | 'u64' | 'f32' | 'f64' | 'string';

export type DataType = PrimitiveType | { json: string } | { jsonArray: string };

export interface ParamSpec {
  name: string;
  type: DataType;
  doc: string;
}

export interface FunctionSpec {
  cName: string;
  methodName: string;
  doc: string;
  params: ParamSpec[];
  returnType: DataType;
  /** Optional extraction of a return value from an input param on success (e.g. config.id) */
  returnsParamField?: { paramName: string; fieldName: string };
}

export function isPrimitive(type: DataType): type is PrimitiveType {
  return typeof type === 'string';
}

export function isJson(type: DataType): type is { json: string } {
  return typeof type === 'object' && 'json' in type;
}

export function isJsonArray(type: DataType): type is { jsonArray: string } {
  return typeof type === 'object' && 'jsonArray' in type;
}

export const API_FUNCTIONS: FunctionSpec[] = [
  {
    cName: 'galfus_platform_init',
    methodName: 'platformInit',
    doc: 'Initializes the global platform coordinator.',
    params: [],
    returnType: 'i32'
  },
  {
    cName: 'galfus_platform_init_headless',
    methodName: 'platformInitHeadless',
    doc: 'Initializes the global platform coordinator in headless mode.',
    params: [],
    returnType: 'i32'
  },
  {
    cName: 'galfus_platform_shutdown',
    methodName: 'platformShutdown',
    doc: 'Shuts down and cleans up the platform coordinator.',
    params: [],
    returnType: 'i32'
  },
  {
    cName: 'galfus_get_last_error',
    methodName: 'getLastError',
    doc: 'Retrieves the last recorded error message.',
    params: [],
    returnType: 'string'
  },
  {
    cName: 'galfus_platform_get_capabilities',
    methodName: 'platformGetCapabilities',
    doc: 'Retrieves platform environment capabilities as structured data.',
    params: [],
    returnType: { json: 'PlatformCapabilities' }
  },
  {
    cName: 'galfus_window_create',
    methodName: 'windowCreate',
    doc: 'Creates a new window or binds a surface from a configuration.',
    params: [
      {
        name: 'config',
        type: { json: 'WindowConfig' },
        doc: 'Window configuration descriptor'
      }
    ],
    returnType: 'i32',
    returnsParamField: { paramName: 'config', fieldName: 'id' }
  },
  {
    cName: 'galfus_window_close',
    methodName: 'windowClose',
    doc: 'Closes and destroys a window by its logical ID.',
    params: [
      {
        name: 'windowId',
        type: 'u32',
        doc: 'Host-controlled logical ID'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_window_set_title',
    methodName: 'windowSetTitle',
    doc: 'Updates the title bar of a window.',
    params: [
      {
        name: 'windowId',
        type: 'u32',
        doc: 'Host-controlled logical ID'
      },
      {
        name: 'title',
        type: 'string',
        doc: 'New title text'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_window_set_cursor_grab',
    methodName: 'windowSetCursorGrab',
    doc: 'Updates the cursor grab mode (0: None, 1: Confined, 2: Locked).',
    params: [
      {
        name: 'windowId',
        type: 'u32',
        doc: 'Host-controlled logical ID'
      },
      {
        name: 'mode',
        type: 'u32',
        doc: 'Grab mode index'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_window_set_cursor_icon',
    methodName: 'windowSetCursorIcon',
    doc: 'Updates the visual appearance icon of the cursor.',
    params: [
      {
        name: 'windowId',
        type: 'u32',
        doc: 'Host-controlled logical ID'
      },
      {
        name: 'icon',
        type: 'u32',
        doc: 'Cursor icon index'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_platform_pump_events',
    methodName: 'platformPumpEvents',
    doc: 'Pumps and collects pending platform input events.',
    params: [],
    returnType: { jsonArray: 'PlatformEvent' }
  },
  {
    cName: 'galfus_gamepad_get_connected',
    methodName: 'gamepadGetConnected',
    doc: 'Retrieves all currently connected gamepads and their capabilities.',
    params: [],
    returnType: { jsonArray: 'GamepadInfo' }
  },
  {
    cName: 'galfus_gamepad_set_rumble',
    methodName: 'gamepadSetRumble',
    doc: 'Triggers rumble vibration on a connected gamepad.',
    params: [
      {
        name: 'gamepadId',
        type: 'u32',
        doc: 'Logical ID of the gamepad'
      },
      {
        name: 'strongMagnitude',
        type: 'f32',
        doc: 'Low-frequency rumble intensity (0.0 to 1.0)'
      },
      {
        name: 'weakMagnitude',
        type: 'f32',
        doc: 'High-frequency rumble intensity (0.0 to 1.0)'
      },
      {
        name: 'durationMs',
        type: 'u32',
        doc: 'Duration in milliseconds'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_audio_play_sound',
    methodName: 'audioPlaySound',
    doc: 'Plays a registered sound resource using playback parameters.',
    params: [
      {
        name: 'soundId',
        type: 'u32',
        doc: 'Logical ID of the sound'
      },
      {
        name: 'volume',
        type: 'f32',
        doc: 'Playback volume multiplier (1.0 = normal)'
      },
      {
        name: 'panning',
        type: 'f32',
        doc: 'Stereo panning position (-1.0 to 1.0)'
      },
      {
        name: 'speed',
        type: 'f32',
        doc: 'Playback speed rate multiplier'
      },
      {
        name: 'looping',
        type: 'bool',
        doc: 'Whether the sound loops indefinitely'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_audio_pause_sound',
    methodName: 'audioPauseSound',
    doc: 'Pauses a playing sound voice.',
    params: [
      {
        name: 'voiceId',
        type: 'u32',
        doc: 'Voice ID to pause'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_audio_resume_sound',
    methodName: 'audioResumeSound',
    doc: 'Resumes a paused sound voice.',
    params: [
      {
        name: 'voiceId',
        type: 'u32',
        doc: 'Voice ID to resume'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_audio_stop_sound',
    methodName: 'audioStopSound',
    doc: 'Stops a playing or paused sound voice.',
    params: [
      {
        name: 'voiceId',
        type: 'u32',
        doc: 'Voice ID to stop'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_audio_set_volume',
    methodName: 'audioSetVolume',
    doc: 'Updates the volume of an active sound voice.',
    params: [
      {
        name: 'voiceId',
        type: 'u32',
        doc: 'Voice ID to update'
      },
      {
        name: 'volume',
        type: 'f32',
        doc: 'New volume multiplier'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_audio_set_panning',
    methodName: 'audioSetPanning',
    doc: 'Updates the panning of an active sound voice.',
    params: [
      {
        name: 'voiceId',
        type: 'u32',
        doc: 'Voice ID to update'
      },
      {
        name: 'panning',
        type: 'f32',
        doc: 'New stereo panning position'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_audio_unload_sound',
    methodName: 'audioUnloadSound',
    doc: 'Unloads a registered sound resource from memory.',
    params: [
      {
        name: 'soundId',
        type: 'u32',
        doc: 'Sound ID to unload'
      }
    ],
    returnType: 'i32'
  },
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
    cName: 'galfus_multiverse_create_connector',
    methodName: 'multiverseCreateConnector',
    doc: 'Creates a Connector between two Targets.',
    params: [
      {
        name: 'connectorId',
        type: 'u32',
        doc: 'Logical ID of the Connector'
      },
      {
        name: 'desc',
        type: { json: 'ConnectorDesc' },
        doc: 'Connector description'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_destroy_connector',
    methodName: 'multiverseDestroyConnector',
    doc: 'Destroys a Connector.',
    params: [
      {
        name: 'connectorId',
        type: 'u32',
        doc: 'Connector ID to destroy'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_set_connector_enabled',
    methodName: 'multiverseSetConnectorEnabled',
    doc: 'Enables or disables a Connector.',
    params: [
      {
        name: 'connectorId',
        type: 'u32',
        doc: 'Connector ID'
      },
      {
        name: 'enabled',
        type: 'bool',
        doc: 'Whether the connector is active'
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
