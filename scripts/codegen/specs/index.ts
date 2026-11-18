import { animationDescriptors, animationFunctions } from './animation';
import { hierarchyPhysicsDescriptors, hierarchyPhysicsFunctions } from './hierarchy_physics';
import { interactionDescriptors, interactionFunctions } from './interaction';
import { multiverseDescriptors, multiverseFunctions } from './multiverse';
import { platformDescriptors, platformFunctions } from './platform';
import { realm2dDescriptors, realm2dFunctions } from './realm_2d';
import { realm3dDescriptors, realm3dFunctions } from './realm_3d';
import { resourceDescriptors, resourceFunctions } from './resources';
import type { DescSpec, FunctionSpec } from './types';

export { animationDescriptors, animationFunctions } from './animation';
export { hierarchyPhysicsDescriptors, hierarchyPhysicsFunctions } from './hierarchy_physics';
export { interactionDescriptors, interactionFunctions } from './interaction';
export { multiverseDescriptors, multiverseFunctions } from './multiverse';
export { platformDescriptors, platformFunctions } from './platform';
export { realm2dDescriptors, realm2dFunctions } from './realm_2d';
export { realm3dDescriptors, realm3dFunctions } from './realm_3d';
export { resourceDescriptors, resourceFunctions } from './resources';
export * from './types';

/**
 * Complete list of all native functions exposed by the Galfus Engine ABI.
 */
export const API_FUNCTIONS: FunctionSpec[] = [
  ...platformFunctions,
  ...multiverseFunctions,
  ...resourceFunctions,
  ...realm3dFunctions,
  ...realm2dFunctions,
  ...animationFunctions,
  ...interactionFunctions,
  ...hierarchyPhysicsFunctions
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
  ...animationDescriptors,
  ...interactionDescriptors,
  ...hierarchyPhysicsDescriptors
];

/**
 * Convenient alias for API_DESCRIPTORS.
 */
export const descriptors: DescSpec[] = API_DESCRIPTORS;
