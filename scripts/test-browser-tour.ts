/// <reference lib="dom" />

import { chromium } from '@playwright/test';
import { startBrowserTourServer } from '../examples/feature-tour/runners/browser/server.ts';

const isHeadless = process.env.CI === 'true' || process.env.GALFUS_BROWSER_TEST_HEADLESS === 'true';
const visibleDurationMs = isHeadless ? 0 : 5_000;

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function main(): Promise<void> {
  const server = await startBrowserTourServer();
  const browser = await chromium.launch({
    headless: isHeadless,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-angle=swiftshader',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--use-webgpu-adapter=swiftshader'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  try {
    await page.goto(server.url);
    await page.waitForFunction(
      () => document.body.dataset.status === 'running' || document.body.dataset.status === 'failed',
      undefined,
      { timeout: 30_000 }
    );
    const initialization = await page.evaluate(() => ({
      status: document.body.dataset.status,
      error: document.body.dataset.error
    }));
    if (initialization.status !== 'running') {
      throw new Error(
        `Browser tour initialization failed: ${initialization.error ?? 'unknown error'}`
      );
    }
    await page.waitForFunction(
      () => Number(document.body.dataset.renderedFrames ?? '0') >= 3,
      undefined,
      { timeout: 30_000 }
    );
    const canvasSize = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#galfus-browser-tour');
      if (!canvas) throw new Error('Browser tour canvas was not found');
      return { width: canvas.width, height: canvas.height };
    });
    if (canvasSize.width !== 1280 || canvasSize.height !== 900) {
      throw new Error(
        `Browser tour canvas is not fullscreen: ${canvasSize.width}x${canvasSize.height}`
      );
    }

    const initialRoom = await page.locator('body').getAttribute('data-room-index');
    if (initialRoom !== '0') {
      throw new Error(`Expected Room 1 at startup, received room index ${initialRoom}`);
    }

    await page.locator('[data-tour-action="next"]').click();
    await page.waitForFunction(() => document.body.dataset.roomIndex === '1');
    await page.locator('[data-tour-action="pause"]').click();
    await page.waitForFunction(() => document.body.dataset.paused === 'true');

    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#galfus-browser-tour');
      if (!canvas) {
        throw new Error('Browser tour canvas was not found');
      }
      canvas.style.width = '800px';
      canvas.style.height = '450px';
    });
    await page.waitForFunction(() => document.body.dataset.viewport === '800x450');

    const result = await page.evaluate(() => ({
      status: document.body.dataset.status,
      viewport: document.body.dataset.viewport,
      progress: document.querySelector<HTMLProgressElement>('[data-tour-progress]')?.value
    }));
    if (result.status !== 'running' || result.viewport !== '800x450' || !result.progress) {
      throw new Error(`Browser tour state is invalid: ${JSON.stringify(result)}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Unexpected browser page error: ${pageErrors[0]?.message}`);
    }

    if (visibleDurationMs > 0) {
      console.log('✔ Browser feature tour passed. Showing it for 5 seconds.');
      await wait(visibleDurationMs);
    }
  } finally {
    await page
      .evaluate(() => window.dispatchEvent(new Event('galfus-tour-stop')))
      .catch(() => undefined);
    await page
      .waitForFunction(() => document.body.dataset.status === 'stopped', undefined, {
        timeout: 5_000
      })
      .catch(() => undefined);
    await browser.close();
    server.stop();
  }

  console.log('✔ Browser feature tour passed the Chromium smoke test.');
}

main().catch((error: unknown) => {
  console.error('✖ Browser feature tour test failed:', error);
  process.exit(1);
});
