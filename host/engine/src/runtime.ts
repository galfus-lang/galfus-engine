/**
 * MultiverseRuntime orchestrates platform transports, frame loops, and multiverse realms.
 */

import {
  type AnimationTarget,
  type FrameTiming,
  GalfusLoopError,
  type GalfusTransport,
  type LoopOptions
} from '@galfus/transport-types';
import { AnimationCoordinator } from './animation/coordinator';
import { AudioManager } from './audio/manager';
import type { SystemContext } from './ecs/system';
import { FocusManager } from './interaction/focus';
import { InteractiveSystem } from './interaction/system';
import type { InteractiveTarget } from './interaction/types';
import { MultiverseCoordinator } from './multiverse/coordinator';
import type { RealmId } from './multiverse/realm';
import { PlatformCoordinator } from './platform/index';
import { Realm2D } from './realm2d/realm';
import { Realm3D } from './realm3d/realm';
import { storeCameraLookAt } from './realm3d/resource-ids';
import { ResourceManager } from './resources/manager';
import { TextEncoding } from './text/encoding';
import { TextInput, type TextInputOptions } from './text/input';
import type { Focusable } from './interaction/focus';
import {
  type FixedTickTiming,
  IdAllocator,
  type RuntimeEventListener,
  type RuntimeEventType,
  type WindowId
} from './types';

/**
 * Lifecycle states of the MultiverseRuntime orchestrator.
 */
export type RuntimeState =
  'ready' | 'running' | 'paused' | 'resetting' | 'disposing' | 'disposed' | 'failed';

export interface RuntimeOptions {
  /** Default character encoding for explicit text/byte conversions. */
  charset?: string;
  /** Fixed physics and simulation timestep in seconds. Defaults to 1 / 60. */
  fixedDt?: number;
  /** Maximum fixed timestep sub-steps permitted in a single frame. Defaults to 8. */
  maxFixedSubSteps?: number;
}

export class MultiverseRuntime {
  readonly platform = new PlatformCoordinator();
  readonly multiverse = new MultiverseCoordinator();
  readonly resources = new ResourceManager();
  readonly audio = new AudioManager();
  readonly animation = new AnimationCoordinator();
  readonly textEncoding: TextEncoding;
  private readonly _interactive = new InteractiveSystem(this.multiverse);
  private readonly _textInputs = new Map<Focusable, TextInput>();
  private readonly _focus = new FocusManager(
    this._interactive,
    () => this.multiverse.presentationGraph.getWindowIds(),
    (windowId, enabled) => this.platform.window.setTabCapture(windowId as WindowId, enabled),
    (windowId) => this.platform.window.requestInputFocus(windowId as WindowId)
  );
  readonly svg = {
    getRect: (realmId: number, svgId: number, elementId: string) => {
      const realm = this.multiverse.getRealm(realmId);
      return realm instanceof Realm2D ? realm.getSvgElementRect(svgId, elementId) : undefined;
    },
    getTextLayout: (realmId: number, svgId: number, elementId: string) => {
      const realm = this.multiverse.getRealm(realmId);
      return realm instanceof Realm2D ? realm.getSvgTextLayout(svgId, elementId) : undefined;
    }
  };
  private readonly _realmIdAllocator = new IdAllocator<RealmId>(1);
  private readonly _eventListeners = new Map<RuntimeEventType, Set<(event: any) => void>>();
  private _animationUnsubscribe: (() => void) | null = null;
  private readonly _refreshAnimatedTarget = (target: AnimationTarget): void => {
    if (!('realmId' in target)) return;
    const realm = this.multiverse.getRealm(target.realmId);
    if (realm instanceof Realm2D && 'svgId' in target) {
      realm.invalidateSvgCache(target.svgId);
    } else if (
      realm instanceof Realm3D &&
      target.kind === 'camera3DLookAt' &&
      this._interactive.usesRealm(realm.realmId)
    ) {
      const lookAt = realm.getCameraLookAt(target.cameraId);
      if (lookAt)
        storeCameraLookAt(
          realm.world,
          target.cameraId,
          lookAt.enabled && lookAt.target ? { target: lookAt.target, up: lookAt.up } : undefined
        );
    }
  };
  private _isSubsystemsBound = false;

