import { existsSync } from 'fs';
import { copyFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { resolve } from 'path';
import {
  getArtifactFileName,
  type NativePlatform,
  resolveNativePlatform
} from '../host/transport-types/src/platform';

const rootDir = resolve(import.meta.dir, '..');
const cargoTargetDir = resolve(rootDir, 'build/cargo-target');
const cargoBinDir = resolve(process.env.CARGO_HOME ?? resolve(homedir(), '.cargo'), 'bin');
const wasmBindgenPath = Bun.which('wasm-bindgen') ?? resolve(cargoBinDir, 'wasm-bindgen');

type SyncMode = 'debug' | 'release';

interface SyncOptions {
  mode: SyncMode;
  skipCargo: boolean;
  skipWasm: boolean;
}

function parseArgs(): SyncOptions {
  const args = Bun.argv.slice(2);
  const isRelease = args.includes('--release');
  const skipCargo = args.includes('--skip-cargo');
  const skipWasm = args.includes('--skip-wasm');

  return {
    mode: isRelease ? 'release' : 'debug',
    skipCargo,
    skipWasm
  };
}

function logStep(step: string, message: string): void {
  console.log(`\x1b[36m==>\x1b[0m \x1b[1m[host-sync:${step}]\x1b[0m ${message}`);
}

function runCommand(cmd: string[], cwd = rootDir): void {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: cargoTargetDir
    }
  });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${cmd.join(' ')}`);
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function syncTypeScriptSdk(): Promise<void> {
  logStep('codegen', 'Running multi-language codegen strategy engine and syncing host packages...');
  runCommand(['bun', 'run', 'codegen']);
}

async function buildNativeBinaries(platform: NativePlatform, mode: SyncMode): Promise<void> {
  const profileDir = mode === 'release' ? 'release' : 'debug';
  const cargoFlag = mode === 'release' ? ['--release'] : [];
  const nativeExt = platform.startsWith('windows')
    ? 'dll'
    : platform.startsWith('macos')
      ? 'dylib'
      : 'so';
  const nativeOut = resolve(cargoTargetDir, profileDir, `libgalfus_native.${nativeExt}`);

  // 1. Build Bun FFI binary
  logStep('cargo:ffi', `Building native FFI library (${platform}, ${mode})...`);
  runCommand(['cargo', 'build', '-p', 'galfus-native', ...cargoFlag]);

  const ffiDestDir = resolve(rootDir, `host/transport-bun/dist/${platform}`);
  await ensureDir(ffiDestDir);
  const ffiDestFile = resolve(ffiDestDir, getArtifactFileName('ffi', platform));
  await copyFile(nativeOut, ffiDestFile);
  logStep('cargo:ffi', `✔ Copied FFI binary to: ${ffiDestFile}`);

  // 2. Build Node-API addon binary
  logStep('cargo:napi', `Building Node-API addon (${platform}, ${mode})...`);
  runCommand(['cargo', 'build', '-p', 'galfus-native', '--features', 'napi', ...cargoFlag]);

  const napiDestDir = resolve(rootDir, `host/transport-node/dist/${platform}`);
  await ensureDir(napiDestDir);
  const napiDestFile = resolve(napiDestDir, getArtifactFileName('napi', platform));
  await copyFile(nativeOut, napiDestFile);
  logStep('cargo:napi', `✔ Copied Node-API addon to: ${napiDestFile}`);

  // 3. Rebuild clean FFI binary in cargo-target so native debug/release directory remains clean
  runCommand(['cargo', 'build', '-p', 'galfus-native', ...cargoFlag]);
}

async function buildBrowserWasm(mode: SyncMode): Promise<void> {
  const profileDir = mode === 'release' ? 'release' : 'debug';
  const cargoFlag = mode === 'release' ? ['--release'] : [];
  const wasmOutput = resolve(
    cargoTargetDir,
    `wasm32-unknown-unknown/${profileDir}/galfus_browser.wasm`
  );
  const browserDistDir = resolve(rootDir, 'host/transport-browser/dist');

  logStep('cargo:wasm', `Building WebAssembly module (${mode})...`);
  runCommand([
    'cargo',
    'build',
    '--locked',
    '--package',
    'galfus-browser',
    '--target',
    'wasm32-unknown-unknown',
    ...cargoFlag
  ]);

  if (!existsSync(wasmBindgenPath)) {
    throw new Error(
      `wasm-bindgen CLI not found at ${wasmBindgenPath}. Please install it via "cargo install wasm-bindgen-cli".`
    );
  }

  logStep('wasm-bindgen', `Generating web bindings in host/transport-browser/dist/...`);
  await ensureDir(browserDistDir);
  runCommand([
    wasmBindgenPath,
    '--target',
    'web',
    '--out-dir',
    browserDistDir,
    '--out-name',
    'galfus_browser',
    wasmOutput
  ]);
  logStep('wasm-bindgen', `✔ Browser WASM module ready in: ${browserDistDir}`);
}

async function main(): Promise<void> {
  const options = parseArgs();
  const platform = resolveNativePlatform();

  console.log(`\n\x1b[35m=== Galfus Engine - Host Sync & Binary Orchestration ===\x1b[0m`);
  console.log(`Platform: \x1b[32m${platform}\x1b[0m | Mode: \x1b[33m${options.mode}\x1b[0m\n`);

  await syncTypeScriptSdk();

  if (!options.skipCargo) {
    await buildNativeBinaries(platform, options.mode);

    if (!options.skipWasm) {
      await buildBrowserWasm(options.mode);
    } else {
      logStep('cargo:wasm', 'Skipping WebAssembly build (--skip-wasm).');
    }
  } else {
    logStep('cargo', 'Skipping Rust Cargo build (--skip-cargo).');
  }

  console.log(`\n\x1b[32m✔ Host packages synchronized successfully!\x1b[0m\n`);
}

main().catch((err) => {
  console.error('\n\x1b[31m✖ Host sync failed:\x1b[0m', err);
  process.exit(1);
});
