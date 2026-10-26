/** Deterministic procedural assets used by the feature tour. */

/**
 * Deterministic pseudo-random number generator (LCG).
 */
export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextFloat(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return (this.state >>> 8) / 16777216.0;
  }
}

/**
 * Returns deterministic room palette colors.
 */
export function makePalette(roomIndex: number): {
  primary: [number, number, number, number];
  secondary: [number, number, number, number];
  accent: [number, number, number, number];
} {
  const hues = [0.6, 0.12, 0.02, 0.16, 0.38, 0.55, 0.8, 0.45, 0.72, 0.15];
  const h = hues[roomIndex % hues.length] ?? 0.5;

  const toRgb = (hue: number, sat: number, lit: number): [number, number, number, number] => {
    const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
    const p = 2 * lit - q;
    const hue2rgb = (t: number) => {
      let tNorm = t;
      if (tNorm < 0) tNorm += 1;
      if (tNorm > 1) tNorm -= 1;
      if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
      if (tNorm < 1 / 2) return q;
      if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
      return p;
    };
    return [hue2rgb(hue + 1 / 3), hue2rgb(hue), hue2rgb(hue - 1 / 3), 1.0];
  };

  return {
    primary: toRgb(h, 0.85, 0.6),
    secondary: toRgb((h + 0.3) % 1.0, 0.8, 0.55),
    accent: toRgb((h + 0.6) % 1.0, 0.9, 0.7)
  };
}

/**
 * Generates deterministic procedural RGBA texture pixels (64x64 checker / grid).
 */
export function makeTexture(
  seed: number,
  recipe?: { width?: number; height?: number; tileSize?: number }
): { width: number; height: number; data: Uint8Array } {
  const width = recipe?.width ?? 64;
  const height = recipe?.height ?? 64;
  const tileSize = recipe?.tileSize ?? 8;
  const buffer = new Uint8Array(width * height * 4);
  const rng = new DeterministicRng(seed);

  const baseHue = rng.nextFloat();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isAlt = ((x / tileSize) | 0) % 2 === ((y / tileSize) | 0) % 2;
      const idx = (y * width + x) * 4;
      const brightness = isAlt ? 220 : 70;
      buffer[idx + 0] = Math.min(255, (brightness * (0.6 + baseHue * 0.4)) | 0);
      buffer[idx + 1] = Math.min(255, (brightness * (0.7 + (1 - baseHue) * 0.3)) | 0);
      buffer[idx + 2] = brightness;
      buffer[idx + 3] = 255;
    }
  }

  return { width, height, data: buffer };
}

/**
 * Synthesizes a deterministic 16-bit PCM WAV audio buffer (harmonic chime).
 */
export function makeSound(seed: number, freq = 440.0, durationSecs = 1.0): Uint8Array {
  const sampleRate = 44100;
  const numSamples = (sampleRate * durationSecs) | 0;
  const byteRate = sampleRate * 2;
  const dataSize = numSamples * 2;
  const totalSize = 44 + dataSize;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // RIFF header
  buffer.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  buffer.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // "fmt " chunk
  buffer.set([0x66, 0x6d, 0x74, 0x20], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // "data" chunk
  buffer.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-3.5 * t);
    const wave =
      0.6 * Math.sin(2.0 * Math.PI * freq * t) +
      0.3 * Math.sin(3.0 * Math.PI * freq * t) +
      0.1 * Math.sin(4.0 * Math.PI * freq * t);

    const sample = Math.max(-1.0, Math.min(1.0, wave * env));
    view.setInt16(44 + i * 2, (sample * 32767) | 0, true);
  }

  return buffer;
}

/**
 * Builds a procedural skinned column mesh with 12 bones and smooth joint blend weights.
 */
export function buildProceduralSkinnedMesh(
  rings = 24,
  radialSegs = 16,
  height = 5.0,
  boneCount = 12
): { vertexBuffer: Uint8Array; indexBuffer: Uint32Array } {
  const vertices: Array<{
    pos: [number, number, number];
    norm: [number, number, number];
    uv: [number, number];
    joints: [number, number, number, number];
    weights: [number, number, number, number];
  }> = [];
  const indices: number[] = [];
  const segments = Math.max(1, boneCount - 1);

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = v * height;
    const radius = 0.6 * (1.0 - 0.6 * v);
    const boneF = v * segments;
    const boneIdx = Math.min(Math.floor(boneF), boneCount - 1);
    const nextIdx = Math.min(boneIdx + 1, boneCount - 1);
    const t = boneF - boneIdx;

    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const theta = u * Math.PI * 2.0;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      vertices.push({
        pos: [cosT * radius, y, sinT * radius],
        norm: [cosT, 0.0, sinT],
        uv: [u, v],
        joints: [boneIdx, nextIdx, 0, 0],
        weights: [1.0 - t, t, 0.0, 0.0]
      });
    }
  }

  const ringVerts = radialSegs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const i0 = r * ringVerts + s;
      const i1 = i0 + 1;
      const i2 = (r + 1) * ringVerts + s;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  // Pack into 136-byte canonical Vertex3D format.
  const vertexBuffer = new Uint8Array(vertices.length * 136);
  const vView = new DataView(vertexBuffer.buffer);
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i]!;
    const off = i * 136;
    vView.setFloat32(off + 0, v.pos[0], true);
    vView.setFloat32(off + 4, v.pos[1], true);
    vView.setFloat32(off + 8, v.pos[2], true);
    vView.setFloat32(off + 12, v.norm[0], true);
    vView.setFloat32(off + 16, v.norm[1], true);
    vView.setFloat32(off + 20, v.norm[2], true);
    vView.setFloat32(off + 24, v.uv[0], true);
    vView.setFloat32(off + 28, v.uv[1], true);
    vView.setFloat32(off + 40, 1.0, true);
    vView.setFloat32(off + 52, 1.0, true);
    vView.setFloat32(off + 56, 1.0, true);
    vView.setFloat32(off + 60, 1.0, true);
    vView.setFloat32(off + 64, 1.0, true);
    vView.setFloat32(off + 68, 1.0, true);
    vView.setUint32(off + 72, v.joints[0], true);
    vView.setUint32(off + 76, v.joints[1], true);
    vView.setUint32(off + 80, v.joints[2], true);
    vView.setUint32(off + 84, v.joints[3], true);
    vView.setFloat32(off + 88, v.weights[0], true);
    vView.setFloat32(off + 92, v.weights[1], true);
    vView.setFloat32(off + 96, v.weights[2], true);
    vView.setFloat32(off + 100, v.weights[3], true);
  }

  return { vertexBuffer, indexBuffer: new Uint32Array(indices) };
}

/**
 * Computes 16-float bone matrix palette for procedural tentacle waving.
 */
export function computeBonePalette(time: number, boneCount = 12, height = 5.0): Float32Array {
  const palette = new Float32Array(boneCount * 16);
  const segHeight = height / Math.max(1, boneCount - 1);

  for (let i = 0; i < boneCount; i++) {
    const frac = i / (boneCount - 1);
    const restY = i * segHeight;
    const wave = Math.sin(time * 3.5 + i * 0.45);
    const dx = wave * frac * frac * 1.5;
    const dz = Math.cos(time * 2.5 + i * 0.3) * frac * 0.8;
    const rz = wave * frac * 0.4;

    const cz = Math.cos(rz);
    const sz = Math.sin(rz);

    const m = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, dx, restY * (1.0 - cz), dz, 1];

    for (let c = 0; c < 16; c++) {
      palette[i * 16 + c] = m[c]!;
    }
  }

  return palette;
}
