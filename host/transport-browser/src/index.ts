import {
  GalfusLoopError,
  calculateFrameTiming,
  type FrameCallback,
  type GalfusEngine,
  type GalfusTransport,
  type LoopOptions,
  type TransportInitOptions,
  DEFAULT_MAX_DELTA_MS
} from '@galfus/transport-types';
import { GalfusBrowser, initializeGalfusBrowser, type GalfusBrowserWasmModule } from './sdk/galfus';

export * from './sdk/galfus';

export class BrowserTransport implements GalfusTransport {
  private _engine: GalfusBrowser | null = null;
  private _wasmModule: GalfusBrowserWasmModule | null = null;
  private _isRunning = false;
  private _isInitialized = false;
  private _frameId = 0;
  private _lastTime = 0;
  private _rafId: number | null = null;
  private _callback: FrameCallback | null = null;
  private _options: LoopOptions = {};

  constructor(wasmModule?: GalfusBrowserWasmModule) {
    if (wasmModule) {
      this._wasmModule = wasmModule;
    }
  }

  get engine(): GalfusEngine {
    if (!this._engine) {
      throw new Error(
        '[BrowserTransport] Engine not initialized. Please call "await transport.init()" first.'
      );
    }
    return this._engine;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  async init(options: TransportInitOptions = {}): Promise<void> {
    if (this._isInitialized) return;

    if (!this._wasmModule) {
      // In web applications, users pass the wasm module or import default
      // @ts-ignore
      const module = await import('../dist/galfus_browser.js');
      this._wasmModule = module;
    }

    this._engine = await initializeGalfusBrowser(this._wasmModule!);
    if (options.headless) {
      this._engine.platformInitHeadless();
    } else {
      this._engine.platformInit();
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
      throw new GalfusLoopError('BrowserTransport loop is already running.');
    }
    this._callback = callback;
    this._options = options;
    this._isRunning = true;
    this._lastTime = performance.now();
    this._frameId = 0;

    const maxDeltaMs = options.maxDeltaMs ?? DEFAULT_MAX_DELTA_MS;

    const tick = (now: number) => {
      if (!this._isRunning) return;

      const timing = calculateFrameTiming(now, this._lastTime, ++this._frameId, maxDeltaMs);
      this._lastTime = now;

      try {
        this._callback?.(timing);
      } catch (err) {
        console.error('[BrowserTransport] Unhandled error during frame execution:', err);
      }

      if (
        this._isRunning &&
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
      ) {
        this._rafId = window.requestAnimationFrame(tick);
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this._rafId = window.requestAnimationFrame(tick);
    } else {
      // Fallback for Node/Worker test environments
      this._rafId = setTimeout(() => tick(performance.now()), 16) as unknown as number;
    }
  }

  stopLoop(): void {
    this._isRunning = false;
    if (this._rafId !== null) {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(this._rafId);
      } else {
        clearTimeout(this._rafId);
      }
      this._rafId = null;
    }
    this._callback = null;
  }

  step(timeMs?: number, deltaMs?: number): void {
    const now = timeMs ?? performance.now();
    const delta = deltaMs ?? (this._lastTime > 0 ? now - this._lastTime : 16.666);
    const timing = calculateFrameTiming(now, now - delta, ++this._frameId);
    this._lastTime = now;
    this._callback?.(timing);
  }
}

/** Creates a new GalfusTransport driver instance running via WebAssembly in the browser. */
export function createBrowserTransport(wasmModule?: GalfusBrowserWasmModule): GalfusTransport {
  return new BrowserTransport(wasmModule);
}

export default createBrowserTransport;
