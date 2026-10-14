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
          move: {
            type: {
              inline: {
                windowId: { type: 'number' },
                pointerId: { type: 'number' },
                pointerType: { type: { ref: 'PointerType' } },
                position: { type: { tuple: ['number', 'number'] } },
                delta: { type: { tuple: ['number', 'number'] } },
                pressure: { type: 'number' }
              }
            }
          }
        }
      },
      {
        inline: {
          button: {
            type: {
              inline: {
                windowId: { type: 'number' },
                pointerId: { type: 'number' },
                pointerType: { type: { ref: 'PointerType' } },
                position: { type: { tuple: ['number', 'number'] } },
                button: { type: { ref: 'PointerButton' } },
                state: { type: { ref: 'PointerButtonState' } },
                pressure: { type: 'number' }
              }
            }
          }
        }
      },
      {
        inline: {
          enter: {
            type: {
              inline: {
                windowId: { type: 'number' },
                pointerId: { type: 'number' },
                pointerType: { type: { ref: 'PointerType' } },
                position: { type: { tuple: ['number', 'number'] } }
              }
            }
          }
        }
      },
      {
        inline: {
          leave: {
            type: {
              inline: {
                windowId: { type: 'number' },
                pointerId: { type: 'number' },
                pointerType: { type: { ref: 'PointerType' } },
                position: { type: { tuple: ['number', 'number'] } }
              }
            }
          }
        }
      },
      {
        inline: {
          cancel: {
            type: {
              inline: {
                windowId: { type: 'number' },
                pointerId: { type: 'number' },
                pointerType: { type: { ref: 'PointerType' } },
                position: { type: { tuple: ['number', 'number'] } }
              }
            }
          }
        }
      },
      {
        inline: {
          scroll: {
            type: {
              inline: {
                windowId: { type: 'number' },
                pointerId: { type: 'number' },
                pointerType: { type: { ref: 'PointerType' } },
                position: { type: { tuple: ['number', 'number'] } },
                delta: { type: { ref: 'ScrollDelta' } }
              }
            }
          }
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
          input: {
            type: {
              inline: {
                windowId: { type: 'number' },
                physicalKey: { type: 'string' },
                logicalKey: { type: { ref: 'LogicalKey' } },
                text: { type: 'string', optional: true },
                state: { type: { ref: 'ElementState' } },
                modifiers: { type: { ref: 'ModifiersState' } },
                repeat: { type: 'boolean' }
              }
            }
          }
        }
      },
      {
        inline: {
          modifiersChanged: {
            type: {
              inline: {
                windowId: { type: 'number' },
                modifiers: { type: { ref: 'ModifiersState' } }
              }
            }
          }
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
          resized: {
            type: {
              inline: {
                windowId: { type: 'number' },
                width: { type: 'number' },
                height: { type: 'number' },
                scaleFactor: { type: 'number' }
              }
            }
          }
        }
      },
      {
        inline: {
          moved: {
            type: {
              inline: {
                windowId: { type: 'number' },
                x: { type: 'number' },
                y: { type: 'number' }
              }
            }
          }
        }
      },
      {
        inline: {
          closeRequested: {
            type: {
              inline: {
                windowId: { type: 'number' }
              }
            }
          }
        }
      },
      {
        inline: {
          focusChanged: {
            type: {
              inline: {
                windowId: { type: 'number' },
                focused: { type: 'boolean' }
              }
            }
          }
        }
      },
      {
        inline: {
          occluded: {
            type: {
              inline: {
                windowId: { type: 'number' },
                occluded: { type: 'boolean' }
              }
            }
          }
        }
      },
      {
        inline: {
          scaleFactorChanged: {
            type: {
              inline: {
                windowId: { type: 'number' },
                scaleFactor: { type: 'number' }
              }
            }
          }
        }
      },
      {
        inline: {
          redrawRequested: {
            type: {
              inline: {
                windowId: { type: 'number' }
              }
            }
          }
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
          connected: {
            type: {
              inline: {
                gamepadId: { type: 'number' },
                name: { type: 'string' }
              }
            }
          }
        }
      },
      {
        inline: {
          disconnected: {
            type: {
              inline: {
                gamepadId: { type: 'number' }
              }
            }
          }
        }
      },
      {
        inline: {
          button: {
            type: {
              inline: {
                gamepadId: { type: 'number' },
                button: { type: { ref: 'GamepadButton' } },
                state: { type: { ref: 'GamepadButtonState' } }
              }
            }
          }
        }
      },
      {
        inline: {
          axis: {
            type: {
              inline: {
                gamepadId: { type: 'number' },
                axis: { type: { ref: 'GamepadAxis' } },
                value: { type: 'number' }
              }
            }
          }
        }
      }
    ]
  },
  {
    kind: 'union',
    name: 'PlatformEvent',
    doc: 'Root enum of all events dispatched from the platform layer.',
    variants: [
      { inline: { window: { type: { ref: 'WindowEvent' } } } },
      { inline: { pointer: { type: { ref: 'PointerEvent' } } } },
      { inline: { keyboard: { type: { ref: 'KeyboardEvent' } } } },
      { inline: { gamepad: { type: { ref: 'GamepadEvent' } } } }
    ]
  }
];
