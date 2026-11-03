/** Procedural RGBA texture generators for demos and particle systems. */

/** Generates a 64x64 4-point star / diamond flare RGBA texture for particle emitters. */
export function createStarFlareTexture(size = 64): {
  pixels: Uint8Array;
  width: number;
  height: number;
} {
  const pixels = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - half) / half;
      const ny = (y - half) / half;
      const dist = Math.hypot(nx, ny);
      const ax = Math.abs(nx);
      const ay = Math.abs(ny);
      // 4-point star cross + diagonal spikes + central core
      const cross = Math.max(
        Math.exp(-ay * 6.0) * Math.max(0, 1.0 - ax),
        Math.exp(-ax * 6.0) * Math.max(0, 1.0 - ay)
      );
      const diag =
        0.5 *
        Math.max(
          Math.exp(-Math.abs(nx - ny) * 8.0) * Math.max(0, 1.0 - dist),
          Math.exp(-Math.abs(nx + ny) * 8.0) * Math.max(0, 1.0 - dist)
        );
      const core = Math.max(0, 1.0 - dist * 1.6) ** 2;
      const alpha = Math.min(1.0, Math.max(core, cross, diag) * Math.max(0, 1.0 - dist));
      const idx = (y * size + x) * 4;
      const brightness = Math.min(1.0, 0.7 + core * 0.5);
      pixels[idx] = Math.round(brightness * 255);
      pixels[idx + 1] = Math.round(brightness * 255);
      pixels[idx + 2] = Math.round(255);
      pixels[idx + 3] = Math.round(alpha * 255);
    }
  }
  return { pixels, width: size, height: size };
}

/** Generates a 2x2 UV atlas texture (star, ring, diamond, soft disc) to test particle uvRect selection. */
export function createParticleAtlasTexture(cellSize = 64): {
  pixels: Uint8Array;
  width: number;
  height: number;
} {
  const width = cellSize * 2;
  const height = cellSize * 2;
  const pixels = new Uint8Array(width * height * 4);
  const half = (cellSize - 1) * 0.5;

  for (let cy = 0; cy < 2; cy++) {
    for (let cx = 0; cx < 2; cx++) {
      const cellIndex = cy * 2 + cx;
      for (let y = 0; y < cellSize; y++) {
        for (let x = 0; x < cellSize; x++) {
          const nx = (x - half) / half;
          const ny = (y - half) / half;
          const dist = Math.hypot(nx, ny);
          let alpha = 0;
          if (cellIndex === 0) {
            // Top-Left [0, 0, 0.5, 0.5]: 4-point Star
            const ax = Math.abs(nx);
            const ay = Math.abs(ny);
            const cross = Math.max(
              Math.exp(-ay * 6.5) * Math.max(0, 1 - ax),
              Math.exp(-ax * 6.5) * Math.max(0, 1 - ay)
            );
            const core = Math.max(0, 1 - dist * 1.5) ** 2;
            alpha = Math.min(1, Math.max(cross, core) * Math.max(0, 1 - dist));
          } else if (cellIndex === 1) {
            // Top-Right [0.5, 0, 1.0, 0.5]: Hollow Shockwave Ring
            const ring = Math.exp(-((dist - 0.62) ** 2) * 36.0);
            alpha = dist <= 1.0 ? ring : 0;
          } else if (cellIndex === 2) {
            // Bottom-Left [0, 0.5, 0.5, 1.0]: Sharp Diamond Crystal
            const manhattan = Math.abs(nx) + Math.abs(ny);
            alpha = Math.max(0, 1.0 - manhattan);
          } else {
            // Bottom-Right [0.5, 0.5, 1.0, 1.0]: Soft Smoke Puff
            alpha = Math.max(0, 1.0 - dist) ** 1.8;
          }
          const px = cx * cellSize + x;
          const py = cy * cellSize + y;
          const idx = (py * width + px) * 4;
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
        }
      }
    }
  }
  return { pixels, width, height };
}

/** Generates a procedural checkerboard RGBA texture. */
export function createCheckerTexture(
  size = 64,
  colorA: [number, number, number, number] = [255, 255, 255, 255],
  colorB: [number, number, number, number] = [40, 50, 70, 255],
  cellSize = 8
): { pixels: Uint8Array; width: number; height: number } {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const isEven = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      const c = isEven ? colorA : colorB;
      pixels[idx] = c[0];
      pixels[idx + 1] = c[1];
      pixels[idx + 2] = c[2];
      pixels[idx + 3] = c[3];
    }
  }
  return { pixels, width: size, height: size };
}

/** Convenience helper returning raw RGBA8 checkerboard bytes. */
export function createCheckerboardRGBA8(size = 256, cellSize = 32): Uint8Array {
  return createCheckerTexture(size, [255, 255, 255, 255], [40, 50, 70, 255], cellSize).pixels;
}
