import { GalfusPolicyError } from './errors';

/**
 * Total number of logical IDs strictly reserved at the top of the `u32` space.
 * These IDs are allocated exclusively by the engine core for internal resources,
 * physical GPU abstractions, and resource pooling.
 */
export const CORE_RESERVED_IDS_COUNT = 65535;

/** Maximum possible 32-bit unsigned integer value (`2^32 - 1`). */
export const U32_MAX = 4294967295;

/**
 * Inclusive starting boundary of the core-reserved logical ID range.
 * Corresponds to `u32::MAX - 65535 + 1 = 4294901761`.
 */
export const CORE_RESERVED_RANGE_START = 4294901761;

/**
 * Inclusive ending boundary of the core-reserved logical ID range.
 * Corresponds to `u32::MAX = 4294967295`.
 */
export const CORE_RESERVED_RANGE_END = U32_MAX;

/**
 * Checks whether a given numeric ID falls within the core-reserved range.
 *
 * The engine core reserves the top 65,535 IDs (`4294901761..=4294967295`) for its own internal
 * physical buffers, swapchain targets, and fallback resources. Host code must never create,
 * bind, or allocate resources using IDs in this range.
 *
 * @param id The unsigned integer ID to test.
 * @returns `true` if the ID is within the reserved range; otherwise `false`.
 *
 * @example
 * ```ts
 * import { isLogicalIdReserved } from '@galfus/transport-types';
 *
 * isLogicalIdReserved(100);        // false (safe for host game resources)
 * isLogicalIdReserved(4294901761); // true (reserved for core!)
 * ```
 */
export function isLogicalIdReserved(id: number): boolean {
  return id >= CORE_RESERVED_RANGE_START && id <= CORE_RESERVED_RANGE_END;
}

/**
 * Validates that a host logical ID is valid according to engine core policy.
 * Throws a {@link GalfusPolicyError} if the ID is negative, not an integer,
 * exceeds `u32::MAX`, or falls inside the reserved range.
 *
 * @param id The numeric ID to validate.
 * @param entityName A human-readable label identifying the resource kind (e.g. "ModelId", "TextureId").
 * @throws {@link GalfusPolicyError} if the ID violates policy.
 *
 * @example
 * ```ts
 * import { assertValidLogicalId } from '@galfus/transport-types';
 *
 * // Validates entity ID before sending to native core:
 * assertValidLogicalId(entityId, 'EntityId');
 * ```
 */
export function assertValidLogicalId(id: number, entityName = 'Logical ID'): void {
  if (!Number.isInteger(id) || id < 0 || id > U32_MAX) {
    throw new GalfusPolicyError(
      `${entityName} (${id}) is invalid: must be an unsigned 32-bit integer between 0 and ${U32_MAX}.`,
      id
    );
  }

  if (isLogicalIdReserved(id)) {
    throw new GalfusPolicyError(
      `${entityName} (${id}) violates core policy: the range [${CORE_RESERVED_RANGE_START}..=${CORE_RESERVED_RANGE_END}] is reserved for internal engine resources.`,
      id
    );
  }
}
