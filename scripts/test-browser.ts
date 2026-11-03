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

  run([
    'bun',
    'build',
    'host/engine/src/text/index.ts',
    '--target',
    'browser',
    '--outfile',
    resolve(testDir, 'text-encoding.js')
  ]);
  run([
    'bun',
    'build',
    'host/engine/src/runtime.ts',
    '--target',
    'browser',
    '--outfile',
    resolve(testDir, 'host-runtime.js')
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
      import { TextEditor, TextEncoding } from './text-encoding.js';
      import { createRuntime } from './host-runtime.js';

      let galfus;
      let windowId;
      try {
        const encoding = new TextEncoding();
        if (encoding.decode(encoding.encode('é漢')) !== 'é漢') throw new Error('UTF-8 conversion failed');
        encoding.setCharset('shift_jis');
        const encoded = encoding.encode('日本');
        if (Array.from(encoded).join(',') !== '147,250,150,123' || encoding.decode(encoded) !== '日本') {
          throw new Error('Shift JIS conversion failed');
        }
        const editor = new TextEditor('a👩‍👩‍👧‍👦e\u0301');
        editor.move('left');
        editor.backspace();
        if (editor.value !== 'ae\u0301') throw new Error('Unicode grapheme editing failed');
        for (const value of ['🇧🇷', '👍🏽', 'क्ष']) {
          const sample = new TextEditor(value);
          sample.backspace();
          if (sample.value !== '') throw new Error('Unicode grapheme parity failed');
        }
        galfus = await initializeGalfusBrowser({ ...wasm, default: init });
        galfus.platformInit();
        galfus.realm2dCreate(77);
        galfus.realm2dCreateSvg(77, 1, {
          source: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><text id="text" x="3" y="20">A é אב</text></svg>'
        }, { position: [0, 0] });
        const browserLayout = galfus.realm2dGetSvgTextLayout(77, 1, 'text').layout;
        if (!browserLayout || browserLayout.chunks[0] !== 'A é אב' || !browserLayout.clusters.some((cluster) => cluster.rightToLeft)) {
          throw new Error('Browser SVG text cluster layout failed');
        }
        galfus.realm2dDestroy(77);
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

        const canvasRect = canvas.getBoundingClientRect();
        const pointerOptions = { pointerType: 'mouse', pointerId: 1, clientX: canvasRect.left + 80, clientY: canvasRect.top + 45, button: 0 };
        canvas.dispatchEvent(new PointerEvent('pointerenter', pointerOptions));
        canvas.dispatchEvent(new PointerEvent('pointerdown', pointerOptions));
        canvas.dispatchEvent(new PointerEvent('pointerup', pointerOptions));
        const pointerEvents = galfus.platformPumpEvents().filter((event) => event.kind === 'pointer');
        if (pointerEvents.map((event) => event.type).join(',') !== 'enter,button,button' ||
            pointerEvents[1].state !== 'pressed' || pointerEvents[2].state !== 'released' ||
            Math.abs(pointerEvents[0].position[0] - 80) > 0.01 || Math.abs(pointerEvents[0].position[1] - 45) > 0.01) {
          throw new Error('Canvas pointer events were not normalized');
        }
        const secondCanvas = document.createElement('canvas');
        secondCanvas.id = 'second-canvas';
        secondCanvas.style.width = '100px';
        secondCanvas.style.height = '100px';
        document.body.appendChild(secondCanvas);
        const secondWindow = galfus.windowCreate({ id: 43, title: 'Second', size: [100, 100], canvasId: 'second-canvas' });
        secondCanvas.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 10, clientY: 10 }));
        canvas.dispatchEvent(new PointerEvent('pointermove', pointerOptions));
        secondCanvas.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 11, clientY: 10 }));
        const multiWindow = galfus.platformPumpEvents().filter((event) => event.kind === 'pointer');
        if (multiWindow.map((event) => event.windowId).join(',') !== '43,42,43') {
          throw new Error('Input event order was not preserved between windows');
        }
        galfus.windowClose(secondWindow);
        secondCanvas.remove();
        canvas.blur();
        galfus.windowRequestInputFocus(windowId);
        if (document.activeElement !== canvas) throw new Error('Canvas input focus request failed');
        galfus.windowSetTabCapture(windowId, 1);
        const capturedTab = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', cancelable: true });
        canvas.dispatchEvent(capturedTab);
        if (!capturedTab.defaultPrevented || !galfus.platformPumpEvents().some((event) => event.type === 'input' && event.logicalKey === 'Tab')) {
          throw new Error('Canvas Tab capture failed');
        }
        galfus.windowSetTabCapture(windowId, 0);
        const releasedTab = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', cancelable: true });
        canvas.dispatchEvent(releasedTab);
        if (releasedTab.defaultPrevented) throw new Error('Canvas Tab was captured after release');
        galfus.platformPumpEvents();

        galfus.windowSetImeAllowed(windowId, 1);
        galfus.windowSetImeCursorArea(windowId, 40, 50, 2, 20);
        const input = document.activeElement;
        if (!(input instanceof HTMLTextAreaElement)) throw new Error('IME input was not focused');
        input.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
        input.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'かな' }));
        input.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'かな', isComposing: true }));
        input.dispatchEvent(new CompositionEvent('compositionend', { data: '漢字' }));
        input.dispatchEvent(new InputEvent('input', { inputType: 'insertFromComposition', data: '漢字' }));
        const imeEvents = galfus.platformPumpEvents().filter((event) => event.kind === 'keyboard');
        if (imeEvents.map((event) => event.type).join(',') !== 'imeEnabled,imePreedit,imePreedit,imeCommit,textInput' || imeEvents[1].text !== 'かな' || imeEvents[3].text !== '漢字' || imeEvents[4].text !== '漢字') {
          throw new Error('IME composition events were not delivered in order');
        }
        galfus.windowSetTabCapture(windowId, 1);
        const imeTab = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', cancelable: true });
        input.dispatchEvent(imeTab);
        if (!imeTab.defaultPrevented || !galfus.platformPumpEvents().some((event) => event.type === 'input' && event.logicalKey === 'Tab')) {
          throw new Error('IME Tab capture failed');
        }
        galfus.windowSetTabCapture(windowId, 0);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
        canvas.dispatchEvent(new PointerEvent('pointermove', pointerOptions));
        const orderedInput = galfus.platformPumpEvents();
        const key = orderedInput.find((event) => event.type === 'input');
        if (orderedInput[0]?.kind !== 'keyboard' || orderedInput[1]?.kind !== 'pointer') {
          throw new Error('Browser input event order was not preserved');
        }
        if (!key || key.text !== 'a' || key.physicalKey !== 'keyA') {
          throw new Error('Keyboard input was not delivered while IME was enabled');
        }
        input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'a' }));
        input.value = 'text pasted';
        input.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' }));
        const inserted = galfus.platformPumpEvents().filter((event) => event.type === 'textInput');
        if (inserted.length !== 2 || inserted[0].text !== 'a' || inserted[1].text !== 'text pasted') {
          throw new Error('Committed keyboard and paste input were not delivered');
        }
        galfus.windowSetImeAllowed(windowId, 0);
        if (!galfus.platformPumpEvents().some((event) => event.type === 'imeDisabled')) {
          throw new Error('IME disable event was not delivered');
        }
        galfus.windowSetImeAllowed(windowId, 1);
        galfus.platformPumpEvents();
        input.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
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
        input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'b' }));
        if (!galfus.platformPumpEvents().some((event) => event.type === 'textInput' && event.text === 'b')) {
          throw new Error('Text input did not resume after cancelling composition');
        }
        galfus.windowSetImeAllowed(windowId, 0);
        galfus.platformPumpEvents();
        const schedule = { targetBlocks: [{ targetId: 1, invocations: [{ invocationId: 1, realmId: 1, resolvedViewport: [0, 0, 800, 450], zIndex: 0, filters: [] }] }] };
        const engine = new Proxy({
          platformPumpEvents: () => galfus.platformPumpEvents().map((event) => event.windowId === windowId ? { ...event, windowId: 1 } : event),
          multiverseResolve: () => schedule,
          windowSetTabCapture: (_id, enabled) => galfus.windowSetTabCapture(windowId, enabled),
          windowRequestInputFocus: () => galfus.windowRequestInputFocus(windowId),
          windowSetImeAllowed: (_id, enabled) => galfus.windowSetImeAllowed(windowId, enabled),
          realm2dGetSvgElementRect: () => ({ rect: { x: 0, y: 0, width: 100, height: 100, viewportWidth: 100, viewportHeight: 100 } })
        }, { get: (target, key) => key in target ? target[key] : () => {} });
        let frame;
        const transport = { engine, isInitialized: true, isDisposed: false, isRunning: false, startLoop: (callback) => { frame = callback; }, stopLoop: () => {}, dispose: () => {} };
        const runtime = createRuntime(transport);
        const hostWindow = runtime.platform.window.create();
        const realm = runtime.createRealm2D(1);
        realm.createCamera({ orthoScale: 10 });
        const hostTarget = runtime.multiverse.createTarget({ kind: { type: 'window', windowId: hostWindow } });
        runtime.multiverse.createInvocation({ realmId: 1, targetId: hostTarget });
        const first = realm.createSpatialNode({ position: [-1, 0] });
        const second = realm.createSpatialNode({ position: [1, 0] });
        realm.addCollider(first, { type: 'circle', radius: 0.5 });
        realm.addCollider(second, { type: 'circle', radius: 0.5 });
        const firstFocus = runtime.focusable(1, { type: 'collider', entityId: first });
        const secondFocus = runtime.focusable(1, { type: 'collider', entityId: second });
        runtime.start();
        let frameId = 0;
        const tick = () => frame({ frameId: ++frameId, timeMs: frameId * 16, deltaMs: 16, dt: 0.016, fps: 62.5 });
        tick();
        const hitFirst = { pointerType: 'mouse', pointerId: 1, clientX: canvasRect.left + 355, clientY: canvasRect.top + 225, button: 0 };
        canvas.dispatchEvent(new PointerEvent('pointermove', hitFirst));
        canvas.dispatchEvent(new PointerEvent('pointerdown', hitFirst));
        tick();
        if (runtime.getFocused(hostWindow) !== firstFocus) throw new Error('Browser pointer did not focus the host target');
        const captured = [];
        firstFocus.listener.on('pressmove', () => captured.push('move'));
        firstFocus.listener.on('pressup', () => captured.push('up'));
        const outsideFirst = { ...hitFirst, clientX: canvasRect.left + 700 };
        canvas.dispatchEvent(new PointerEvent('pointermove', outsideFirst));
        canvas.dispatchEvent(new PointerEvent('pointerup', outsideFirst));
        tick();
        if (captured.join(',') !== 'move,up') throw new Error('Browser pressed target did not receive movement and release outside its hit area');
        const hostTab = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', cancelable: true });
        canvas.dispatchEvent(hostTab);
        tick();
        if (!hostTab.defaultPrevented || runtime.getFocused(hostWindow) !== secondFocus) throw new Error('Browser Tab did not advance host focus');
        const svg = realm.createSvg({ source: '<svg/>', dimensions: [4, 4] });
        const textInput = runtime.textInput(1, { svgId: svg.svgId, elementId: 'text', value: 'a' });
        tick();
        if (!textInput.requestFocus(hostWindow) || document.activeElement !== input) throw new Error('SVG input did not activate the browser IME');
        input.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
        input.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'かな' }));
        tick();
        if (textInput.value !== 'a' || textInput.displayValue !== 'aかな') throw new Error('SVG input did not display the IME preview');
        input.dispatchEvent(new CompositionEvent('compositionend', { data: '仮名' }));
        tick();
        if (textInput.value !== 'a仮名') throw new Error('SVG input did not commit the IME text');
        textInput.dispose();
        runtime.dispose();
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
