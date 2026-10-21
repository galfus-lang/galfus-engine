export interface BrowserMethodSpec {
  name: string;
  doc: string;
  params: Array<{ name: string; type: string }>;
  returnType: string;
}

/**
 * Public methods exported by the wasm-bindgen GalfusBrowser class.
 *
 * This is intentionally separate from the native ABI specification: browser
 * methods are JavaScript-facing and do not use the C FFI calling convention.
 */
export const browserMethods: BrowserMethodSpec[] = [
  {
    name: 'renderDiagnosticCube',
    doc: 'Renders a GPU diagnostic cube at the requested animation time.',
    params: [
      { name: 'canvasId', type: 'string' },
      { name: 'elapsedSeconds', type: 'number' }
    ],
    returnType: 'Promise<void>'
  },
  {
    name: 'getCapabilities',
    doc: 'Returns the browser platform capabilities.',
    params: [],
    returnType: 'PlatformCapabilities'
  },
  {
    name: 'createWindow',
    doc: 'Creates a browser canvas surface from a window configuration.',
    params: [{ name: 'config', type: 'WindowConfig' }],
    returnType: 'number'
  },
  {
    name: 'closeWindow',
    doc: 'Closes the browser surface associated with a logical window ID.',
    params: [{ name: 'windowId', type: 'number' }],
    returnType: 'void'
  },
  {
    name: 'setWindowTitle',
    doc: 'Updates the title associated with a browser surface.',
    params: [
      { name: 'windowId', type: 'number' },
      { name: 'title', type: 'string' }
    ],
    returnType: 'void'
  },
  {
    name: 'windowSetCursorGrab',
    doc: 'Updates the cursor grab mode (0: None, 1: Confined, 2: Locked).',
    params: [
      { name: 'windowId', type: 'number' },
      { name: 'mode', type: 'number' }
    ],
    returnType: 'void'
  },
  {
    name: 'windowSetCursorIcon',
    doc: 'Updates the cursor icon using the browser binding icon index.',
    params: [
      { name: 'windowId', type: 'number' },
      { name: 'icon', type: 'number' }
    ],
    returnType: 'void'
  },
  {
    name: 'windowGetSize',
    doc: 'Returns the inner pixel dimensions of a browser surface.',
    params: [{ name: 'windowId', type: 'number' }],
    returnType: '[number, number]'
  },
  {
    name: 'pumpEvents',
    doc: 'Drains queued browser platform events.',
    params: [],
    returnType: 'PlatformEvent[]'
  },
  {
    name: 'gamepadGetConnected',
    doc: 'Returns connected browser gamepads.',
    params: [],
    returnType: 'GamepadInfo[]'
  },
  {
    name: 'gamepadSetRumble',
    doc: 'Requests gamepad rumble when supported by the browser.',
    params: [
      { name: 'gamepadId', type: 'number' },
      { name: 'strongMagnitude', type: 'number' },
      { name: 'weakMagnitude', type: 'number' },
      { name: 'durationMs', type: 'number' }
    ],
    returnType: 'void'
  },
  {
    name: 'audioLoadSound',
    doc: 'Loads raw audio bytes under a host-controlled sound ID.',
    params: [
      { name: 'soundId', type: 'number' },
      { name: 'bytes', type: 'Uint8Array' }
    ],
    returnType: 'void'
  },
  {
    name: 'audioPlaySound',
    doc: 'Starts sound playback and returns the logical voice ID.',
    params: [
      { name: 'soundId', type: 'number' },
      { name: 'volume', type: 'number' },
      { name: 'panning', type: 'number' },
      { name: 'speed', type: 'number' },
      { name: 'looping', type: 'boolean' }
    ],
    returnType: 'number'
  },
  {
    name: 'audioPlaySoundSpatial',
    doc: 'Starts spatial sound playback from JSON-encoded spatial parameters.',
    params: [
      { name: 'soundId', type: 'number' },
      { name: 'emitterJson', type: 'string' },
      { name: 'listenerJson', type: 'string' },
      { name: 'configJson', type: 'string' }
    ],
    returnType: 'number'
  },
  {
    name: 'audioUpdateSoundSpatial',
    doc: 'Updates spatial sound playback from JSON-encoded spatial parameters.',
    params: [
      { name: 'voiceId', type: 'number' },
      { name: 'emitterJson', type: 'string' },
      { name: 'listenerJson', type: 'string' },
      { name: 'configJson', type: 'string' }
    ],
    returnType: 'void'
  },
  {
    name: 'audioPauseSound',
    doc: 'Pauses a playing sound voice.',
    params: [{ name: 'voiceId', type: 'number' }],
    returnType: 'void'
  },
  {
    name: 'audioResumeSound',
    doc: 'Resumes a paused sound voice.',
    params: [{ name: 'voiceId', type: 'number' }],
    returnType: 'void'
  },
  {
    name: 'audioStopSound',
    doc: 'Stops a playing or paused sound voice.',
    params: [{ name: 'voiceId', type: 'number' }],
    returnType: 'void'
  },
  {
    name: 'audioSetVolume',
    doc: 'Updates the volume of an active sound voice.',
    params: [
      { name: 'voiceId', type: 'number' },
      { name: 'volume', type: 'number' }
    ],
    returnType: 'void'
  },
  {
    name: 'audioSetPanning',
    doc: 'Updates the stereo panning of an active sound voice.',
    params: [
      { name: 'voiceId', type: 'number' },
      { name: 'panning', type: 'number' }
    ],
    returnType: 'void'
  },
  {
    name: 'audioUnloadSound',
    doc: 'Unloads a registered sound resource.',
    params: [{ name: 'soundId', type: 'number' }],
    returnType: 'void'
  }
];
