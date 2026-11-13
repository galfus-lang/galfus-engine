import type {
  KeyboardEvent,
  PointerEvent,
  ScrollDelta,
  WindowEvent
} from '@galfus/transport-types';

export type InteractiveTarget =
  | { type: 'collider'; entityId: number; colliderId?: number }
  | { type: 'ui'; uiId: number; elementId: string | number };

export type InteractiveEventType =
  | 'hover'
  | 'leave'
  | 'move'
  | 'down'
  | 'up'
  | 'click'
  | 'cancel'
  | 'scroll'
  /** Movement delivered to the original pressed target, including outside its hit area. */
  | 'pressmove'
  /** Release delivered to the original pressed target, including outside its hit area. */
  | 'pressup';

export interface InteractiveEvent {
  readonly type: InteractiveEventType;
  readonly realmId: number;
  readonly target: InteractiveTarget;
  readonly pointer: PointerEvent;
  /** Normalized `[u, v]` coordinates (`0..1`) within the target surface bounds. */
  readonly uv?: [number, number];
  /** Sub-element numeric ID if targeted (e.g. UI Panel). */
  readonly elementId?: number;
  /** Wheel / scroll delta when `type === 'scroll'`. */
  readonly scrollDelta?: ScrollDelta;
}

export type InteractiveCallback = (event: InteractiveEvent) => void;

/** Lifecycle hooks allowing external systems (such as `@galfus/ui`) to attach to `InteractiveSystem`. */
export interface InteractiveObserver {
  onWindowEvent?(event: WindowEvent): void;
  onPointerEvent?(event: PointerEvent): void;
  onKeyboardEvent?(event: KeyboardEvent): void;
  onWindowClosed?(windowId: number): void;
  onAfterDispatch?(): void;
  onDispose?(): void;
}
