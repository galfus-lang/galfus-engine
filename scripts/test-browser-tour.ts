/// <reference lib="dom" />

import { chromium } from '@playwright/test';
import { startBrowserTourServer } from '../examples/feature-tour/runners/browser/server.ts';

const isHeadless = process.env.CI === 'true' || process.env.GALFUS_BROWSER_TEST_HEADLESS === 'true';
const visibleDurationMs = isHeadless ? 0 : 5_000;

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function inspectCanvas(page: import('@playwright/test').Page): Promise<{
  width: number;
  height: number;
  topColorfulPixels: number;
  bottomColorfulPixels: number;
}> {
  return page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('#galfus-browser-tour');
    if (!canvas) {
      throw new Error('Browser tour canvas was not found');
    }

    const image = new Image();
    image.src = canvas.toDataURL();
    await image.decode();
    const probe = document.createElement('canvas');
    probe.width = image.width;
    probe.height = image.height;
    const context = probe.getContext('2d');
    if (!context) {
      throw new Error('Unable to inspect the browser tour canvas');
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;

    const countColorfulPixels = (startRow: number, endRow: number): number => {
      let count = 0;
      for (let row = startRow; row < endRow; row += 16) {
        for (let column = 0; column < probe.width; column += 16) {
          const index = (row * probe.width + column) * 4;
          const red = pixels[index] ?? 0;
          const green = pixels[index + 1] ?? 0;
          const blue = pixels[index + 2] ?? 0;
          const brightest = Math.max(red, green, blue);
          const darkest = Math.min(red, green, blue);
          if (brightest > 80 && brightest - darkest > 20) {
            count++;
          }
        }
      }
      return count;
    };

    return {
      width: image.width,
      height: image.height,
      topColorfulPixels: countColorfulPixels(0, Math.floor(image.height / 2)),
      bottomColorfulPixels: countColorfulPixels(Math.floor(image.height / 2), image.height)
    };
  });
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
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );

    const initialCanvas = await inspectCanvas(page);
    if (initialCanvas.width !== 1280 || initialCanvas.height !== 900) {
      throw new Error(
        `Browser tour canvas is not fullscreen: ${initialCanvas.width}x${initialCanvas.height}`
      );
    }
    if (initialCanvas.topColorfulPixels < 5 || initialCanvas.bottomColorfulPixels < 5) {
      throw new Error(`Browser tour did not render both realms: ${JSON.stringify(initialCanvas)}`);
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
