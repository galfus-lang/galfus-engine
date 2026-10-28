import { describe, expect, it } from 'bun:test';
import { copyFile, mkdir, rm, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { chromium } from '@playwright/test';

describe('@galfus/transport-browser', () => {
  it('should initialize, create window on canvas, and drive rAF frame loop via Playwright', async () => {
    const rootDir = resolve(import.meta.dir, '../../..');
    const testDir = resolve(rootDir, '.tmp/test-transport-browser');
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });

    // 1. Copy compiled wasm artifacts into test staging directory
    const distDir = resolve(rootDir, 'host/transport-browser/dist');
    await copyFile(resolve(distDir, 'galfus_browser.js'), resolve(testDir, 'galfus_browser.js'));
    await copyFile(
      resolve(distDir, 'galfus_browser_bg.wasm'),
      resolve(testDir, 'galfus_browser_bg.wasm')
    );

    // 2. Bundle the transport entrypoint for browser execution
    const buildResult = await Bun.build({
      entrypoints: [resolve(rootDir, 'host/transport-browser/src/index.ts')],
      outdir: testDir,
      naming: 'bundle.js',
      target: 'browser',
      format: 'esm'
    });

    if (!buildResult.success) {
      throw new Error(
        `Failed to bundle transport-browser: ${buildResult.logs.map((l) => l.message).join('\n')}`
      );
    }

    // 3. Write HTML test harness
    await writeFile(
      resolve(testDir, 'index.html'),
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Galfus Browser Transport Test</title>
    <style>#canvas-test { width: 640px; height: 480px; }</style>
  </head>
  <body>
    <canvas id="canvas-test" width="640" height="480"></canvas>
    <script type="module">
      import init, * as wasm from './galfus_browser.js';
      import { createBrowserTransport } from './bundle.js';

      window.__RUN_TEST__ = async () => {
        const transport = createBrowserTransport({ ...wasm, default: init });
        await transport.init();

        const caps = transport.engine.platformGetCapabilities();
        if (!caps || typeof caps !== 'object') {
          throw new Error('platformGetCapabilities() did not return valid object');
        }

        const windowId = transport.engine.windowCreate({
          id: 1,
          title: 'Browser Transport Test',
          size: [640, 480],
          canvasId: 'canvas-test'
        });

        // Test Multiverse bindings in browser WASM
        const engine = transport.engine;
        engine.multiverseCreateTarget(1, {
          kind: { type: 'window', windowId }
        });
        engine.multiverseRegisterColorRealm(10, 0.1, 0.2, 0.3, 1.0);
        engine.multiverseCreateInvocation(100, {
          realmId: 10,
          targetId: 1,
          viewport: { width: { px: 640 }, height: { px: 480 } }
        });
        const schedule = engine.multiverseResolve();
        if (!schedule || !Array.isArray(schedule.targetBlocks)) {
          throw new Error('multiverseResolve did not return targetBlocks array');
        }

        // Test 2D and 3D Realm bindings in browser WASM
        engine.realm2dCreate(20);
        engine.realm2dCreateCamera(20, 201, { orthoScale: 1.0 }, { position: [0, 0] });
        engine.realm2dDestroy(20);

        engine.realm3dCreate(30);
        engine.realm3dCreateCube(30, 301, 1.0);
        engine.realm3dDestroyGeometry(30, 301);
        engine.realm3dDestroy(30);

        let framesCount = 0;
        await new Promise((resolveLoop, rejectLoop) => {
          const timeout = setTimeout(() => rejectLoop(new Error('Loop timeout after 5s')), 5000);
          transport.startLoop((timing) => {
            framesCount++;
            if (framesCount >= 3) {
              clearTimeout(timeout);
              transport.stopLoop();
              resolveLoop();
            }
          });
        });

        engine.multiverseDestroyInvocation(100);
        engine.multiverseUnregisterRealm(10);
        engine.multiverseDestroyTarget(1);
        transport.engine.windowClose(windowId);
        transport.dispose();

        return {
          success: true,
          framesCount,
          caps
        };
      };

      document.body.dataset.ready = 'true';
    </script>
  </body>
</html>`,
      'utf-8'
    );

    // 4. Start local HTTP server
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const file = Bun.file(resolve(testDir, filename));
        if (await file.exists()) {
          return new Response(file);
        }
        return new Response('Not Found', { status: 404 });
      }
    });

    // 5. Launch Playwright Chromium
    const browser = await chromium.launch({
      headless: true,
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
    });

    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => {
        console.error('[BROWSER_ERROR]', err);
        pageErrors.push(err.message);
      });
      page.on('console', (msg) => {
        console.log('[BROWSER_LOG]', msg.type(), msg.text());
      });

      await page.goto(`http://127.0.0.1:${server.port}`);
      await page.waitForFunction(() => document.body.dataset.ready === 'true', undefined, {
        timeout: 10_000
      });

      const result = await page.evaluate(async () => {
        // @ts-ignore
        return window.__RUN_TEST__();
      });

      expect(pageErrors.length).toBe(0);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.framesCount).toBeGreaterThanOrEqual(3);
      expect(result.caps).toBeDefined();
    } finally {
      await browser.close();
      server.stop();
      await rm(testDir, { recursive: true, force: true });
    }
  }, 20_000); // Timeout de 20s para o teste do browser
});
