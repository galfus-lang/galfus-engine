import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { homedir } from 'os';
import { resolve } from 'path';
import { chromium } from '@playwright/test';

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
const visibleDurationMs = isHeadless ? 0 : 5_000;

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

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
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
    <style>
      #galfus-browser-sdk-test { width: 640px; height: 360px; }
    </style>
  </head>
  <body>
    <canvas id="galfus-browser-sdk-test" width="640" height="360"></canvas>
    <script type="module">
      import init, { GalfusBrowser } from './pkg/galfus_browser.js';
      import { initializeGalfusBrowser } from './galfus-sdk.js';

      try {
        const galfus = await initializeGalfusBrowser({ default: init, GalfusBrowser });
        const windowId = galfus.createWindow({
          id: 42,
          title: 'Galfus Browser SDK Test',
          size: [640, 360],
          canvasId: 'galfus-browser-sdk-test',
          resizable: true
        });
        const capabilities = galfus.getCapabilities();
        const size = galfus.windowGetSize(windowId);
        const events = galfus.pumpEvents();
        galfus.setWindowTitle(windowId, 'Galfus Browser SDK Test Updated');
        const canvas = document.getElementById('galfus-browser-sdk-test');
        await galfus.renderDiagnosticCube('galfus-browser-sdk-test', 0);
        await new Promise(requestAnimationFrame);

        if (!capabilities || typeof capabilities !== 'object') {
          throw new Error('getCapabilities() did not return an object');
        }
        if (size[0] !== 640 || size[1] !== 360) {
          throw new Error('windowGetSize() did not return the configured dimensions');
        }
        if (!Array.isArray(events)) {
          throw new Error('pumpEvents() did not return an array');
        }

        canvas.style.width = '800px';
        canvas.style.height = '450px';
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);

        const resizedSize = galfus.windowGetSize(windowId);
        const resizeEvents = galfus.pumpEvents();
        await galfus.renderDiagnosticCube('galfus-browser-sdk-test', 0.1);
        await new Promise(requestAnimationFrame);
        await galfus.renderDiagnosticCube('galfus-browser-sdk-test', 0.2);

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
          throw new Error('pumpEvents() did not report the canvas resize');
        }

        const image = new Image();
        image.src = canvas.toDataURL();
        await image.decode();
        if (image.width !== 800 || image.height !== 450) {
          throw new Error('Diagnostic renderer did not use the resized canvas viewport');
        }
        const probe = document.createElement('canvas');
        probe.width = image.width;
        probe.height = image.height;
        const context = probe.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
        let colorfulPixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          if (Math.max(red, green, blue) > 100 && Math.max(red, green, blue) - Math.min(red, green, blue) > 30) {
            colorfulPixels += 1;
          }
        }
        if (colorfulPixels < 100) {
          throw new Error(
            'Diagnostic cube pixels were not present on the canvas (' +
              image.width + 'x' + image.height + ', ' + colorfulPixels + ' colorful pixels)'
          );
        }

        async function animate(timestamp) {
          try {
            await galfus.renderDiagnosticCube('galfus-browser-sdk-test', timestamp / 1000);
            requestAnimationFrame(animate);
          } catch (error) {
            document.body.dataset.status = 'failed';
            document.body.dataset.error = error instanceof Error ? error.message : String(error);
            console.error(error);
          }
        }
        requestAnimationFrame(animate);

        galfus.closeWindow(windowId);

        document.body.dataset.status = 'passed';
      } catch (error) {
        document.body.dataset.status = 'failed';
        document.body.dataset.error = error instanceof Error ? error.message : String(error);
        console.error(error);
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
    await page.waitForFunction(() => {
      const browserDocument = (
        globalThis as unknown as {
          document: { body: { dataset: Record<string, string | undefined> } };
        }
      ).document;
      return browserDocument.body.dataset.status !== undefined;
    });

    const result = await page.evaluate(() => ({
      status: (
        globalThis as unknown as {
          document: { body: { dataset: Record<string, string | undefined> } };
        }
      ).document.body.dataset.status,
      error: (
        globalThis as unknown as {
          document: { body: { dataset: Record<string, string | undefined> } };
        }
      ).document.body.dataset.error
    }));

    if (result.status !== 'passed') {
      throw new Error(result.error ?? 'The browser SDK smoke test failed');
    }
    if (pageErrors.length > 0) {
      throw new Error(`Unexpected browser page error: ${pageErrors[0]?.message}`);
    }

    if (visibleDurationMs > 0) {
      console.log('✔ Browser/WASM SDK test passed. Showing the animated cube for 5 seconds.');
      await wait(visibleDurationMs);

      const animationResult = await page.evaluate(() => ({
        status: (
          globalThis as unknown as {
            document: { body: { dataset: Record<string, string | undefined> } };
          }
        ).document.body.dataset.status,
        error: (
          globalThis as unknown as {
            document: { body: { dataset: Record<string, string | undefined> } };
          }
        ).document.body.dataset.error
      }));
      if (animationResult.status !== 'passed') {
        throw new Error(animationResult.error ?? 'The diagnostic cube animation failed');
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }

  console.log('✔ Browser/WASM SDK initialized and passed the Chromium smoke test.');
}

main().catch((error: unknown) => {
  console.error('✖ Browser/WASM SDK test failed:', error);
  process.exit(1);
});
