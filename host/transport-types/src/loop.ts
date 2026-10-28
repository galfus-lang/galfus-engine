/**
 * Default frame rate target for native desktop platforms (Bun FFI and Node-API).
 * In browsers, the frame rate is synchronized with display refresh rate via `requestAnimationFrame`.
 */
export const DEFAULT_TARGET_FPS = 120;

/**
 * Default upper limit for single-frame delta in milliseconds.
 * Prevents simulation jumps (the "spiral of death") when the window is dragged,
 * paused by the debugger, or temporarily unfocused.
 */
export const DEFAULT_MAX_DELTA_MS = 100;

/**
 * Snapshot of frame timing passed to every frame update callback.
 */
export interface FrameTiming {
  /** Monotonically increasing time timestamp in milliseconds (e.g. from `performance.now()`). */
  timeMs: number;
  /** Elapsed time since the previous frame in milliseconds, capped by `maxDeltaMs`. */
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
   * Defaults to {@link DEFAULT_TARGET_FPS} (120 FPS).
   * Note: in browsers, this option is respected as a throttle if specified,
   * but by default the browser aligns with `requestAnimationFrame`.
   */
  targetFps?: number;

  /**
   * Maximum allowed delta time per frame in milliseconds.
   * Defaults to {@link DEFAULT_MAX_DELTA_MS} (100 ms).
   */
  maxDeltaMs?: number;
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
   * high-resolution loop targeting 120 FPS.
   *
   * @param callback The function called on every frame tick.
   * @param options Optional loop configuration (target FPS, max delta).
   * @throws {@link GalfusLoopError} if the loop is already running.
   *
   * @example
   * ```ts
   * transport.startLoop((timing) => {
   *   world.tick(timing.timeMs, timing.deltaMs);
   * }, { targetFps: 120 });
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

  /**
   * Manually steps a single frame forward.
   * Ideal for deterministic headless simulations, physics unit tests, or server CI.
   *
   * @param timeMs Optional explicit timestamp in milliseconds. Defaults to current performance time.
   * @param deltaMs Optional explicit delta in milliseconds. Defaults to time elapsed since last step.
   *
   * @example
   * ```ts
   * // Fixed deterministic stepping in a unit test:
   * transport.step(1000, 16.666);
   * ```
   */
  step(timeMs?: number, deltaMs?: number): void;

  /** Alias for {@link startLoop}. */
  start?(callback: FrameCallback, options?: LoopOptions): void;

  /** Alias for {@link stopLoop}. */
  stop?(): void;

  /** Alias for {@link step}. */
  tick?(timeMs?: number, deltaMs?: number): void;
}

/**
 * Pure calculation helper to compute frame timing parameters.
 * Used internally by transport drivers to guarantee uniform timing calculations.
 *
 * @param nowMs Current monotonic timestamp in milliseconds.
 * @param lastTimeMs Previous frame monotonic timestamp in milliseconds.
 * @param frameId Monotonically increasing frame index.
 * @param maxDeltaMs Maximum allowable delta in milliseconds.
 * @returns Fully populated {@link FrameTiming} structure.
 */
export function calculateFrameTiming(
  nowMs: number,
  lastTimeMs: number,
  frameId: number,
  maxDeltaMs: number = DEFAULT_MAX_DELTA_MS
): FrameTiming {
  const rawDelta = lastTimeMs > 0 ? Math.max(0, nowMs - lastTimeMs) : 0;
  const deltaMs = Math.min(rawDelta, maxDeltaMs);
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
