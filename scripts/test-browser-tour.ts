/// <reference lib="dom" />

import { chromium } from '@playwright/test';
import { inflateSync } from 'node:zlib';
import { startBrowserTourServer } from '../examples/feature-tour/runners/browser/server.ts';

const isHeadless = process.env.CI === 'true' || process.env.GALFUS_BROWSER_TEST_HEADLESS === 'true';
const visibleDurationMs = isHeadless ? 0 : 5_000;

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

interface CanvasInspection {
  width: number;
  height: number;
  topColorfulPixels: number;
  bottomColorfulPixels: number;
}

interface DecodedPng {
  width: number;
  height: number;
  pixels: Uint8Array;
  channels: number;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(png: Uint8Array): DecodedPng {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => png[index] === byte)) {
    throw new Error('Browser screenshot is not a PNG image');
  }

  let width = 0;
  let height = 0;
  let channels = 0;
  const compressedBlocks: Uint8Array[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = readUint32(png, offset);
    const type = String.fromCharCode(
      png[offset + 4] ?? 0,
      png[offset + 5] ?? 0,
      png[offset + 6] ?? 0,
      png[offset + 7] ?? 0
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length)
      throw new Error('Browser screenshot contains an invalid PNG chunk');

    if (type === 'IHDR') {
      width = readUint32(png, dataStart);
      height = readUint32(png, dataStart + 4);
      const bitDepth = png[dataStart + 8];
      const colorType = png[dataStart + 9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error('Browser screenshot uses an unsupported PNG format');
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      compressedBlocks.push(png.slice(dataStart, dataEnd));
    }
    offset = dataEnd + 4;
  }

  if (width === 0 || height === 0 || channels === 0 || compressedBlocks.length === 0) {
    throw new Error('Browser screenshot is missing PNG image data');
  }

  const compressedLength = compressedBlocks.reduce((total, block) => total + block.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const block of compressedBlocks) {
    compressed.set(block, compressedOffset);
    compressedOffset += block.length;
  }

  const scanlineLength = width * channels;
  const decompressed = inflateSync(compressed);
  if (decompressed.length !== height * (scanlineLength + 1)) {
    throw new Error('Browser screenshot contains unexpected PNG scanline data');
  }

  const pixels = new Uint8Array(width * height * channels);
  for (let row = 0; row < height; row++) {
    const sourceOffset = row * (scanlineLength + 1);
    const filter = decompressed[sourceOffset] ?? 0;
    const destinationOffset = row * scanlineLength;
    for (let column = 0; column < scanlineLength; column++) {
      const value = decompressed[sourceOffset + column] ?? 0;
      const left = column >= channels ? (pixels[destinationOffset + column - channels] ?? 0) : 0;
      const above = row > 0 ? (pixels[destinationOffset + column - scanlineLength] ?? 0) : 0;
      const upperLeft =
        row > 0 && column >= channels
          ? (pixels[destinationOffset + column - scanlineLength - channels] ?? 0)
          : 0;
      const prediction =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : filter === 4
                  ? paethPredictor(left, above, upperLeft)
                  : Number.NaN;
      if (!Number.isFinite(prediction))
        throw new Error('Browser screenshot uses an invalid PNG filter');
      pixels[destinationOffset + column] = (value + prediction) & 0xff;
    }
  }

  return { width, height, pixels, channels };
}

function inspectCanvas(screenshot: Uint8Array): CanvasInspection {
  const { width, height, pixels, channels } = decodePng(screenshot);
  const countColorfulPixels = (startRow: number, endRow: number): number => {
    let count = 0;
    for (let row = startRow; row < endRow; row += 16) {
      for (let column = 0; column < width; column += 16) {
        const index = (row * width + column) * channels;
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        const brightest = Math.max(red, green, blue);
        const darkest = Math.min(red, green, blue);
        if (brightest > 80 && brightest - darkest > 20) count++;
      }
    }
    return count;
  };

  return {
    width,
    height,
    topColorfulPixels: countColorfulPixels(
      Math.min(96, Math.floor(height / 2)),
      Math.floor(height / 2)
    ),
    bottomColorfulPixels: countColorfulPixels(Math.floor(height / 2), height)
  };
}

async function waitForRenderedCanvas(
  page: import('@playwright/test').Page
): Promise<CanvasInspection> {
  let inspection = inspectCanvas(await page.screenshot());
  for (let attempt = 0; attempt < 20; attempt++) {
    if (inspection.topColorfulPixels >= 5 && inspection.bottomColorfulPixels >= 5) {
      return inspection;
    }
    await page.waitForTimeout(100);
    inspection = inspectCanvas(await page.screenshot());
  }
  return inspection;
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

    const initialCanvas = await waitForRenderedCanvas(page);
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
