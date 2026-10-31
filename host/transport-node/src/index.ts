import {
  GalfusLoopError,
  GalfusTransportError,
  calculateFrameTiming,
  type FrameCallback,
  type GalfusEngine,
  type GalfusTransport,
  type LoopOptions,
  type TransportInitOptions,
  DEFAULT_TARGET_FPS
} from '@galfus/transport-types';
import { GalfusNode } from './sdk/galfus';

export * from './sdk/galfus';

export class NodeTransport implements GalfusTransport {
  private _engine: GalfusNode | null = null;
  private _isRunning = false;
  private _isInitialized = false;
  private _isDisposed = false;
  private _frameId = 0;
  private _lastTime = 0;
  private _loopGeneration = 0;
  private _loopTimer: ReturnType<typeof setTimeout> | null = null;
  private _callback: FrameCallback | null = null;
  private _targetFps: number = DEFAULT_TARGET_FPS;

  get engine(): GalfusEngine {
    if (this._isDisposed) {
      throw new GalfusTransportError('Cannot access engine on a disposed NodeTransport.');
    }
    if (!this._engine) {
      this._engine = new GalfusNode();
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
      throw new GalfusTransportError('Cannot initialize a disposed NodeTransport.');
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
      throw new GalfusLoopError('Cannot start loop on a disposed NodeTransport.');
    }
    if (this._isRunning) {
      throw new GalfusLoopError('NodeTransport loop is already running.');
    }
    const currentGen = ++this._loopGeneration;
    this._callback = callback;
    this._isRunning = true;
    this._lastTime = performance.now();
    this._frameId = 0;

    const targetFps = options?.targetFps ?? this._targetFps;
    const intervalMs = 1000 / targetFps;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const runAsyncLoop = async () => {
      while (this._isRunning && this._loopGeneration === currentGen && !this._isDisposed) {
        const now = performance.now();
        const timing = calculateFrameTiming(now, this._lastTime, ++this._frameId);
        this._lastTime = now;

        try {
          this._callback?.(timing);
        } catch (err) {
          console.error('[NodeTransport] Unhandled error during frame execution:', err);
        }

        if (!this._isRunning || this._loopGeneration !== currentGen || this._isDisposed) break;

        const elapsed = performance.now() - now;
        const delay = Math.max(1, Math.round(intervalMs - elapsed));
        await sleep(delay);
      }
    };

    void runAsyncLoop();
  }

  stopLoop(): void {
    this._isRunning = false;
    this._loopGeneration++;
    if (this._loopTimer !== null) {
      clearTimeout(this._loopTimer);
      this._loopTimer = null;
    }
  }

  step(timeMs?: number, deltaMs?: number, callback?: FrameCallback): void {
    if (this._isDisposed) {
      throw new GalfusLoopError('Cannot step on a disposed NodeTransport.');
    }
    const now = timeMs ?? performance.now();
    const timing = calculateFrameTiming(now, this._lastTime, ++this._frameId, deltaMs);
    this._lastTime = now;
    (callback ?? this._callback)?.(timing);
  }

  start(callback: FrameCallback, options?: LoopOptions): void {
    this.startLoop(callback, options);
  }

  stop(): void {
    this.stopLoop();
  }

  tick(timeMs?: number, deltaMs?: number): void {
    this.step(timeMs, deltaMs);
  }
}

/** Creates a new GalfusTransport driver instance running via Node-API. */
export function createNodeTransport(options?: TransportInitOptions): GalfusTransport {
  const transport = new NodeTransport();
  transport.init(options);
  return transport;
}

export default createNodeTransport;
