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
    const progress = frame / (FRAME_COUNT - 1);
    const visiblePath = path.slice(0, Math.floor(progress * path.length));
    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE; x++) {
        const qx = Math.abs(x + 0.5 - 12) - 4.6;
        const qy = Math.abs(y + 0.5 - 12) - 4.6;
        const d =
          Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 3.2;
        if (d > 0) continue;
        const border = d > -1.6;
        const mark =
          frame > 0 && visiblePath.some(([px, py]) => Math.hypot(x - px, y - py) <= 1.25);
        const offset = (y * width + frame * FRAME_SIZE + x) * 4;
        if (mark) {
          pixels[offset] = 255;
          pixels[offset + 1] = 255;
          pixels[offset + 2] = 255;
          pixels[offset + 3] = 255;
        } else if (border) {
          pixels[offset] = Math.round(140 - progress * 64);
          pixels[offset + 1] = Math.round(172 - progress * 16);
          pixels[offset + 2] = Math.round(208 + progress * 47);
          pixels[offset + 3] = 255;
        } else {
          pixels[offset] = Math.round(20 + progress * 22);
          pixels[offset + 1] = Math.round(32 + progress * 96);
          pixels[offset + 2] = Math.round(48 + progress * 198);
          pixels[offset + 3] = 245;
        }
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
