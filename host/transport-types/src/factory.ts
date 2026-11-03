/**
 * Identifies the current JavaScript host runtime execution environment.
 */
export type RuntimeKind = 'node' | 'bun' | 'browser' | 'unknown';

/**
 * Diagnostic information describing the active runtime environment and host OS.
 */
export interface RuntimeInfo {
  /** The identified runtime execution flavor. */
  runtime: RuntimeKind;
  /** Version string of the runtime (e.g. Bun or Node.js version), or null if not accessible. */
  version: string | null;
  /** Host OS platform identifier (e.g. 'linux', 'darwin', 'win32'), or null in browsers. */
  platform: string | null;
  /** CPU architecture identifier (e.g. 'x64', 'arm64'), or null in browsers. */
  arch: string | null;
}

/**
 * Detects whether the current process is executing within a web browser or WebWorker.
 *
 * @example
 * ```ts
 * if (isBrowserRuntime()) {
 *   console.log('Running inside browser WebGPU canvas');
 * }
 * ```
 */
export function isBrowserRuntime(): boolean {
  return (
    typeof window !== 'undefined' ||
    typeof document !== 'undefined' ||
    (typeof globalThis !== 'undefined' &&
      // @ts-ignore
      typeof globalThis.importScripts === 'function' &&
      // @ts-ignore
      typeof globalThis.navigator !== 'undefined')
  );
}

/**
 * Detects whether the current process is running in a desktop native runtime (Bun or Node.js).
 */
export function isNativeRuntime(): boolean {
  return !isBrowserRuntime();
}

/**
 * Inspects global runtime objects to detect whether Galfus is executing under
 * Bun, Node.js, a Web Browser, or an unrecognized environment.
 *
 * @returns Diagnostic {@link RuntimeInfo} record.
 *
 * @example
 * ```ts
 * import { detectRuntime } from '@galfus/transport-types';
 *
 * const info = detectRuntime();
 * console.log(`Detected runtime: ${info.runtime} (${info.platform} ${info.arch})`);
 * ```
 */
export function detectRuntime(): RuntimeInfo {
  // 1. Detect Bun
  if (
    typeof globalThis !== 'undefined' &&
    // @ts-ignore
    typeof globalThis.Bun !== 'undefined' &&
    // @ts-ignore
    typeof globalThis.Bun?.version === 'string'
  ) {
    return {
      runtime: 'bun',
      // @ts-ignore
      version: globalThis.Bun.version,
      // @ts-ignore
      platform: typeof process !== 'undefined' ? process.platform : null,
      // @ts-ignore
      arch: typeof process !== 'undefined' ? process.arch : null
    };
  }

  // 2. Detect Node.js
  if (
    typeof globalThis !== 'undefined' &&
    // @ts-ignore
    typeof globalThis.process !== 'undefined' &&
    // @ts-ignore
    typeof globalThis.process?.versions?.node === 'string'
  ) {
    // @ts-ignore
    const proc = globalThis.process;
    return {
      runtime: 'node',
      version: proc.versions.node,
      platform: proc.platform ?? null,
      arch: proc.arch ?? null
    };
  }

  // 3. Detect Browser / Web Worker
  if (isBrowserRuntime()) {
    return {
      runtime: 'browser',
      version: null,
      platform: typeof navigator !== 'undefined' ? navigator.platform : null,
      arch: null
    };
  }

  return {
    runtime: 'unknown',
    version: null,
    platform: null,
    arch: null
  };
}
