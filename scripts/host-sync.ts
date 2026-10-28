import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, resolve } from 'path';
import {
  getArtifactFileName,
  resolveNativePlatform,
  type NativePlatform
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
  logStep('codegen', 'Running multi-language codegen strategy engine...');
  runCommand(['bun', 'run', 'codegen']);

  logStep('types', 'Syncing canonical descriptors to host/transport-types/src/sdk/galfus.ts...');
  const typesSdkDir = resolve(rootDir, 'host/transport-types/src/sdk');
  await ensureDir(typesSdkDir);
  const tsSdkSource = await readFile(resolve(rootDir, 'sdk/typescript/galfus.ts'), 'utf-8');
  await writeFile(resolve(typesSdkDir, 'galfus.ts'), tsSdkSource, 'utf-8');

  // 1. Sync Bun FFI SDK
  logStep('bun', 'Adapting Bun FFI driver for host/transport-bun/src/sdk/galfus.ts...');
  const bunSdkDir = resolve(rootDir, 'host/transport-bun/src/sdk');
  await ensureDir(bunSdkDir);
  let bunCode = await readFile(resolve(rootDir, 'sdk/bun/galfus.ts'), 'utf-8');
  bunCode = bunCode.replaceAll('../typescript/galfus.ts', '@galfus/transport-types');

  // Inject deterministic binary loader
  const bunLocateCustom = `
import { resolveNativePlatform, getArtifactFileName } from '@galfus/transport-types';

function locateLibrary(): string {
  const platform = resolveNativePlatform();
  const filename = getArtifactFileName('ffi', platform);
  const baseDir = typeof import.meta.dir === 'string' ? import.meta.dir : process.cwd();
  const localDistPath = resolve(baseDir, '../../dist', platform, filename);
  if (existsSync(localDistPath)) {
    return localDistPath;
  }
  throw new Error(
    \`[GalfusBun] Native binary not found for platform "\${platform}" at: \${localDistPath}. Please run "bun run host:sync" to build it.\`
  );
}
`;
  bunCode = bunCode.replace(
    /function locateLibrary\(\): string \{[\s\S]*?\n\}/,
    bunLocateCustom.trim()
  );
  await writeFile(resolve(bunSdkDir, 'galfus.ts'), bunCode, 'utf-8');

  // 2. Sync Node-API SDK
  logStep('node', 'Adapting Node-API driver for host/transport-node/src/sdk/galfus.ts...');
  const nodeSdkDir = resolve(rootDir, 'host/transport-node/src/sdk');
  await ensureDir(nodeSdkDir);
  let nodeCode = await readFile(resolve(rootDir, 'sdk/node/galfus.ts'), 'utf-8');
  nodeCode = nodeCode.replaceAll('../typescript/galfus.ts', '@galfus/transport-types');

  const nodeLocateCustom = `
import { resolveNativePlatform, getArtifactFileName } from '@galfus/transport-types';

function locateAddon(): string {
  const platform = resolveNativePlatform();
  const filename = getArtifactFileName('napi', platform);
  const baseDir = typeof import.meta.dir === 'string' ? import.meta.dir : dirname(fileURLToPath(import.meta.url));
  const localDistPath = resolve(baseDir, '../../dist', platform, filename);
  if (existsSync(localDistPath)) {
    return localDistPath;
  }
  throw new Error(
    \`[GalfusNode] Node-API addon not found for platform "\${platform}" at: \${localDistPath}. Please run "bun run host:sync" to build it.\`
  );
}
`;
  nodeCode = nodeCode.replace(
    /function locateAddon\(\): string \{[\s\S]*?\n\}/,
    nodeLocateCustom.trim()
  );
  await writeFile(resolve(nodeSdkDir, 'galfus.ts'), nodeCode, 'utf-8');

  // 3. Sync Browser WASM SDK
  logStep('browser', 'Adapting Browser WASM driver for host/transport-browser/src/sdk/...');
  const browserSdkDir = resolve(rootDir, 'host/transport-browser/src/sdk');
  await ensureDir(browserSdkDir);
  let browserCode = await readFile(resolve(rootDir, 'sdk/browser/galfus.ts'), 'utf-8');
  browserCode = browserCode.replaceAll('../typescript/galfus.ts', '@galfus/transport-types');
  browserCode = browserCode.replaceAll('./audio.ts', './audio');
  await writeFile(resolve(browserSdkDir, 'galfus.ts'), browserCode, 'utf-8');

  let audioCode = await readFile(resolve(rootDir, 'sdk/browser/audio.ts'), 'utf-8');
  audioCode = audioCode.replaceAll('../typescript/galfus.ts', '@galfus/transport-types');
  await writeFile(resolve(browserSdkDir, 'audio.ts'), audioCode, 'utf-8');
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
