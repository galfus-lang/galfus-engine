/**
 * MultiverseRuntime orchestrates platform transports, frame loops, and multiverse realms.
 */
import type {
  FrameCallback,
  FrameTiming,
  GalfusEngine,
  GalfusTransport,
  LoopOptions,
  TransportInitOptions
} from '@galfus/transport-types';
import type { SystemContext } from './ecs/system';
import { MultiverseCoordinator } from './multiverse/coordinator';
import type { RealmId } from './multiverse/realm';
import { PlatformCoordinator } from './platform/index';
import { Realm2D } from './realm2d/realm';
import { Realm3D } from './realm3d/realm';
import { ResourceManager } from './resources/manager';
import { AudioManager } from './audio/manager';
import { AnimationCoordinator } from './animation/coordinator';
import {
  IdAllocator,
  type RuntimeEventListener,
  type RuntimeEventMap,
  type RuntimeEventType
} from './types';

export class MultiverseRuntime {
  readonly platform = new PlatformCoordinator();
  readonly multiverse = new MultiverseCoordinator();
  readonly resources = new ResourceManager();
  readonly audio = new AudioManager();
  readonly animation = new AnimationCoordinator();
  private readonly _realmIdAllocator = new IdAllocator<RealmId>(1);
  private readonly _eventListeners = new Map<RuntimeEventType, Set<(event: any) => void>>();
  private _animationUnsubscribe: (() => void) | null = null;

  private _frameId = 0;
  private _elapsedSeconds = 0;
  private _isRunning = false;

  constructor(readonly transport: GalfusTransport) {}

  /**
   * Underlying native or WASM GalfusEngine driver.
   */
  get engine(): GalfusEngine {
    return this.transport.engine;
  }

  /**
   * Whether the active frame loop is currently running.
   */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Total elapsed runtime simulation time in seconds.
   */
  get elapsedSeconds(): number {
    return this._elapsedSeconds;
  }

  /**
   * Current frame counter.
   */
  get frameId(): number {
    return this._frameId;
  }

  /**
   * Initializes the transport backend and binds the engine to all subsystem coordinators.
   */
  async init(options?: TransportInitOptions): Promise<void> {
    await this.transport.init(options);
    this.platform.bindEngine(this.transport.engine);
    this.multiverse.bindEngine(this.transport.engine);
    this.resources.bindEngine(this.transport.engine);
    this.audio.bindEngine(this.transport.engine);
    this.animation.bindEngine(this.transport.engine);

    // Forward animation events from coordinator to runtime listeners
    this._animationUnsubscribe = this.animation.on('animation', (event) => {
      const animListeners = this._eventListeners.get('animation');
      if (animListeners && animListeners.size > 0) {
        for (const listener of animListeners) {
          listener(event);
        }
      }
    });
  }

  /**
   * Creates, registers, and returns a new Realm2D in the multiverse (automatically allocating RealmId if omitted).
   */
  createRealm2D(realmId?: RealmId | number): Realm2D {
    const id = (realmId ?? this._realmIdAllocator.allocate('RealmId')) as RealmId;
    const realm = new Realm2D(id);
    this.multiverse.registerRealm(realm);
    return realm;
  }

  /**
   * Creates, registers, and returns a new Realm3D in the multiverse (automatically allocating RealmId if omitted).
   */
  createRealm3D(realmId?: RealmId | number): Realm3D {
    const id = (realmId ?? this._realmIdAllocator.allocate('RealmId')) as RealmId;
    const realm = new Realm3D(id);
    this.multiverse.registerRealm(realm);
    return realm;
  }

  /**
   * Registers a strongly typed event listener.
   *
   * @param type Event category: 'tick', 'window', 'pointer', 'keyboard', 'gamepad', 'animation', 'platform'.
   * @param listener Callback receiving the strongly typed event payload.
   * @returns Unsubscribe function to remove the listener.
   */
  on<T extends RuntimeEventType>(type: T, listener: RuntimeEventListener<T>): () => void {
    let set = this._eventListeners.get(type);
    if (!set) {
      set = new Set();
      this._eventListeners.set(type, set);
    }
    set.add(listener as (event: any) => void);
    return () => {
      set?.delete(listener as (event: any) => void);
    };
  }

