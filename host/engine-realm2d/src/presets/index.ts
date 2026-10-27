import type { Camera2DDesc, Shape2DDesc } from '@galfus/transport-types';

/** Ready-to-use 2D presets. */

export function createPixelPerfectCamera2D(orthoScale = 1.0): Camera2DDesc {
  return {
    orthoScale,
    near: -1000,
    far: 1000
  };
}

export function createDefaultBoxShape2D(width = 32, height = 32): Shape2DDesc {
  return {
    kind: 'rectangle',
    size: [width, height]
  };
}
