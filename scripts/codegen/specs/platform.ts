import type { FunctionSpec } from './types';
export { platformDescriptors } from './platform_desc';

export const platformFunctions: FunctionSpec[] = [
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
    cName: 'galfus_window_set_icon',
    methodName: 'windowSetIcon',
    doc: 'Sets the visual application icon of a window using raw encoded image bytes (ICO, PNG, WebP, JPEG).',
    params: [
      {
        name: 'windowId',
        type: 'u32',
        doc: 'Host logical ID of the window'
      },
      {
        name: 'data',
        type: 'ptr',
        doc: 'Pointer to raw icon image bytes'
      },
      {
        name: 'dataLen',
        type: 'u64',
        doc: 'Length of icon image data in bytes'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_platform_pump_events',
    methodName: 'platformPumpEvents',
    doc: 'Pumps platform input events into a fixed-layout batch; its pointers expire on release or shutdown.',
    params: [
      {
        name: 'outBatch',
        type: { nativeStruct: 'EventBatch' },
        doc: 'Caller-owned output event batch.',
        out: true
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_platform_release_event_batch',
    methodName: 'platformReleaseEventBatch',
    doc: 'Releases an event batch and invalidates its native pointer ranges.',
    params: [
      {
        name: 'batchId',
        type: 'u64',
        doc: 'Batch identifier returned by platformPumpEvents.'
      }
    ],
    returnType: 'i32'
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
    cName: 'galfus_audio_load_sound',
    methodName: 'audioLoadSound',
    doc: 'Loads raw audio data bytes (WAV, MP3, OGG, FLAC) from memory under a host logical ID.',
    params: [
      {
        name: 'soundId',
        type: 'u32',
        doc: 'Host logical ID of the sound asset'
      },
      {
        name: 'data',
        type: 'ptr',
        doc: 'Pointer to raw audio byte buffer'
      },
      {
        name: 'dataLen',
        type: 'u64',
        doc: 'Length of audio byte buffer'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_audio_play_sound',
    methodName: 'audioPlaySound',
    doc: 'Plays a registered sound resource and returns its controllable voice ID.',
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
    returnType: 'u32',
    errorSentinel: 0
  },
  {
    cName: 'galfus_audio_play_sound_spatial',
    methodName: 'audioPlaySoundSpatial',
    doc: 'Plays a spatial sound and returns its controllable voice ID.',
    params: [
      {
        name: 'soundId',
        type: 'u32',
        doc: 'Host logical ID of the sound'
      },
      { name: 'spatial', type: { nativeStruct: 'SpatialAudio' }, doc: 'Spatial playback state.' }
    ],
    returnType: 'u32',
    errorSentinel: 0
  },
  {
    cName: 'galfus_audio_update_sound_spatial',
    methodName: 'audioUpdateSoundSpatial',
    doc: 'Updates spatial positioning of an active sound voice relative to a listener ear.',
    params: [
      {
        name: 'voiceId',
        type: 'u32',
        doc: 'Voice ID to update'
      },
      { name: 'spatial', type: { nativeStruct: 'SpatialAudio' }, doc: 'Spatial playback state.' }
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
    cName: 'galfus_platform_get_window_size',
    methodName: 'platformGetWindowSizeRaw',
    doc: 'Reads the physical inner size (width, height) of a Platform window into two uint32 out pointers.',
    params: [
      {
        name: 'windowId',
        type: 'u32',
        doc: 'Window logical ID'
      },
      {
        name: 'outWidth',
        type: 'ptr',
        doc: 'Pointer to uint32 receiving width in physical pixels'
      },
      {
        name: 'outHeight',
        type: 'ptr',
        doc: 'Pointer to uint32 receiving height in physical pixels'
      }
    ],
    returnType: 'i32'
  }
];
