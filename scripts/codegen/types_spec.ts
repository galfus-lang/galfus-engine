/* Canonical shared domain types and payload specifications for Galfus Engine host bindings. */

export const SHARED_DOMAIN_TYPES = `
export interface PlatformCapabilities {
  supportsMultipleWindows: boolean;
  supportsWindowPositioning: boolean;
  supportsCursorGrab: boolean;
  supportsGamepad: boolean;
  supportsAudio: boolean;
  isHeadless: boolean;
}

export interface WindowConfig {
  id: number;
  title: string;
  size?: [number, number];
  position?: [number, number];
  resizable?: boolean;
  decorations?: boolean;
  transparent?: boolean;
  initialState?: "windowed" | "minimized" | "maximized" | "fullscreen" | "borderlessFullscreen";
  canvasId?: string;
}

export type PointerType = "mouse" | "touch" | "pen";
export type PointerButton = "primary" | "secondary" | "auxiliary" | "back" | "forward" | { other: number };
export type PointerButtonState = "pressed" | "released";

export type ScrollDelta =
  | { lines: [number, number] }
  | { pixels: [number, number] };

export type PointerEvent =
  | {
      move: {
        windowId: number;
        pointerId: number;
        pointerType: PointerType;
        position: [number, number];
        delta: [number, number];
        pressure: number;
      };
    }
  | {
      button: {
        windowId: number;
        pointerId: number;
        pointerType: PointerType;
        position: [number, number];
        button: PointerButton;
        state: PointerButtonState;
        pressure: number;
      };
    }
  | {
      enter: {
        windowId: number;
        pointerId: number;
        pointerType: PointerType;
        position: [number, number];
      };
    }
  | {
      leave: {
        windowId: number;
        pointerId: number;
        pointerType: PointerType;
        position: [number, number];
      };
    }
  | {
      cancel: {
        windowId: number;
        pointerId: number;
        pointerType: PointerType;
        position: [number, number];
      };
    }
  | {
      scroll: {
        windowId: number;
        pointerId: number;
        pointerType: PointerType;
        position: [number, number];
        delta: ScrollDelta;
      };
    };

export interface ModifiersState {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  superKey: boolean;
}

export type KeyboardEvent =
  | {
      input: {
        windowId: number;
        physicalKey: string;
        logicalKey: string | { named: string };
        text?: string;
        state: "pressed" | "released";
        modifiers: ModifiersState;
        repeat: boolean;
      };
    }
  | {
      modifiersChanged: {
        windowId: number;
        modifiers: ModifiersState;
      };
    };

export type WindowEvent =
  | { resized: { windowId: number; width: number; height: number; scaleFactor: number } }
  | { moved: { windowId: number; x: number; y: number } }
  | { closeRequested: { windowId: number } }
  | { focusChanged: { windowId: number; focused: boolean } }
  | { occluded: { windowId: number; occluded: boolean } }
  | { scaleFactorChanged: { windowId: number; scaleFactor: number } }
  | { redrawRequested: { windowId: number } };

export type GamepadButton =
  | "south"
  | "east"
  | "west"
  | "north"
  | "leftBumper"
  | "rightBumper"
  | "leftTrigger"
  | "rightTrigger"
  | "select"
  | "start"
  | "guide"
  | "leftThumbstick"
  | "rightThumbstick"
  | "dpadUp"
  | "dpadDown"
  | "dpadLeft"
  | "dpadRight"
  | { other: number };

export type GamepadAxis =
  | "leftStickX"
  | "leftStickY"
  | "rightStickX"
  | "rightStickY"
  | "leftTrigger"
  | "rightTrigger"
  | { other: number };

export type GamepadButtonState = "pressed" | "released";

export interface GamepadInfo {
  id: number;
  name: string;
  supportsRumble: boolean;
}

export type GamepadEvent =
  | { connected: { gamepadId: number; name: string } }
  | { disconnected: { gamepadId: number } }
  | { button: { gamepadId: number; button: GamepadButton; state: GamepadButtonState } }
  | { axis: { gamepadId: number; axis: GamepadAxis; value: number } };

export type PlatformEvent =
  | { window: WindowEvent }
  | { pointer: PointerEvent }
  | { keyboard: KeyboardEvent }
  | { gamepad: GamepadEvent };

export type TargetKind =
  | { type: "window"; windowId: number }
  | { type: "texture"; width: number; height: number; format?: string };

export interface TargetDesc {
  kind: TargetKind;
  size?: [number, number];
}

export type ViewportRect =
  | { unit: "pixels"; x: number; y: number; width: number; height: number }
  | { unit: "normalized"; x: number; y: number; width: number; height: number };

export type InvocationFilter =
  | "sepia"
  | { custom: { shaderId: number } };

export interface InvocationDesc {
  realmId: number;
  targetId: number;
  cameraSlot?: number;
  viewport?: ViewportRect;
  filters?: InvocationFilter[];
  zIndex?: number;
  enabled?: boolean;
  clearColor?: [number, number, number, number];
}

export interface TargetTextureBinding {
  sourceTargetId: number;
  realmId: number;
  slot: string;
}

export interface ResolvedInvocationStep {
  invocationId: number;
  realmId: number;
  cameraSlot?: number;
  resolvedViewport: [number, number, number, number];
  zIndex: number;
  clearColor?: [number, number, number, number];
  filters: InvocationFilter[];
}

export interface TargetExecutionBlock {
  targetId: number;
  invocations: ResolvedInvocationStep[];
}

export interface MultiverseSchedule {
  targetBlocks: TargetExecutionBlock[];
}
`;
