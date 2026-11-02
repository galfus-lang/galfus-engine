import { chromium } from '@playwright/test';
import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { homedir } from 'os';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dir, '..');
const testDir = resolve(rootDir, '.tmp/browser-sdk-test');
const packageDir = resolve(testDir, 'pkg');
const wasmPath = resolve(
  rootDir,
  'build/cargo-target/wasm32-unknown-unknown/release/galfus_browser.wasm'
);
const cargoBinDir = resolve(process.env.CARGO_HOME ?? resolve(homedir(), '.cargo'), 'bin');
const wasmBindgenPath = Bun.which('wasm-bindgen') ?? resolve(cargoBinDir, 'wasm-bindgen');
const isHeadless = process.env.CI === 'true' || process.env.GALFUS_BROWSER_TEST_HEADLESS === 'true';

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

async function main(): Promise<void> {
  if (!existsSync(wasmBindgenPath)) {
    throw new Error(
      'wasm-bindgen CLI was not found. Install wasm-bindgen-cli 0.2.129 before running this test.'
    );
  }

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

  await rm(testDir, { recursive: true, force: true });
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

  console.log('==> Transpiling the generated Browser/WASM SDK...');
  run([
    'bun',
    'build',
    'sdk/browser/galfus.ts',
    '--target',
    'browser',
    '--outfile',
    resolve(testDir, 'galfus-sdk.js')
  ]);

  await Bun.write(
    resolve(testDir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Galfus Browser SDK Test</title>
    <style>#galfus-browser-sdk-test { width: 640px; height: 360px; }</style>
  </head>
  <body>
    <canvas id="galfus-browser-sdk-test" width="640" height="360"></canvas>
    <script type="module">
      import init, * as wasm from './pkg/galfus_browser.js';
      import { initializeGalfusBrowser } from './galfus-sdk.js';

      let galfus;
      let windowId;
      try {
        galfus = await initializeGalfusBrowser({ ...wasm, default: init });
        galfus.platformInit();
        windowId = galfus.windowCreate({
          id: 42,
          title: 'Galfus Browser SDK Test',
          size: [640, 360],
          canvasId: 'galfus-browser-sdk-test',
          resizable: true
        });

        const capabilities = galfus.platformGetCapabilities();
        const size = galfus.windowGetSize(windowId);
        const events = galfus.platformPumpEvents();
        galfus.windowSetTitle(windowId, 'Galfus Browser SDK Test Updated');

        if (!capabilities || typeof capabilities !== 'object') {
          throw new Error('platformGetCapabilities() did not return an object');
        }
        if (size[0] !== 640 || size[1] !== 360) {
          throw new Error('windowGetSize() did not return the configured dimensions');
        }
        if (!Array.isArray(events)) {
          throw new Error('platformPumpEvents() did not return an array');
        }

        const canvas = document.getElementById('galfus-browser-sdk-test');
        canvas.style.width = '800px';
        canvas.style.height = '450px';
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);

        const resizedSize = galfus.windowGetSize(windowId);
        const resizeEvents = galfus.platformPumpEvents();
        const resizeEvent = resizeEvents.find(
          (event) =>
            event.kind === 'window' &&
            event.type === 'resized' &&
            event.windowId === windowId &&
            event.width === 800 &&
            event.height === 450
        );
        if (canvas.width !== 800 || canvas.height !== 450) {
          throw new Error('Canvas drawing buffer was not synchronized with its CSS size');
        }
        if (resizedSize[0] !== 800 || resizedSize[1] !== 450) {
          throw new Error('windowGetSize() did not reflect the resized canvas');
        }
        if (!resizeEvent) {
          throw new Error('platformPumpEvents() did not report the canvas resize');
        }

        galfus.windowSetImeAllowed(windowId, 1);
        galfus.windowSetImeCursorArea(windowId, 40, 50, 2, 20);
        const input = document.activeElement;
        if (!(input instanceof HTMLTextAreaElement)) throw new Error('IME input was not focused');
        input.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'かな' }));
        input.dispatchEvent(new CompositionEvent('compositionend', { data: '漢字' }));
        const imeEvents = galfus.platformPumpEvents().filter((event) => event.kind === 'keyboard');
        if (imeEvents.map((event) => event.type).join(',') !== 'imeEnabled,imePreedit,imePreedit,imeCommit' || imeEvents[1].text !== 'かな' || imeEvents[3].text !== '漢字') {
          throw new Error('IME composition events were not delivered in order');
        }
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
        const key = galfus.platformPumpEvents().find((event) => event.type === 'input');
        if (!key || key.text !== 'a' || key.physicalKey !== 'keyA') {
          throw new Error('Keyboard input was not delivered while IME was enabled');
        }
        galfus.windowSetImeAllowed(windowId, 0);
        if (!galfus.platformPumpEvents().some((event) => event.type === 'imeDisabled')) {
          throw new Error('IME disable event was not delivered');
        }
        galfus.windowSetImeAllowed(windowId, 1);
        galfus.platformPumpEvents();
        input.blur();
        if (!galfus.platformPumpEvents().some((event) => event.type === 'imeDisabled')) {
          throw new Error('IME focus loss was not reported');
        }
        input.dispatchEvent(new CompositionEvent('compositionend', { data: 'late' }));
        if (galfus.platformPumpEvents().some((event) => event.type === 'imeCommit')) {
          throw new Error('IME events were delivered after focus loss');
        }
        galfus.windowSetImeAllowed(windowId, 1);
        if (document.activeElement !== input) throw new Error('IME input did not regain focus');
        galfus.windowClose(windowId);
        windowId = undefined;
        if (input.isConnected) throw new Error('IME input was not removed when the window closed');

        document.body.dataset.status = 'passed';
      } catch (error) {
        document.body.dataset.status = 'failed';
        document.body.dataset.error = error instanceof Error ? error.message : String(error);
        console.error(error);
      } finally {
        try {
          if (windowId !== undefined) galfus.windowClose(windowId);
          if (galfus) galfus.platformShutdown();
        } catch (error) {
          if (document.body.dataset.status === 'passed') {
            document.body.dataset.status = 'failed';
            document.body.dataset.error = error instanceof Error ? error.message : String(error);
          }
          console.error(error);
        }
      }
    </script>
  </body>
</html>`
  );

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const filePath = resolve(testDir, relativePath);

      if (!filePath.startsWith(`${testDir}/`)) {
        return new Response('Forbidden', { status: 403 });
      }

      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response('Not found', { status: 404 });
      }

      return new Response(file);
    }
  });

  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  try {
    await page.goto(`http://127.0.0.1:${server.port}`);
    await page.waitForFunction(() => document.body.dataset.status !== undefined, undefined, {
      timeout: 30_000
    });

    const result = await page.evaluate(() => ({
      status: document.body.dataset.status,
      error: document.body.dataset.error
    }));

    if (result.status !== 'passed') {
      throw new Error(result.error ?? 'The browser SDK smoke test failed');
    }
    if (pageErrors.length > 0) {
      throw new Error(`Unexpected browser page error: ${pageErrors[0]?.message}`);
    }
  } finally {
    await browser.close();
    server.stop();
  }

  console.log('✔ Full Browser/WASM SDK passed the Chromium smoke test.');
}

main().catch((error: unknown) => {
  console.error('✖ Browser/WASM SDK test failed:', error);
  process.exit(1);
});
