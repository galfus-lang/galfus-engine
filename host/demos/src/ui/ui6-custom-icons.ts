import { type MultiverseRuntime, SpriteSheet } from '@galfus/engine';
import { UiIconAtlas } from '@galfus/ui';

const FRAME_SIZE = 24;
const FRAME_COUNT = 8;

/** A small application-owned atlas showing a check mark progressively drawn. */
export function createUi6CustomIcons(runtime: MultiverseRuntime) {
  const width = FRAME_SIZE * FRAME_COUNT;
  const pixels = new Uint8Array(width * FRAME_SIZE * 4);
  const path: readonly [number, number][] = [
    [6, 12],
    [7, 13],
    [8, 14],
    [9, 15],
    [10, 16],
    [11, 15],
    [12, 14],
    [13, 13],
    [14, 12],
    [15, 11],
    [16, 10],
    [17, 9],
    [18, 8]
  ];
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const visiblePath = path.slice(0, Math.ceil((frame / (FRAME_COUNT - 1)) * path.length));
    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE; x++) {
        const border =
          ((x === 4 || x === 5 || x === 18 || x === 19) && y >= 4 && y <= 19) ||
          ((y === 4 || y === 5 || y === 18 || y === 19) && x >= 4 && x <= 19);
        const mark = visiblePath.some(([px, py]) => Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1);
        if (!border && !mark) continue;
        const offset = (y * width + frame * FRAME_SIZE + x) * 4;
        pixels[offset] = border ? 120 : 255;
        pixels[offset + 1] = border ? 210 : 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = 255;
      }
    }
  }
  const textureId = runtime.resources.createTexture(pixels, {
    label: 'ui6-custom-checkbox',
    width,
    height: FRAME_SIZE,
    format: 'rgba8UnormSrgb'
  });
  try {
    const sheet = new SpriteSheet({
      textureId,
      textureSize: [width, FRAME_SIZE],
      grid: { columns: FRAME_COUNT, rows: 1, frameSize: [FRAME_SIZE, FRAME_SIZE] }
    });
    const atlas = new UiIconAtlas(sheet, {
      checkbox: {
        states: { unchecked: 0, checked: 7 },
        transitions: {
          'unchecked|checked': { frames: [1, 2, 3, 4, 5, 6, 7], frameDuration: 0.06 },
          'checked|unchecked': { frames: [6, 5, 4, 3, 2, 1, 0], frameDuration: 0.06 }
        }
      }
    });
    return { atlas, dispose: () => runtime.resources.disposeTexture(textureId) };
  } catch (error) {
    runtime.resources.disposeTexture(textureId);
    throw error;
  }
}
