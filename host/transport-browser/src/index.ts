import {
  GalfusBrowser,
  initializeGalfusBrowser,
  type GalfusBrowserWasmModule
} from '../../../sdk/browser/galfus.ts';
import type { GalfusEngine } from '@galfus/transport-types';

export { GalfusBrowser, initializeGalfusBrowser };
export type { GalfusBrowserWasmModule };

/** Initializes and returns a GalfusEngine driver instance running via Browser WebAssembly. */
export async function createBrowserTransport(
  wasmModule: GalfusBrowserWasmModule
): Promise<GalfusEngine> {
  return initializeGalfusBrowser(wasmModule);
}

export default createBrowserTransport;
