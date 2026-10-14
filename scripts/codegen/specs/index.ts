import type { DescSpec, FunctionSpec } from './types';
import { platformFunctions, platformDescriptors } from './platform';
import { multiverseFunctions, multiverseDescriptors } from './multiverse';
import { resourceFunctions, resourceDescriptors } from './resources';

export * from './types';
export { platformFunctions, platformDescriptors } from './platform';
export { multiverseFunctions, multiverseDescriptors } from './multiverse';
export { resourceFunctions, resourceDescriptors } from './resources';

/**
 * Complete list of all native functions exposed by the Galfus Engine ABI.
 */
export const API_FUNCTIONS: FunctionSpec[] = [
  ...platformFunctions,
  ...multiverseFunctions,
  ...resourceFunctions
];

/**
 * Convenient alias for API_FUNCTIONS.
 */
export const functions: FunctionSpec[] = API_FUNCTIONS;

/**
 * Complete list of all schema descriptors for types and domain models.
 */
export const API_DESCRIPTORS: DescSpec[] = [
  ...platformDescriptors,
  ...multiverseDescriptors,
  ...resourceDescriptors
];

/**
 * Convenient alias for API_DESCRIPTORS.
 */
export const descriptors: DescSpec[] = API_DESCRIPTORS;
