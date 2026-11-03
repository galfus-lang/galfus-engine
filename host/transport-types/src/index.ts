/**
 * @module @galfus/transport-types
 *
 * Unified transport contracts, invariant policies, loop controller specifications,
 * and canonical domain descriptors for the Galfus Engine host layer.
 */

// 1. Invariant policies and reserved ID ranges
export * from './policy';

// 2. Transport and loop errors
export * from './errors';

// 3. Frame loop controller and timing
export * from './loop';

// 4. Unified transport interface and factories
export * from './transport';

// 5. Runtime environment detection
export * from './factory';

// 6. Native platform resolution and artifact filenames
export * from './platform';

// 7. Canonical engine surface and domain descriptors
export * from './sdk/galfus';
