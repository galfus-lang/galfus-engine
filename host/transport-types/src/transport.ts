import type { GalfusEngine } from './sdk/galfus';
import type { EngineLoopController } from './loop';

/**
 * Options supplied when initializing a Galfus transport backend.
 */
export interface TransportInitOptions {
  /** Enables verbose debug logging and diagnostics on both host and core. */
  debug?: boolean;

  /** Initializes the engine in headless mode (no physical window, offscreen rendering only). */
  headless?: boolean;

  /** Target HTML canvas selector or element ID (relevant only on browser/WASM platform). */
  canvasId?: string;
}

/**
 * High-level unified transport contract exposed by all concrete backends:
 * - Bun FFI (`@galfus/transport-bun`)
 * - Node-API (`@galfus/transport-node`)
 * - Browser WebAssembly (`@galfus/transport-browser`)
 *
 * It bundles the low-level native/WASM C-ABI surface (`engine`) with
 * runtime lifecycle (`init`/`dispose`) and the platform-optimized frame loop controller.
 *
 * @example
 * ```ts
 * import { createBunTransport } from '@galfus/transport-bun';
 *
 * const transport = createBunTransport();
 * transport.init();
 *
 * transport.startLoop(({ dt }) => {
 *   // Game tick at 120 FPS
 * });
 * ```
 */
export interface GalfusTransport extends EngineLoopController {
  /**
   * The underlying native or WASM engine ABI interface providing direct access
   * to Multiverse, Realms, Windowing, Audio, and GPU resources.
   */
  readonly engine: GalfusEngine;

  /**
   * Whether the transport backend is currently initialized and ready to execute commands.
   */
  readonly isInitialized: boolean;

  /**
   * Initializes the native platform coordinator, windowing subsystem, and GPU context.
   *
   * @param options Optional initialization configuration (debug, headless, canvas).
   * @returns Void, or a Promise that resolves when WASM/GPU is ready (in Browser).
   *
   * @example
   * ```ts
   * await transport.init({ debug: true });
   * ```
   */
  init(options?: TransportInitOptions): Promise<void> | void;

  /**
   * Shuts down the platform coordinator, closes all windows, frees native/WASM
   * memory allocations, and halts the active frame loop.
   *
   * @example
   * ```ts
   * transport.dispose();
   * ```
   */
  dispose(): void;
}

/**
 * Factory function signature used to instantiate a transport backend.
 */
export type EngineTransportFactory = (
  options?: TransportInitOptions
) => Promise<GalfusTransport> | GalfusTransport;
