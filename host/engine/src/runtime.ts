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
import { Realm2D } from './realm2d/realm';
import { Realm3D } from './realm3d/realm';
import { ResourceManager } from './resources/manager';
import { AudioManager } from './audio/manager';
import { AnimationCoordinator } from './animation/coordinator';

export class MultiverseRuntime {
  readonly multiverse = new MultiverseCoordinator();
  readonly resources = new ResourceManager();
  readonly audio = new AudioManager();
  readonly animation = new AnimationCoordinator();
  private readonly _onTickCallbacks = new Set<FrameCallback>();

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
   * Initializes the transport backend and binds the engine to the Multiverse coordinator.
   */
  async init(options?: TransportInitOptions): Promise<void> {
    await this.transport.init(options);
    this.multiverse.bindEngine(this.transport.engine);
    this.resources.bindEngine(this.transport.engine);
    this.audio.bindEngine(this.transport.engine);
    this.animation.bindEngine(this.transport.engine);
  }

  /**
   * Creates, registers, and returns a new Realm2D in the multiverse.
   */
  createRealm2D(realmId: RealmId): Realm2D {
    const realm = new Realm2D(realmId);
    this.multiverse.registerRealm(realm);
    return realm;
  }

  /**
   * Creates, registers, and returns a new Realm3D in the multiverse.
   */
  createRealm3D(realmId: RealmId): Realm3D {
    const realm = new Realm3D(realmId);
    this.multiverse.registerRealm(realm);
    return realm;
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
   * @returns Unsubscribe function to unregister the callback.
   */
  onTick(callback: FrameCallback): () => void {
    this._onTickCallbacks.add(callback);
    return () => {
      this._onTickCallbacks.delete(callback);
    };
  }

  /**
   * Disposes the runtime, multiverse coordinator, all realms, and the transport.
   */
  dispose(): void {
    this.stop();
    this._onTickCallbacks.clear();
    this.animation.dispose();
    this.audio.dispose();
    this.resources.dispose();
    this.multiverse.dispose();
    this.transport.dispose();
  }

  // ---------------------------------------------------------------------------
  // Internal Frame Tick Pipeline
  // ---------------------------------------------------------------------------
  private tickFrame(timing: FrameTiming): void {
    // 1. Invoke user tick listeners
    for (const callback of this._onTickCallbacks) {
      callback(timing);
    }

    // 2. Step animations
    this.animation.step(timing.dt);

    // 3. Prepare ECS context
    const context: SystemContext = {
      time: this._elapsedSeconds,
      dt: timing.dt,
      frameId: timing.frameId,
      engine: this.transport.engine
    };

    // 4. Step all ECS worlds and sync with core
    this.multiverse.syncAllRealms(context);

    // 5. Resolve multiverse schedule and dispatch to GPU
    this.multiverse.resolve();
    this.multiverse.dispatch(timing.frameId, timing.dt);

    // 6. Tick transport I/O (e.g. window events, input polling)
    this.transport.tick?.(timing.dt);
  }
}

/**
 * Creates a new MultiverseRuntime instance bound to the provided transport.
 */
export function createRuntime(transport: GalfusTransport): MultiverseRuntime {
  return new MultiverseRuntime(transport);
}
