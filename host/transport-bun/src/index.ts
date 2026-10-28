import {
  GalfusLoopError,
  calculateFrameTiming,
  type FrameCallback,
  type GalfusEngine,
  type GalfusTransport,
  type LoopOptions,
  type TransportInitOptions,
  DEFAULT_MAX_DELTA_MS,
  DEFAULT_TARGET_FPS
} from '@galfus/transport-types';
import { GalfusBun } from './sdk/galfus';

export * from './sdk/galfus';

export class BunTransport implements GalfusTransport {
  private _engine: GalfusBun | null = null;
  private _isRunning = false;
  private _isInitialized = false;
  private _frameId = 0;
  private _lastTime = 0;
  private _loopTimer: ReturnType<typeof setTimeout> | null = null;
  private _callback: FrameCallback | null = null;
  private _options: LoopOptions = {};

  get engine(): GalfusEngine {
    if (!this._engine) {
      this._engine = new GalfusBun();
    }
    return this._engine;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  init(options: TransportInitOptions = {}): void {
    if (this._isInitialized) return;
    if (options.headless) {
      this.engine.platformInitHeadless();
    } else {
      this.engine.platformInit();
    }
    this._isInitialized = true;
  }

  dispose(): void {
    this.stopLoop();
    if (this._isInitialized && this._engine) {
      this._engine.platformShutdown();
    }
    this._engine = null;
    this._isInitialized = false;
  }

  startLoop(callback: FrameCallback, options: LoopOptions = {}): void {
    if (this._isRunning) {
      throw new GalfusLoopError('BunTransport loop is already running.');
    }
    this._callback = callback;
    this._options = options;
    this._isRunning = true;
    this._lastTime = performance.now();
    this._frameId = 0;

    const targetFps = options.targetFps ?? DEFAULT_TARGET_FPS;
    const intervalMs = 1000 / targetFps;
    const maxDeltaMs = options.maxDeltaMs ?? DEFAULT_MAX_DELTA_MS;

    const tick = () => {
      if (!this._isRunning) return;

      const now = performance.now();
      const timing = calculateFrameTiming(now, this._lastTime, ++this._frameId, maxDeltaMs);
      this._lastTime = now;

      try {
        this._callback?.(timing);
      } catch (err) {
        console.error('[BunTransport] Unhandled error during frame execution:', err);
      }

      // Schedule next frame with drift compensation
      if (this._isRunning) {
        const elapsed = performance.now() - now;
        const delay = Math.max(0, intervalMs - elapsed);
        this._loopTimer = setTimeout(tick, delay);
      }
    };

    tick();
  }

  stopLoop(): void {
    this._isRunning = false;
    if (this._loopTimer !== null) {
      clearTimeout(this._loopTimer);
      this._loopTimer = null;
    }
    this._callback = null;
  }

  step(timeMs?: number, deltaMs?: number): void {
    const now = timeMs ?? performance.now();
    const delta =
      deltaMs ?? (this._lastTime > 0 ? now - this._lastTime : 1000 / DEFAULT_TARGET_FPS);
    const timing = calculateFrameTiming(now, now - delta, ++this._frameId);
    this._lastTime = now;
    this._callback?.(timing);
  }
}

/** Creates a new GalfusTransport driver instance running via Bun FFI. */
export function createBunTransport(): GalfusTransport {
  return new BunTransport();
}

export default createBunTransport;
