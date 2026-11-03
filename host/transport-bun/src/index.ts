import {
  calculateFrameTiming,
  DEFAULT_TARGET_FPS,
  type FrameCallback,
  type GalfusEngine,
  GalfusLoopError,
  type GalfusTransport,
  GalfusTransportError,
  type LoopOptions,
  type TransportInitOptions
} from '@galfus/transport-types';
import { GalfusBun } from './sdk/galfus';

export * from './sdk/galfus';

export class BunTransport implements GalfusTransport {
  private _engine: GalfusBun | null = null;
  private _isRunning = false;
  private _isInitialized = false;
  private _isDisposed = false;
  private _frameId = 0;
  private _lastTime = 0;
  private _loopGeneration = 0;
  private _callback: FrameCallback | null = null;
  private _targetFps: number = DEFAULT_TARGET_FPS;

  get engine(): GalfusEngine {
    if (this._isDisposed) {
      throw new GalfusTransportError('Cannot access engine on a disposed BunTransport.');
    }
    if (!this._engine) {
      this._engine = new GalfusBun();
    }
    return this._engine;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  init(options: TransportInitOptions = {}): void {
    if (this._isDisposed) {
      throw new GalfusTransportError('Cannot initialize a disposed BunTransport.');
    }
    if (this._isInitialized) return;
    if (options.targetFps !== undefined && options.targetFps > 0) {
      this._targetFps = options.targetFps;
    }
    try {
      if (options.headless) {
        this.engine.platformInitHeadless();
      } else {
        this.engine.platformInit();
      }
    } catch (err: any) {
      if (err?.message?.includes('already initialized')) {
        // Platform is already initialized globally in the process
      } else {
        throw err;
      }
    }
    this._isInitialized = true;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this.stopLoop();
    this._callback = null;
    if (this._isInitialized && this._engine) {
      try {
        this._engine.platformShutdown();
      } catch {
        // Ignore if already shutdown
      }
    }
    this._engine = null;
    this._isInitialized = false;
    this._isDisposed = true;
  }

  startLoop(callback: FrameCallback, options?: LoopOptions): void {
    if (this._isDisposed) {
      throw new GalfusLoopError('Cannot start loop on a disposed BunTransport.');
    }
    if (this._isRunning) {
      throw new GalfusLoopError('BunTransport loop is already running.');
    }
    const currentGen = ++this._loopGeneration;
    this._callback = callback;
    this._isRunning = true;
    this._lastTime = performance.now();

    const targetFps = options?.targetFps ?? this._targetFps;
    const intervalMs = 1000 / targetFps;

    const runAsyncLoop = async () => {
      while (this._isRunning && this._loopGeneration === currentGen && !this._isDisposed) {
        const now = performance.now();
        const timing = calculateFrameTiming(now, this._lastTime, ++this._frameId);
        this._lastTime = now;

        try {
          this._callback?.(timing);
        } catch (err) {
          console.error('[BunTransport] Unhandled error during frame execution:', err);
        }

        if (!this._isRunning || this._loopGeneration !== currentGen || this._isDisposed) break;

        const elapsed = performance.now() - now;
        const delay = Math.max(1, Math.round(intervalMs - elapsed));
        await Bun.sleep(delay);
      }
    };

    void runAsyncLoop();
  }

  stopLoop(): void {
    this._isRunning = false;
    this._loopGeneration++;
  }
}

/** Creates a new GalfusTransport driver instance running via Bun FFI. */
export function createBunTransport(options?: TransportInitOptions): GalfusTransport {
  const transport = new BunTransport();
  transport.init(options);
  return transport;
}

export default createBunTransport;
