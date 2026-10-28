import { detectRuntime, type RuntimeInfo } from './factory';
import { GalfusPolicyError } from './errors';

/**
 * Enumeration of supported native OS and CPU architecture platforms.
 */
export type NativePlatform =
  'linux-x64' | 'linux-arm64' | 'macos-x64' | 'macos-arm64' | 'windows-x64' | 'windows-arm64';

/**
 * Resolves the canonical native platform identifier for the current host environment.
 *
 * @param runtime Optional pre-detected runtime info; defaults to calling `detectRuntime()`.
 * @returns Canonical {@link NativePlatform} string.
 * @throws {@link GalfusPolicyError} if the host platform or CPU architecture is unsupported.
 *
 * @example
 * ```ts
 * const platform = resolveNativePlatform();
 * console.log(`Current native platform: ${platform}`); // e.g. "linux-x64"
 * ```
 */
export function resolveNativePlatform(runtime: RuntimeInfo = detectRuntime()): NativePlatform {
  const platform = runtime.platform;
  const arch = runtime.arch;

  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'macos-x64';
  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm64';
  if (platform === 'win32' && arch === 'x64') return 'windows-x64';
  if (platform === 'win32' && arch === 'arm64') return 'windows-arm64';

  throw new GalfusPolicyError(
    `Unsupported native platform: OS="${platform}", Arch="${arch}". Supported targets: linux-x64/arm64, macos-x64/arm64, windows-x64/arm64.`
  );
}

/**
 * Returns the exact artifact filename for a binding and target platform.
 *
 * @param binding Target binding type ('ffi', 'napi', 'wasm').
 * @param platform Target platform identifier.
 * @returns Filename string (e.g. `libgalfus_native.so`, `galfus.node`, `galfus_browser.wasm`).
 */
export function getArtifactFileName(
  binding: 'ffi' | 'napi' | 'wasm',
  platform: NativePlatform | 'browser'
): string {
  if (binding === 'wasm' || platform === 'browser') {
    return 'galfus_browser.wasm';
  }

  if (binding === 'napi') {
    return 'galfus.node';
  }

  // binding === 'ffi'
  if (platform.startsWith('windows')) {
    return 'galfus.dll';
  }
  if (platform.startsWith('macos')) {
    return 'libgalfus_native.dylib';
  }
  return 'libgalfus_native.so';
}
