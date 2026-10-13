export type TypeKind = 'void' | 'i32' | 'u32' | 'f32' | 'f64' | 'string_in' | 'string_out' | 'bool';

export interface ParamSpec {
  name: string;
  type: TypeKind;
  doc: string;
}

export interface FunctionSpec {
  cName: string;
  methodName: string;
  doc: string;
  params: ParamSpec[];
  returnType: TypeKind;
  returnsJson?: boolean;
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
    returnType: 'string_out'
  },
  {
    cName: 'galfus_platform_get_capabilities',
    methodName: 'platformGetCapabilities',
    doc: 'Retrieves platform environment capabilities as structured data.',
    params: [],
    returnType: 'string_out',
    returnsJson: true
  },
  {
    cName: 'galfus_window_create',
    methodName: 'windowCreate',
    doc: 'Creates a new window or binds a surface from a configuration.',
    params: [
      {
        name: 'configJson',
        type: 'string_in',
        doc: 'JSON string containing WindowConfig'
      }
    ],
    returnType: 'i32'
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
        type: 'string_in',
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
    returnType: 'string_out',
    returnsJson: true
  },
  {
    cName: 'galfus_gamepad_get_connected',
    methodName: 'gamepadGetConnected',
    doc: 'Retrieves all currently connected gamepads and their capabilities.',
    params: [],
    returnType: 'string_out',
    returnsJson: true
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
    cName: 'galfus_multiverse_create_target',
    methodName: 'multiverseCreateTarget',
    doc: 'Registers a new Target in the Multiverse using a JSON description.',
    params: [
      {
        name: 'targetId',
        type: 'u32',
        doc: 'Logical ID of the Target'
      },
      {
        name: 'descJson',
        type: 'string',
        doc: 'JSON representation of TargetDesc'
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
        name: 'descJson',
        type: 'string',
        doc: 'JSON representation of InvocationDesc'
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
    cName: 'galfus_multiverse_bind_target_texture',
    methodName: 'multiverseBindTargetTexture',
    doc: 'Binds a Target output texture to a Realm input slot.',
    params: [
      {
        name: 'bindingJson',
        type: 'string',
        doc: 'JSON representation of TargetTextureBinding'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_multiverse_resolve',
    methodName: 'multiverseResolve',
    doc: 'Resolves and returns the Multiverse execution schedule as JSON.',
    params: [],
    returnType: 'string'
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
