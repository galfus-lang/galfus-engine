/**
 * Base error class for all failures originating from the Galfus transport layer.
 */
export class GalfusTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GalfusTransportError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when host code violates engine core invariants, such as passing IDs
 * inside the reserved range (4294901761..=4294967295) or exceeding limits.
 *
 * @example
 * ```ts
 * try {
 *   assertValidLogicalId(4294901765, 'TextureId');
 * } catch (err) {
 *   if (err instanceof GalfusPolicyError) {
 *     console.error(`Invalid ID: ${err.invalidId}`);
 *   }
 * }
 * ```
 */
export class GalfusPolicyError extends GalfusTransportError {
  readonly invalidId?: number;

  constructor(message: string, invalidId?: number) {
    super(message);
    this.name = 'GalfusPolicyError';
    this.invalidId = invalidId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an illegal operation occurs within the engine frame loop controller
 * (e.g. attempting to start a loop that is already running, or stepping a disposed engine).
 *
 * @example
 * ```ts
 * if (transport.isRunning) {
 *   throw new GalfusLoopError('Engine frame loop is already active.');
 * }
 * ```
 */
export class GalfusLoopError extends GalfusTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'GalfusLoopError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