  /**
   * Clears all registered event listeners, or listeners for a specific event type.
   */
  clearListeners(type?: RuntimeEventType): void {
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
   * Starts the transport frame loop.
   */
  start(options?: LoopOptions): void {
    if (this._isRunning) return;

    this.transport.startLoop((timing) => {
      this.tickFrame(timing);
    }, options);

    this._isRunning = true;
  }

  /**
   * Halts the active frame loop.
   */
  stop(): void {
    if (!this._isRunning) return;
    this.transport.stopLoop();
    this._isRunning = false;
  }

  /**
   * Manually steps a single frame (useful for deterministic simulations, testing, or headless runs).
   */
  tick(dt: number = 0.016): void {
    this._frameId++;
    this._elapsedSeconds += dt;

    const timing: FrameTiming = {
      timeMs: this._elapsedSeconds * 1000,
      deltaMs: dt * 1000,
      dt,
      frameId: this._frameId,
      fps: dt > 0 ? 1 / dt : 0
    };

    this.tickFrame(timing);
  }

  /**
   * Registers a frame update callback invoked on every tick.
   *
   * @deprecated Prefer `runtime.on('tick', callback)`.
   * @returns Unsubscribe function to unregister the callback.
   */
  onTick(callback: FrameCallback): () => void {
    return this.on('tick', callback);
  }

  /**
   * Disposes the runtime, multiverse coordinator, all realms, and the transport.
   */
  dispose(): void {
    this.stop();
    this.clearListeners();
    if (this._animationUnsubscribe) {
      this._animationUnsubscribe();
      this._animationUnsubscribe = null;
    }
    this.animation.dispose();
    this.audio.dispose();
    this.resources.dispose();
    this.multiverse.dispose();
    this.platform.dispose();
    this.transport.dispose();
  }

  // ---------------------------------------------------------------------------
  // Internal Frame Tick Pipeline
  // ---------------------------------------------------------------------------
  private tickFrame(timing: FrameTiming): void {
    // 1. Pump platform events internally
    const platformEvents = this.platform.pumpEvents();
    if (platformEvents.length > 0) {
      const platformListeners = this._eventListeners.get('platform');
      for (const event of platformEvents) {
        // Auto-synchronize window swapchain size in Multiverse on resize
        if (event.kind === 'window' && event.type === 'resized') {
          this.platform.window.updateSize(event.windowId as any, event.width, event.height);
        }

        // Dispatch to kind listeners ('window', 'pointer', 'keyboard', 'gamepad')
        const kindListeners = this._eventListeners.get(event.kind as RuntimeEventType);
        if (kindListeners && kindListeners.size > 0) {
          for (const listener of kindListeners) {
            listener(event);
          }
        }

        // Forward through platform coordinator
        this.platform.dispatch(event);

        // Dispatch to generic 'platform' listeners
        if (platformListeners && platformListeners.size > 0) {
          for (const listener of platformListeners) {
            listener(event);
          }
        }
      }
    }

    // 2. Dispatch frame tick listeners ('tick')
    const tickListeners = this._eventListeners.get('tick');
    if (tickListeners && tickListeners.size > 0) {
      for (const listener of tickListeners) {
        listener(timing);
      }
    }

    // 3. Step animations (this also pumps animation events and triggers registered listeners)
    this.animation.step(timing.dt);

    // 4. Prepare ECS context
    const context: SystemContext = {
      time: this._elapsedSeconds,
      dt: timing.dt,
      frameId: timing.frameId,
      engine: this.transport.engine
    };

    // 5. Step all ECS worlds and sync with core
    this.multiverse.syncAllRealms(context);

    // 6. Resolve multiverse schedule and dispatch to GPU
    this.multiverse.resolve();
    this.multiverse.dispatch(timing.frameId, timing.dt);

    // 7. Tick transport I/O
    this.transport.tick?.(timing.dt);
  }
}

/**
 * Creates a new MultiverseRuntime instance bound to the provided transport.
 */
export function createRuntime(transport: GalfusTransport): MultiverseRuntime {
  return new MultiverseRuntime(transport);
}
