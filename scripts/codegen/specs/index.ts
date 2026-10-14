import type { FunctionSpec } from './types';
import { platformFunctions } from './platform';
import { multiverseFunctions } from './multiverse';

export * from './types';
export { platformFunctions } from './platform';
export { multiverseFunctions } from './multiverse';

/**
 * Complete list of all native functions exposed by the Galfus Engine ABI.
 */
export const API_FUNCTIONS: FunctionSpec[] = [...platformFunctions, ...multiverseFunctions];

/**
 * Convenient alias for API_FUNCTIONS.
 */
export const functions: FunctionSpec[] = API_FUNCTIONS;
