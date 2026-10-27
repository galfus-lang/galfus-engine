export * from '../../../sdk/typescript/galfus.ts';

export type RuntimeKind = 'node' | 'bun' | 'browser' | 'unknown';

export interface RuntimeInfo {
  runtime: RuntimeKind;
  version: string | null;
  platform: string | null;
  arch: string | null;
}

/** Core reserved range: the last 65535 values of u32 (4294901761..=4294967295) */
export const CORE_RESERVED_RANGE_START = 4294901761;
export const CORE_RESERVED_RANGE_END = 4294967295;

export function isLogicalIdReserved(id: number): boolean {
  return id >= CORE_RESERVED_RANGE_START && id <= CORE_RESERVED_RANGE_END;
}

export function assertValidLogicalId(id: number, name = 'Logical ID'): void {
  if (isLogicalIdReserved(id)) {
    throw new Error(
      `${name} (${id}) violates core policy: IDs in range ${CORE_RESERVED_RANGE_START}..=${CORE_RESERVED_RANGE_END} are reserved for the engine core.`
    );
  }
}

export function detectRuntime(): RuntimeInfo {
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

  if (typeof window !== 'undefined' || typeof document !== 'undefined') {
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

export type GalfusEngineFactory = () =>
  | Promise<import('../../../sdk/typescript/galfus.ts').GalfusEngine>
  | import('../../../sdk/typescript/galfus.ts').GalfusEngine;
