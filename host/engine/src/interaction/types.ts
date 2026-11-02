import type { PointerEvent } from '@galfus/transport-types';

export type InteractiveTarget =
  | { type: 'collider'; entityId: number; colliderId?: number }
  | { type: 'svg'; svgId: number; elementId: string };

export type InteractiveEventType = 'hover' | 'leave' | 'move' | 'down' | 'up' | 'click' | 'cancel';

export interface InteractiveEvent {
  readonly type: InteractiveEventType;
  readonly realmId: number;
  readonly target: InteractiveTarget;
  readonly pointer: PointerEvent;
}

export type InteractiveCallback = (event: InteractiveEvent) => void;
