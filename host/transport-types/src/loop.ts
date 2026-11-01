/**
 * Default frame rate target for native desktop platforms (Bun FFI and Node-API).
 * In browsers, the frame rate is synchronized with display refresh rate via `requestAnimationFrame`.
 */
export const DEFAULT_TARGET_FPS = 120;

/**
 * Snapshot of frame timing passed to every frame update callback.
 */
export interface FrameTiming {
  /** Monotonically increasing time timestamp in milliseconds (e.g. from `performance.now()`). */
  timeMs: number;
  /** Elapsed time since the previous frame in milliseconds, reflecting real measured duration. */
  deltaMs: number;
  /** Elapsed time in seconds (`deltaMs / 1000`), convenient for physics and game updates. */
  dt: number;
  /** Sequential frame counter, incremented once per dispatched frame. */
  frameId: number;
  /** Instantaneous frame rate estimate based on `1000 / deltaMs`. */
  fps: number;
}

/**
 * Callback invoked once per frame during active loop execution.
 *
 * @param timing Current frame timing metadata (delta, elapsed, frameId, fps).
 *
 * @example
 * ```ts
 * const onFrame: FrameCallback = ({ dt, frameId, fps }) => {
 *   player.update(dt);
 *   console.log(`Rendered frame ${frameId} at ${fps.toFixed(1)} FPS`);
 * };
 * ```
 */
export type FrameCallback = (timing: FrameTiming) => void;

/**
 * Configuration options for the engine frame loop.
 */
export interface LoopOptions {
  /**
   * Target frames per second for native precision loops (Bun and Node-API).
   * Overrides the transport default if specified.
   */
  targetFps?: number;
}

/**
 * Contract implemented by all concrete transports to drive frame execution.
 */
export interface EngineLoopController {
  /**
   * Starts the internal continuous frame loop.
   *
   * On browser transports, this binds to `window.requestAnimationFrame`.
   * On native desktop transports (Bun and Node-API), this runs a precision
   * high-resolution loop targeting configured targetFps (defaults to 120 FPS).
   *
   * @param callback The function called on every frame tick.
   * @param options Optional loop configuration (target FPS).
   * @throws {@link GalfusLoopError} if the loop is already running or transport disposed.
   *
   * @example
   * ```ts
   * transport.startLoop((timing) => {
   *   world.tick(timing.timeMs, timing.deltaMs);
   * });
   * ```
   */
  startLoop(callback: FrameCallback, options?: LoopOptions): void;

  /**
   * Halts the running frame loop. Has no effect if the loop is not active.
   *
   * @example
   * ```ts
   * transport.stopLoop();
   * ```
   */
  stopLoop(): void;

  /**
   * Whether the internal frame loop is currently running.
   */
  readonly isRunning: boolean;

  /** Alias for {@link startLoop}. */
  start?(callback: FrameCallback, options?: LoopOptions): void;

  /** Alias for {@link stopLoop}. */
  stop?(): void;
}

/**
 * Pure calculation helper to compute frame timing parameters.
 * Used internally by transport drivers to guarantee uniform timing calculations.
 *
 * @param nowMs Current monotonic timestamp in milliseconds.
 * @param lastTimeMs Previous frame monotonic timestamp in milliseconds.
 * @param frameId Monotonically increasing frame index.
 * @returns Fully populated {@link FrameTiming} structure.
 */
export function calculateFrameTiming(
  nowMs: number,
  lastTimeMs: number,
  frameId: number
): FrameTiming {
  const deltaMs = lastTimeMs > 0 ? Math.max(0, nowMs - lastTimeMs) : 0;
  const dt = deltaMs / 1000;
  const fps = deltaMs > 0 ? 1000 / deltaMs : 0;

  return {
    timeMs: nowMs,
    deltaMs,
    dt,
    frameId,
    fps
  };
}
