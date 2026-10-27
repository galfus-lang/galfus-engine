import { GalfusBun, galfus } from '../../../sdk/bun/galfus.ts';
import type { GalfusEngine } from '@galfus/transport-types';

export { GalfusBun, galfus };

/** Creates or returns a GalfusEngine driver instance running via Bun FFI. */
export function createBunTransport(): GalfusEngine {
  return galfus;
}

export default createBunTransport;