  private _frameId = 0;
  private _elapsedSeconds = 0;
  private _state: RuntimeState;
  readonly fixedDt: number;
  readonly maxFixedSubSteps: number;
  private _fixedAccumulator = 0;
  private _fixedSteps = 0;

  readonly #transport: GalfusTransport;

  constructor(transport: GalfusTransport, options: RuntimeOptions = {}) {
    this.#transport = transport;
    this.textEncoding = new TextEncoding(options.charset);
    this.fixedDt = options.fixedDt !== undefined && options.fixedDt > 0 ? options.fixedDt : 1 / 60;
    this.maxFixedSubSteps = options.maxFixedSubSteps ?? 8;
    this.animation.setNativeTargetObserver(this._refreshAnimatedTarget);
    this.platform.window.onLifecycle((windowId, opened) => {
      if (opened) this.multiverse.windowOpened(windowId);
      else {
        this.multiverse.windowClosed(windowId);
        this._focus.windowClosed(windowId);
        this._interactive.windowClosed(windowId);
      }
    });
    if (transport.isDisposed) {
      this._state = 'disposed';
    } else {
      this._state = 'ready';
      if (transport.isInitialized) {
        this.bindSubsystems();
      }
    }
  }

  /**
   * Current lifecycle state of the runtime.
   */
  get state(): RuntimeState {
    return this._state;
  }

  /**
   * Whether the active frame loop is currently running.
   */
  get isRunning(): boolean {
    return this._state === 'running';
  }

  /**
   * Total elapsed runtime simulation time in seconds.
   */
  get elapsedSeconds(): number {
    return this._elapsedSeconds;
  }

  /**
   * Normalized interpolation factor [0, 1) of the remaining fixed-timestep accumulator,
   * useful during `tick` for visually interpolating between fixed simulation steps.
   */
  get fixedAlpha(): number {
    return Math.min(1, Math.max(0, this._fixedAccumulator / this.fixedDt));
  }

  /**
   * Current frame counter.
   */
  get frameId(): number {
    return this._frameId;
  }

  /**
   * Whether the runtime has been terminated and disposed.
   */
  get isDisposed(): boolean {
    return this._state === 'disposed';
  }

  private bindSubsystems(): void {
    if (this._isSubsystemsBound) return;
    const engine = this.#transport.engine;
    this.platform.bindEngine(engine);
    this.multiverse.bindEngine(engine);
    this.resources.bindEngine(engine);
    this.audio.bindEngine(engine);
    this.animation.bindEngine(engine);

    if (!this._animationUnsubscribe) {
      this._animationUnsubscribe = this.animation.on('animation', (event) => {
        const animListeners = this._eventListeners.get('animation');
        if (animListeners && animListeners.size > 0) {
          for (const listener of animListeners) {
            listener(event);
          }
        }
      });
    }
    this._isSubsystemsBound = true;
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
    realm.resources = this.resources;
    this.multiverse.registerRealm(realm);
    return realm;
  }

  /** Registers a pointer-interactive target in a realm. */
  interactive(realmId: number, target: InteractiveTarget) {
    return this._interactive.interactive(realmId, target);
  }

  /** Registers a pointer target for per-window focus and keyboard navigation. */
  focusable(realmId: number, target: InteractiveTarget, options: { tabIndex?: number } = {}) {
    if (options.tabIndex !== undefined && !Number.isSafeInteger(options.tabIndex))
      throw new RangeError('tabIndex must be a safe integer.');
    return this._focus.register(this._interactive.interactive(realmId, target), options.tabIndex);
  }

  /** Returns the target focused in a window, if any. */
  getFocused(windowId: number) {
    return this._focus.getFocused(windowId);
  }

