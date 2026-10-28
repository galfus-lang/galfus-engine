import type {
  GamepadEvent,
  GalfusEngine,
  KeyboardEvent,
  PlatformCapabilities,
  PlatformEvent,
  PointerEvent,
  WindowEvent
} from '@galfus/transport-types';
import { WindowManager } from './window';

export interface PlatformEventMap {
  window: WindowEvent;
  pointer: PointerEvent;
  keyboard: KeyboardEvent;
  gamepad: GamepadEvent;
  platform: PlatformEvent;
}

export type PlatformEventType = keyof PlatformEventMap;

export class PlatformCoordinator {
  readonly window = new WindowManager();
  private readonly _eventListeners = new Map<string, Set<(ev: any) => void>>();
  private _engine: GalfusEngine | null = null;

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
    this.window.bindEngine(engine);
  }

  /**
   * Registers an event listener for a specific platform event category.
   *
   * @returns Unsubscribe function to remove the registered listener.
   */
  on<T extends PlatformEventType>(
    type: T,
    listener: (ev: PlatformEventMap[T]) => void
  ): () => void {
    let set = this._eventListeners.get(type);
    if (!set) {
      set = new Set();
      this._eventListeners.set(type, set);
    }
    set.add(listener as (ev: any) => void);
    return () => {
      set?.delete(listener as (ev: any) => void);
    };
  }

  /**
   * Clears all registered event listeners, or listeners for a specific type.
   */
  clearListeners(type?: PlatformEventType): void {
    if (type) {
      this._eventListeners.get(type)?.clear();
    } else {
      for (const set of this._eventListeners.values()) {
        set.clear();
      }
      this._eventListeners.clear();
    }
  }

  /**
   * Internal dispatcher forwarding a platform event to subscribed listeners.
   */
  dispatch(event: PlatformEvent): void {
    const kindListeners = this._eventListeners.get(event.kind);
    if (kindListeners && kindListeners.size > 0) {
      for (const listener of kindListeners) {
        listener(event);
      }
    }
    const allListeners = this._eventListeners.get('platform');
    if (allListeners && allListeners.size > 0) {
      for (const listener of allListeners) {
        listener(event);
      }
    }
  }

  /**
   * Pumps platform input events (window, keyboard, mouse, pointer).
   */
  pumpEvents(): PlatformEvent[] {
    if (this._engine && this._engine.platformPumpEvents) {
      return this._engine.platformPumpEvents();
    }
    return [];
  }

  /**
   * Queries hardware capabilities and platform feature support flags.
   */
  getCapabilities(): PlatformCapabilities | null {
    if (this._engine) {
      return this._engine.platformGetCapabilities();
    }
    return null;
  }

  /**
   * Disposes platform resources and closes active windows.
   */
  dispose(): void {
    this.clearListeners();
    this.window.dispose();
    this._engine = null;
  }
}
