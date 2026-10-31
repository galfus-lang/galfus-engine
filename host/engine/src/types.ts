/**
 * Strongly typed nominal (branded) logical IDs for Galfus Engine subsystems.
 */
import { assertValidLogicalId } from '@galfus/transport-types';

declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };

export type WindowId = Brand<number, 'WindowId'>;
export type TargetId = Brand<number, 'TargetId'>;
export type RealmId = Brand<number, 'RealmId'>;
export type InvocationId = Brand<number, 'InvocationId'>;
export type TextureId = Brand<number, 'TextureId'>;
export type GeometryId = Brand<number, 'GeometryId'>;
export type MaterialId = Brand<number, 'MaterialId'>;
export type SoundId = Brand<number, 'SoundId'>;
export type VoiceId = Brand<number, 'VoiceId'>;
export type TransitionId = Brand<number, 'TransitionId'>;
export type PathId = Brand<number, 'PathId'>;

/**
 * Sequential ID allocator that strictly enforces core-reserved ID boundaries.
 */
export class IdAllocator<T extends number = number> {
  private _nextId: number;
  private readonly _used = new Set<number>();

  constructor(initialId = 1) {
    this._nextId = initialId;
  }

  allocate(context = 'LogicalId'): T {
    while (this._used.has(this._nextId)) {
      this._nextId++;
    }
    const id = this._nextId++;
    assertValidLogicalId(id, context);
    this._used.add(id);
    return id as T;
  }

  markUsed(id: number, context = 'LogicalId'): void {
    assertValidLogicalId(id, context);
    this._used.add(id);
  }

  reset(startId = 1): void {
    this._nextId = startId;
    this._used.clear();
  }
}

/**
 * Event map describing all event types emitted across the Galfus Engine runtime.
 */
import type {
  AnimationEvent,
  FrameTiming,
  GamepadEvent,
  KeyboardEvent,
  PlatformEvent,
  PointerEvent,
  WindowEvent
} from '@galfus/transport-types';

export interface RuntimeEventMap {
  tick: FrameTiming;
  window: WindowEvent;
  pointer: PointerEvent;
  keyboard: KeyboardEvent;
  gamepad: GamepadEvent;
  animation: AnimationEvent;
  platform: PlatformEvent;
}

export type RuntimeEventType = keyof RuntimeEventMap;
export type RuntimeEventListener<T extends RuntimeEventType> = (event: RuntimeEventMap[T]) => void;