  /** Binds editable text to an SVG element and its interactive hit area. */
  textInput(realmId: number, options: TextInputOptions): TextInput {
    if (!options.elementId || options.hitAreaId === '')
      throw new Error('SVG element IDs must not be empty.');
    const realm = this.multiverse.getRealm(realmId);
    if (!(realm instanceof Realm2D) || realm.isDisposed)
      throw new Error(`Text input realm ${realmId} is not a registered Realm2D.`);
    for (const input of this._textInputs.values()) {
      const target = input.focusable.listener.target;
      if (
        input.focusable.realmId === realmId &&
        input.svgId === options.svgId &&
        input.elementId === options.elementId
      )
        throw new Error('An input is already registered for this SVG text element.');
      if (
        input.focusable.realmId === realmId &&
        target.type === 'svg' &&
        target.svgId === options.svgId &&
        target.elementId === (options.hitAreaId ?? options.elementId)
      )
        throw new Error('An input is already registered for this SVG hit area.');
    }
    const focusable = this.focusable(
      realmId,
      {
        type: 'svg',
        svgId: options.svgId,
        elementId: options.hitAreaId ?? options.elementId
      },
      { tabIndex: options.tabIndex }
    );
    try {
      const input = new TextInput(
        realm,
        { ...options },
        focusable,
        (id, enabled) => this.platform.window.setImeAllowed(id as WindowId, enabled),
        () => this._textInputs.delete(focusable)
      );
      this._textInputs.set(focusable, input);
      return input;
    } catch (error) {
      focusable.dispose();
      throw error;
    }
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
    if (this._state === 'disposed' || this._state === 'failed' || this._state === 'disposing') {
      throw new GalfusLoopError(`Cannot start runtime in state '${this._state}'.`);
    }
    if (this._state === 'running') return;
    if (this._state !== 'ready' && this._state !== 'paused') {
      throw new GalfusLoopError(
        `Cannot start runtime before ready (current state: '${this._state}').`
      );
    }

    const previousState = this._state;
    this._state = 'running';
    try {
      this.#transport.startLoop((timing) => {
        this.tickFrame(timing);
      }, options);
    } catch (error) {
      this._state = previousState;
      throw error;
    }
  }

  /**
   * Halts the active frame loop.
   */
  stop(): void {
    if (this._state !== 'running' && this._state !== 'paused') return;
    if (this._state === 'running') this.#transport.stopLoop();
    this._state = 'ready';
  }

  /** Pauses frame execution; call start() to resume. */
  pause(): void {
    if (this._state !== 'running') return;
    this.#transport.stopLoop();
    this._state = 'paused';
  }

  /**
   * Resets the entire multiverse runtime, realms, invocations, windows, audio, and caches,
   * keeping the transport and engine alive and ready for a fresh scene.
   */
  reset(): void {
    if (this._state === 'disposed') {
      throw new Error('Cannot reset a disposed MultiverseRuntime.');
    }

    try {
      this.stop();
      this.clearListeners();
      for (const input of this._textInputs.values()) input.dispose();
      this._focus.dispose();
      this._interactive.dispose();
      this._elapsedSeconds = 0;
      this._frameId = 0;
      this._fixedAccumulator = 0;
      this._fixedSteps = 0;

      // 1. Multiverse: Invocations, Realms, and Targets
      this.multiverse.reset();

      // 2. Audio: Stop and unload all sounds
      this.audio.dispose();
      if (this.#transport.engine) {
        this.audio.bindEngine(this.#transport.engine);
      }

      // 3. Animation: Clear transitions and paths
      this.animation.dispose();
      if (this.#transport.engine) {
        this.animation.bindEngine(this.#transport.engine);
      }

      // 4. Windows: Close all open windows
      this.platform.dispose();
      if (this.#transport.engine) {
        this.platform.bindEngine(this.#transport.engine);
      }

      // 5. Global Texture Resources
      this.resources.dispose();
      if (this.#transport.engine) {
        this.resources.bindEngine(this.#transport.engine);
      }

      // Re-bind engine to multiverse
      if (this.#transport.engine) {
        this.multiverse.bindEngine(this.#transport.engine);
      }

      this._state = 'ready';
    } catch (err) {
      this._state = 'failed';
      throw err;
    }
  }

  /**
   * Disposes the runtime, multiverse coordinator, all realms, and the transport.
   */
  dispose(): void {
    if (this._state === 'disposed') return;
    try {
      this.stop();
      this._state = 'disposing';
      this.clearListeners();
      for (const input of this._textInputs.values()) input.dispose();
      this._focus.dispose();
      this._interactive.dispose();
      if (this._animationUnsubscribe) {
        this._animationUnsubscribe();
        this._animationUnsubscribe = null;
      }
      this.animation.dispose();
      this.audio.dispose();
      this.resources.dispose();
      this.multiverse.dispose();
      this.platform.dispose();
      this.#transport.dispose();
      this._state = 'disposed';
    } catch (err) {
      this._state = 'failed';
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Frame Tick Pipeline
  // ---------------------------------------------------------------------------
  private tickFrame(timing: FrameTiming): void {
    // 1. Advance frameId and elapsed simulation time exactly once
    this._frameId = timing.frameId;
    this._elapsedSeconds += timing.dt;

    // 2. Pump platform events internally (separated into structural window pass and urgent input pass)
    const platformEvents = this.platform.pumpEvents();
    if (platformEvents.length > 0) {
      const platformListeners = this._eventListeners.get('platform');
      const dispatchCommon = (event: PlatformEvent) => {
        const kindListeners = this._eventListeners.get(event.kind as RuntimeEventType);
        if (kindListeners && kindListeners.size > 0) {
          for (const listener of kindListeners) {
            listener(event);
          }
        }
        this.platform.dispatch(event);
        if (platformListeners && platformListeners.size > 0) {
          for (const listener of platformListeners) {
            listener(event);
          }
        }
      };

      // Pass 2a: Structural window events first
      for (const event of platformEvents) {
        if (event.kind !== 'window') continue;
        if (event.type === 'focusChanged') {
          this._focus.windowFocusChanged(event.windowId, event.focused);
        }
        if (event.type === 'resized') {
          this.platform.window.updateSize(event.windowId as any, event.width, event.height);
        }
        dispatchCommon(event);
      }

      // Pass 2b: Urgent input events (pointer, keyboard, gamepad)
      for (const event of platformEvents) {
        if (event.kind === 'window') continue;
        if (event.kind === 'pointer') {
          this._interactive.handle(event);
          this._focus.handlePointer(event);
        } else if (event.kind === 'keyboard') {
          this._focus.handleKeyboard(event);
          const focused = this._focus.getFocused(event.windowId);
          if (focused) this._textInputs.get(focused)?.handleKeyboard(event);
        }
        dispatchCommon(event);
      }
    }

    // 3. Step fixed tick listeners ('fixedTick') with deterministic accumulator & float tolerance
    const fixedTickListeners = this._eventListeners.get('fixedTick');
    this._fixedAccumulator += timing.dt;
    let subStep = 0;
    const epsilon = 1e-9;
    while (this._fixedAccumulator + epsilon >= this.fixedDt && subStep < this.maxFixedSubSteps) {
      this._fixedSteps++;
      if (fixedTickListeners && fixedTickListeners.size > 0) {
        const payload: FixedTickTiming = {
          fixedDt: this.fixedDt,
          time: this._fixedSteps * this.fixedDt,
          subStep,
          frameId: timing.frameId
        };
        for (const listener of fixedTickListeners) {
          listener(payload);
        }
      }
      this._fixedAccumulator = Math.max(0, this._fixedAccumulator - this.fixedDt);
      subStep++;
    }
    if (this._fixedAccumulator + epsilon >= this.fixedDt) {
      this._fixedAccumulator = Math.max(0, this._fixedAccumulator % this.fixedDt);
    }

    // 4. Dispatch variable frame tick listeners ('tick') after fixed simulation steps
    const tickListeners = this._eventListeners.get('tick');
    if (tickListeners && tickListeners.size > 0) {
      for (const listener of tickListeners) {
        listener(timing);
      }
    }

    // 5. Step animations (this also pumps animation events and triggers registered listeners)
    this.animation.step(timing.dt);

    // 6. Prepare ECS context
    const context: SystemContext = {
      time: this._elapsedSeconds,
      dt: timing.dt,
      frameId: timing.frameId,
      engine: this.#transport.engine
    };

    // 7. Step pre-render stages: input -> update -> preRender (anchors, hierarchies)
    this.multiverse.stepRealmsPreRender(context);

    // 8. Synchronize dirty entity state to native core
    this.multiverse.syncRealms(context);

    // 9. Resolve multiverse schedule and dispatch to GPU
    this.multiverse.dispatch(timing.frameId, timing.dt);
    this._interactive.afterDispatch();
    this._focus.afterDispatch();
    for (const [focusable, input] of this._textInputs) if (focusable.isDisposed) input.dispose();

    // 10. Step post-render stage: postRender (metrics, cleanups) AFTER dispatch
    this.multiverse.stepRealmsPostRender(context);
  }
}

/**
 * Creates a new MultiverseRuntime instance bound to the provided transport.
 */
export function createRuntime(
  transport: GalfusTransport,
  options?: RuntimeOptions
): MultiverseRuntime {
  return new MultiverseRuntime(transport, options);
}
