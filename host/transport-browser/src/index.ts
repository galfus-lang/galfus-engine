import {
  GalfusLoopError,
  GalfusTransportError,
  calculateFrameTiming,
  type FrameCallback,
  type GalfusEngine,
  type GalfusTransport,
  type LoopOptions,
  type TransportInitOptions
} from '@galfus/transport-types';
import { GalfusBrowser, initializeGalfusBrowser, type GalfusBrowserWasmModule } from './sdk/galfus';

export * from './sdk/galfus';

export interface BrowserTransportOptions extends TransportInitOptions {
  wasmModule?: GalfusBrowserWasmModule;
}

export class BrowserTransport implements GalfusTransport {
  private _engine: GalfusBrowser | null = null;
  private _wasmModule: GalfusBrowserWasmModule | null = null;
  private _isRunning = false;
  private _isInitialized = false;
  private _isDisposed = false;
  private _frameId = 0;
  private _lastTime = 0;
  private _loopGeneration = 0;
  private _rafId: number | null = null;
  private _callback: FrameCallback | null = null;

  constructor(wasmModule?: GalfusBrowserWasmModule) {
    if (wasmModule) {
      this._wasmModule = wasmModule;
    }
  }

  get engine(): GalfusEngine {
    if (this._isDisposed) {
      throw new GalfusTransportError('Cannot access engine on a disposed BrowserTransport.');
    }
    if (!this._engine) {
      throw new GalfusTransportError(
        '[BrowserTransport] Engine not initialized. Please ensure transport is initialized.'
      );
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

  async init(options: BrowserTransportOptions = {}): Promise<void> {
    if (this._isDisposed) {
      throw new GalfusTransportError('Cannot initialize a disposed BrowserTransport.');
    }
    if (this._isInitialized) return;

    if (options.wasmModule) {
      this._wasmModule = options.wasmModule;
    }

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

  startLoop(callback: FrameCallback, _options?: LoopOptions): void {
    if (this._isDisposed) {
      throw new GalfusLoopError('Cannot start loop on a disposed BrowserTransport.');
    }
    if (!this._isInitialized) {
      throw new GalfusLoopError('Cannot start loop on an uninitialized BrowserTransport.');
    }
    if (this._isRunning) {
      throw new GalfusLoopError('BrowserTransport loop is already running.');
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      throw new GalfusLoopError(
        'BrowserTransport requires requestAnimationFrame. In headless or non-DOM environments, use step() or a native transport.'
      );
    }

    const currentGen = ++this._loopGeneration;
    this._callback = callback;
    this._isRunning = true;
    this._lastTime = performance.now();
    this._frameId = 0;

    const tick = (now: number) => {
      if (!this._isRunning || this._loopGeneration !== currentGen || this._isDisposed) return;

      const timing = calculateFrameTiming(now, this._lastTime, ++this._frameId);
      this._lastTime = now;

      try {
        this._callback?.(timing);
      } catch (err) {
        console.error('[BrowserTransport] Unhandled error during frame execution:', err);
      }

      if (
        this._isRunning &&
        this._loopGeneration === currentGen &&
        !this._isDisposed &&
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
      ) {
        this._rafId = window.requestAnimationFrame(tick);
      }
    };

    this._rafId = window.requestAnimationFrame(tick);
  }

  stopLoop(): void {
    this._isRunning = false;
    this._loopGeneration++;
    if (this._rafId !== null) {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(this._rafId);
      }
      this._rafId = null;
    }
  }

  step(timeMs?: number, deltaMs?: number, callback?: FrameCallback): void {
    if (this._isDisposed) {
      throw new GalfusLoopError('Cannot step on a disposed BrowserTransport.');
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

/**
 * Creates and initializes a new GalfusTransport driver instance running via WebAssembly in the browser.
 */
export async function createBrowserTransport(
  optionsOrModule?: BrowserTransportOptions | GalfusBrowserWasmModule
): Promise<GalfusTransport> {
  const isModule =
    optionsOrModule && typeof optionsOrModule === 'object' && 'platformInit' in optionsOrModule;
  const options: BrowserTransportOptions = isModule
    ? { wasmModule: optionsOrModule as GalfusBrowserWasmModule }
    : ((optionsOrModule as BrowserTransportOptions) ?? {});

  const transport = new BrowserTransport(options.wasmModule);
  await transport.init(options);
  return transport;
}

export default createBrowserTransport;
