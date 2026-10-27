import { GalfusNode } from '../../../sdk/node/galfus.ts';
import type { GalfusEngine } from '@galfus/transport-types';

export { GalfusNode };

let cachedNodeEngine: GalfusNode | null = null;

/** Creates or returns a GalfusEngine driver instance running via Node-API. */
export function createNodeTransport(customAddonPath?: string): GalfusEngine {
  if (!cachedNodeEngine || customAddonPath) {
    cachedNodeEngine = new GalfusNode(customAddonPath);
  }
  return cachedNodeEngine;
}

export default createNodeTransport;
