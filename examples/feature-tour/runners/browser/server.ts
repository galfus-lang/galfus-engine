import { copyFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dir, '../../../..');
const sourceDir = import.meta.dir;
const outputDir = resolve(rootDir, '.tmp/browser-feature-tour');
const packageDir = resolve(outputDir, 'pkg');
const wasmPath = resolve(
  rootDir,
  'build/cargo-target/wasm32-unknown-unknown/release/galfus_browser.wasm'
);
const cargoBinDir = resolve(process.env.CARGO_HOME ?? resolve(homedir(), '.cargo'), 'bin');
const wasmBindgenPath = Bun.which('wasm-bindgen') ?? resolve(cargoBinDir, 'wasm-bindgen');

export interface BrowserTourServer {
  readonly url: string;
  stop(): void;
}

function run(command: string[]): void {
  const result = Bun.spawnSync({
    cmd: command,
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit'
  });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`);
  }
}

function requireWasmBindgen(): void {
  if (!existsSync(wasmBindgenPath)) {
    throw new Error(
      'wasm-bindgen CLI was not found. Install wasm-bindgen-cli 0.2.129 before running the browser tour.'
    );
  }
}

export async function buildBrowserTour(): Promise<void> {
  requireWasmBindgen();

  console.log('==> Generating SDKs...');
  run(['bun', 'run', 'codegen']);

  console.log('==> Building the browser WASM binding...');
  run([
    'cargo',
    'build',
    '--locked',
    '--release',
    '--package',
    'galfus-browser',
    '--target',
    'wasm32-unknown-unknown'
  ]);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });

  console.log('==> Generating the wasm-bindgen web module...');
  run([
    wasmBindgenPath,
    '--target',
    'web',
    '--out-dir',
    packageDir,
    '--out-name',
    'galfus_browser',
    wasmPath
  ]);

  console.log('==> Bundling the browser feature tour...');
  const result = await Bun.build({
    entrypoints: [resolve(sourceDir, 'app.ts')],
    outdir: outputDir,
    target: 'browser',
    format: 'esm'
  });
  if (!result.success) {
    throw new Error(`Browser tour bundle failed:\n${result.logs.join('\n')}`);
  }

  await copyFile(resolve(sourceDir, 'index.html'), resolve(outputDir, 'index.html'));
}

export async function startBrowserTourServer(port = 0): Promise<BrowserTourServer> {
  await buildBrowserTour();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/favicon.ico') {
        return new Response(null, { status: 204 });
      }
      const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const filePath = resolve(outputDir, relativePath);

      if (filePath !== outputDir && !filePath.startsWith(`${outputDir}/`)) {
        return new Response('Forbidden', { status: 403 });
      }

      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response('Not found', { status: 404 });
      }

      return new Response(file);
    }
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop()
  };
}
