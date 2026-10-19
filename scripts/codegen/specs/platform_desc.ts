import type { DescSpec } from './types';

export const platformDescriptors: DescSpec[] = [
  {
    kind: 'object',
    name: 'PlatformCapabilities',
    doc: 'Platform environment capabilities as structured data.',
    fields: {
      supportsMultipleWindows: { type: 'boolean' },
      supportsWindowPositioning: { type: 'boolean' },
      supportsCursorGrab: { type: 'boolean' },
      supportsGamepad: { type: 'boolean' },
      supportsAudio: { type: 'boolean' },
      isHeadless: { type: 'boolean' }
    }
  },
  {
    kind: 'enum',
    name: 'WindowState',
    doc: 'Initial or requested window presentation state.',
    values: ['windowed', 'minimized', 'maximized', 'fullscreen', 'borderlessFullscreen']
  },
  {
    kind: 'object',
    name: 'WindowConfig',
    doc: 'Configuration options used to create a new surface or window.',
    fields: {
      id: { type: 'number' },
      title: { type: 'string' },
      size: { type: { tuple: ['number', 'number'] }, optional: true },
      position: { type: { tuple: ['number', 'number'] }, optional: true },
      resizable: { type: 'boolean', optional: true },
      decorations: { type: 'boolean', optional: true },
      transparent: { type: 'boolean', optional: true },
      initialState: { type: { ref: 'WindowState' }, optional: true },
      canvasId: { type: 'string', optional: true }
    }
  },
  {
    kind: 'enum',
    name: 'PointerType',
    doc: 'Physical kind of pointing device.',
    values: ['mouse', 'touch', 'pen']
  },
  {
    kind: 'union',
    name: 'PointerButton',
    doc: 'Button identifier for pointer events.',
    variants: [
      { literal: 'primary' },
      { literal: 'secondary' },
      { literal: 'auxiliary' },
      { literal: 'back' },
      { literal: 'forward' },
      { inline: { other: { type: 'number' } } }
    ]
  },
  {
    kind: 'enum',
    name: 'PointerButtonState',
    doc: 'State of a pointer button action.',
    values: ['pressed', 'released']
  },
  {
    kind: 'union',
    name: 'ScrollDelta',
    doc: 'Pointer scroll offset unit and magnitude.',
    variants: [
      { inline: { lines: { type: { tuple: ['number', 'number'] } } } },
      { inline: { pixels: { type: { tuple: ['number', 'number'] } } } }
    ]
  },
  {
    kind: 'union',
    name: 'PointerEvent',
    doc: 'Pointer movement, action, and lifecycle events.',
    variants: [
      {
        inline: {
          kind: { type: { literal: 'pointer' } },
          type: { type: { literal: 'move' } },
          windowId: { type: 'number' },
          pointerId: { type: 'number' },
          pointerType: { type: { ref: 'PointerType' } },
          position: { type: { tuple: ['number', 'number'] } },
          delta: { type: { tuple: ['number', 'number'] } },
          pressure: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'pointer' } },
          type: { type: { literal: 'button' } },
          windowId: { type: 'number' },
          pointerId: { type: 'number' },
          pointerType: { type: { ref: 'PointerType' } },
          position: { type: { tuple: ['number', 'number'] } },
          button: { type: { ref: 'PointerButton' } },
          state: { type: { ref: 'PointerButtonState' } },
          pressure: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'pointer' } },
          type: { type: { literal: 'enter' } },
          windowId: { type: 'number' },
          pointerId: { type: 'number' },
          pointerType: { type: { ref: 'PointerType' } },
          position: { type: { tuple: ['number', 'number'] } }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'pointer' } },
          type: { type: { literal: 'leave' } },
          windowId: { type: 'number' },
          pointerId: { type: 'number' },
          pointerType: { type: { ref: 'PointerType' } },
          position: { type: { tuple: ['number', 'number'] } }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'pointer' } },
          type: { type: { literal: 'cancel' } },
          windowId: { type: 'number' },
          pointerId: { type: 'number' },
          pointerType: { type: { ref: 'PointerType' } },
          position: { type: { tuple: ['number', 'number'] } }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'pointer' } },
          type: { type: { literal: 'scroll' } },
          windowId: { type: 'number' },
          pointerId: { type: 'number' },
          pointerType: { type: { ref: 'PointerType' } },
          position: { type: { tuple: ['number', 'number'] } },
          delta: { type: { ref: 'ScrollDelta' } }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'ModifiersState',
    doc: 'Active modifier keys on keyboard or input events.',
    fields: {
      shift: { type: 'boolean' },
      ctrl: { type: 'boolean' },
      alt: { type: 'boolean' },
      superKey: { type: 'boolean' }
    }
  },
  {
    kind: 'union',
    name: 'LogicalKey',
    doc: 'Logical key representation: string or named key object.',
    variants: ['string', { inline: { named: { type: 'string' } } }]
  },
  {
    kind: 'enum',
    name: 'ElementState',
    doc: 'State of a keyboard or button element.',
    values: ['pressed', 'released']
  },
  {
    kind: 'union',
    name: 'KeyboardEvent',
    doc: 'Keyboard input and modifier state change events.',
    variants: [
      {
        inline: {
          kind: { type: { literal: 'keyboard' } },
          type: { type: { literal: 'input' } },
          windowId: { type: 'number' },
          physicalKey: { type: 'string' },
          logicalKey: { type: { ref: 'LogicalKey' } },
          text: { type: 'string', optional: true },
          state: { type: { ref: 'ElementState' } },
          modifiers: { type: { ref: 'ModifiersState' } },
          repeat: { type: 'boolean' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'keyboard' } },
          type: { type: { literal: 'modifiersChanged' } },
          windowId: { type: 'number' },
          modifiers: { type: { ref: 'ModifiersState' } }
        }
      }
    ]
  },
  {
    kind: 'union',
    name: 'WindowEvent',
    doc: 'Window lifecycle, resize, move, and focus events.',
    variants: [
      {
        inline: {
          kind: { type: { literal: 'window' } },
          type: { type: { literal: 'resized' } },
          windowId: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          scaleFactor: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'window' } },
          type: { type: { literal: 'moved' } },
          windowId: { type: 'number' },
          x: { type: 'number' },
          y: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'window' } },
          type: { type: { literal: 'closeRequested' } },
          windowId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'window' } },
          type: { type: { literal: 'focusChanged' } },
          windowId: { type: 'number' },
          focused: { type: 'boolean' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'window' } },
          type: { type: { literal: 'occluded' } },
          windowId: { type: 'number' },
          occluded: { type: 'boolean' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'window' } },
          type: { type: { literal: 'scaleFactorChanged' } },
          windowId: { type: 'number' },
          scaleFactor: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'window' } },
          type: { type: { literal: 'redrawRequested' } },
          windowId: { type: 'number' }
        }
      }
    ]
  },
  {
    kind: 'union',
    name: 'GamepadButton',
    doc: 'Standard gamepad buttons or custom other button index.',
    variants: [
      { literal: 'south' },
      { literal: 'east' },
      { literal: 'west' },
      { literal: 'north' },
      { literal: 'leftBumper' },
      { literal: 'rightBumper' },
      { literal: 'leftTrigger' },
      { literal: 'rightTrigger' },
      { literal: 'select' },
      { literal: 'start' },
      { literal: 'guide' },
      { literal: 'leftThumbstick' },
      { literal: 'rightThumbstick' },
      { literal: 'dpadUp' },
      { literal: 'dpadDown' },
      { literal: 'dpadLeft' },
      { literal: 'dpadRight' },
      { inline: { other: { type: 'number' } } }
    ]
  },
  {
    kind: 'union',
    name: 'GamepadAxis',
    doc: 'Standard gamepad axes or custom other axis index.',
    variants: [
      { literal: 'leftStickX' },
      { literal: 'leftStickY' },
      { literal: 'rightStickX' },
      { literal: 'rightStickY' },
      { literal: 'leftTrigger' },
      { literal: 'rightTrigger' },
      { inline: { other: { type: 'number' } } }
    ]
  },
  {
    kind: 'enum',
    name: 'GamepadButtonState',
    doc: 'Gamepad button pressed or released state.',
    values: ['pressed', 'released']
  },
  {
    kind: 'object',
    name: 'GamepadInfo',
    doc: 'Metadata describing a connected gamepad device.',
    fields: {
      id: { type: 'number' },
      name: { type: 'string' },
      supportsRumble: { type: 'boolean' }
    }
  },
  {
    kind: 'union',
    name: 'GamepadEvent',
    doc: 'Gamepad lifecycle, button, and axis movement events.',
    variants: [
      {
        inline: {
          kind: { type: { literal: 'gamepad' } },
          type: { type: { literal: 'connected' } },
          gamepadId: { type: 'number' },
          name: { type: 'string' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'gamepad' } },
          type: { type: { literal: 'disconnected' } },
          gamepadId: { type: 'number' }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'gamepad' } },
          type: { type: { literal: 'button' } },
          gamepadId: { type: 'number' },
          button: { type: { ref: 'GamepadButton' } },
          state: { type: { ref: 'GamepadButtonState' } }
        }
      },
      {
        inline: {
          kind: { type: { literal: 'gamepad' } },
          type: { type: { literal: 'axis' } },
          gamepadId: { type: 'number' },
          axis: { type: { ref: 'GamepadAxis' } },
          value: { type: 'number' }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'SpatialTransform',
    doc: '3D/2D spatial transform for positional audio emitters and listener ears/microphones.',
    fields: {
      position: { type: { tuple: ['number', 'number', 'number'] } },
      rotation: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'SpatialAudioConfig',
    doc: 'Configuration parameters for spatial sound attenuation and stereo panning.',
    fields: {
      volume: { type: 'number', optional: true },
      minDistance: { type: 'number', optional: true },
      maxDistance: { type: 'number', optional: true },
      rolloff: { type: 'number', optional: true },
      speed: { type: 'number', optional: true },
      looping: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'object',
    name: 'SoundCreatePayload',
    doc: 'Payload for loading raw sound data bytes into memory under a host logical ID.',
    fields: {
      dataBase64: { type: 'string' }
    }
  },
  {
    kind: 'union',
    name: 'PlatformEvent',
    doc: 'Root enum of all events dispatched from the platform layer.',
    variants: [
      { ref: 'WindowEvent' },
      { ref: 'PointerEvent' },
      { ref: 'KeyboardEvent' },
      { ref: 'GamepadEvent' }
    ]
  }
];
