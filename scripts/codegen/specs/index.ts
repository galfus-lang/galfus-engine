import type { DescSpec, FunctionSpec } from './types';
import { platformFunctions, platformDescriptors } from './platform';
import { multiverseFunctions, multiverseDescriptors } from './multiverse';
import { resourceFunctions, resourceDescriptors } from './resources';
import { realm3dFunctions, realm3dDescriptors } from './realm_3d';
import { realm2dFunctions, realm2dDescriptors } from './realm_2d';
import { animationFunctions, animationDescriptors } from './animation';

export * from './types';
export { platformFunctions, platformDescriptors } from './platform';
export { multiverseFunctions, multiverseDescriptors } from './multiverse';
export { resourceFunctions, resourceDescriptors } from './resources';
export { realm3dFunctions, realm3dDescriptors } from './realm_3d';
export { realm2dFunctions, realm2dDescriptors } from './realm_2d';
export { animationFunctions, animationDescriptors } from './animation';

/**
 * Complete list of all native functions exposed by the Galfus Engine ABI.
 */
export const API_FUNCTIONS: FunctionSpec[] = [
  ...platformFunctions,
  ...multiverseFunctions,
  ...resourceFunctions,
  ...realm3dFunctions,
  ...realm2dFunctions,
  ...animationFunctions
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
  ...resourceDescriptors,
  ...realm3dDescriptors,
  ...realm2dDescriptors,
  ...animationDescriptors
];

/**
 * Convenient alias for API_DESCRIPTORS.
 */
export const descriptors: DescSpec[] = API_DESCRIPTORS;
