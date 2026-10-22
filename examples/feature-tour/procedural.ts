import type { RoomMarker } from './types.ts';

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

  // Pack into 80-byte vertex buffer format:
  // pos (3f32), norm (3f32), uv (2f32), tangent (4f32), joints (4u32), weights (4f32)
  const vertexBuffer = new Uint8Array(vertices.length * 80);
  const vView = new DataView(vertexBuffer.buffer);
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i]!;
    const off = i * 80;
    vView.setFloat32(off + 0, v.pos[0], true);
    vView.setFloat32(off + 4, v.pos[1], true);
    vView.setFloat32(off + 8, v.pos[2], true);
    vView.setFloat32(off + 12, v.norm[0], true);
    vView.setFloat32(off + 16, v.norm[1], true);
    vView.setFloat32(off + 20, v.norm[2], true);
    vView.setFloat32(off + 24, v.uv[0], true);
    vView.setFloat32(off + 28, v.uv[1], true);
    vView.setFloat32(off + 32, 1.0, true);
    vView.setFloat32(off + 36, 0.0, true);
    vView.setFloat32(off + 40, 0.0, true);
    vView.setFloat32(off + 44, 1.0, true);
    vView.setUint32(off + 48, v.joints[0], true);
    vView.setUint32(off + 52, v.joints[1], true);
    vView.setUint32(off + 56, v.joints[2], true);
    vView.setUint32(off + 60, v.joints[3], true);
    vView.setFloat32(off + 64, v.weights[0], true);
    vView.setFloat32(off + 68, v.weights[1], true);
    vView.setFloat32(off + 72, v.weights[2], true);
    vView.setFloat32(off + 76, v.weights[3], true);
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

/**
 * Populates rich procedural 3D scene elements for each room exhibit.
 */
export function buildRoomScene(realmId: number, room: RoomMarker, seed: number, galfus: any): void {
  const baseId = (room.roomIndex + 1) * 1000;
  const [fx, fy, fz] = room.focusPoint;
  const palette = makePalette(room.roomIndex);

  // Common Floor tile per room
  const geomFloor = baseId + 1;
  const matFloor = baseId + 2;
  const modelFloor = baseId + 3;

  galfus.realm3dCreateGeometry(realmId, geomFloor, { primitive: 'plane', size: 16.0 });
  galfus.realm3dCreateMaterial(realmId, matFloor, {
    baseColor: [0.15, 0.17, 0.22, 1.0],
    roughness: 0.7,
    metallic: 0.15
  });
  galfus.realm3dCreateModel(
    realmId,
    modelFloor,
    { geometryId: geomFloor, materialId: matFloor },
    { position: [fx, 0, fz] }
  );

  // Pedestal
  const geomPedestal = baseId + 10;
  const matPedestal = baseId + 11;
  const modelPedestal = baseId + 12;

  galfus.realm3dCreateGeometry(realmId, geomPedestal, {
    primitive: 'cylinder',
    radius: 1.8,
    size: 0.4,
    subdivisions: 24
  });
  galfus.realm3dCreateMaterial(realmId, matPedestal, {
    baseColor: [0.22, 0.25, 0.32, 1.0],
    roughness: 0.3,
    metallic: 0.4
  });
  galfus.realm3dCreateModel(
    realmId,
    modelPedestal,
    { geometryId: geomPedestal, materialId: matPedestal },
    { position: [fx, 0.2, fz] }
  );

  // Room Light (Point light illuminating room exhibit)
  const lightId = baseId + 20;
  galfus.realm3dCreateLight(
    realmId,
    lightId,
    {
      kind: 'point',
      color: palette.primary.slice(0, 3) as [number, number, number],
      intensity: 3.8,
      range: 16.0,
      castShadow: true
    },
    { position: [fx, fy + 2.5, fz + 1.2] }
  );

  // Room-specific feature exhibits
  switch (room.id) {
    case 'entrance': {
      // Golden Cube Monument + Cyan Accent Ring
      const geomCube = baseId + 30;
      const matGold = baseId + 31;
      const modelCube = baseId + 32;

      galfus.realm3dCreateGeometry(realmId, geomCube, { primitive: 'cube', size: 1.4 });
      galfus.realm3dCreateMaterial(realmId, matGold, {
        baseColor: [1.0, 0.82, 0.2, 1.0],
        roughness: 0.15,
        metallic: 0.95,
        emissiveColor: [0.2, 0.15, 0.04, 1.0],
        emissiveIntensity: 0.8
      });
      galfus.realm3dCreateModel(
        realmId,
        modelCube,
        { geometryId: geomCube, materialId: matGold },
        { position: [fx, 1.5, fz] }
      );

      // Accent Torus Halo
      const geomHalo = baseId + 33;
      const matHalo = baseId + 34;
      const modelHalo = baseId + 35;
      galfus.realm3dCreateGeometry(realmId, geomHalo, {
        primitive: 'torus',
        radius: 1.2,
        subdivisions: 24
      });
      galfus.realm3dCreateMaterial(realmId, matHalo, {
        baseColor: [0.2, 0.85, 1.0, 1.0],
        roughness: 0.1,
        metallic: 0.8,
        emissiveColor: [0.1, 0.4, 0.6, 1.0],
        emissiveIntensity: 1.2
      });
      galfus.realm3dCreateModel(
        realmId,
        modelHalo,
        { geometryId: geomHalo, materialId: matHalo },
        { position: [fx, 1.5, fz] }
      );
      break;
    }

    case 'geometry': {
      // 5 distinct PBR Primitives: Cube, Sphere, Cylinder, Torus, Plane
      const items = [
        { prim: 'cube', pos: [-2.4, 1.3, 0], color: [0.95, 0.8, 0.2, 1.0], rough: 0.1, metal: 0.9 }, // Gold
        {
          prim: 'sphere',
          pos: [-1.2, 1.3, 0],
          color: [0.9, 0.92, 0.95, 1.0],
          rough: 0.05,
          metal: 1.0
        }, // Chrome
        {
          prim: 'cylinder',
          pos: [0.0, 1.3, 0],
          color: [0.95, 0.15, 0.3, 1.0],
          rough: 0.15,
          metal: 0.2
        }, // Ruby
        { prim: 'torus', pos: [1.2, 1.3, 0], color: [0.2, 0.85, 0.4, 1.0], rough: 0.2, metal: 0.3 }, // Emerald
        { prim: 'sphere', pos: [2.4, 1.3, 0], color: [0.15, 0.6, 1.0, 1.0], rough: 0.7, metal: 0.0 } // Matte Plastic
      ] as const;

      items.forEach((item, idx) => {
        const gid = baseId + 30 + idx * 3;
        const mid = baseId + 31 + idx * 3;
        const modId = baseId + 32 + idx * 3;
        galfus.realm3dCreateGeometry(realmId, gid, {
          primitive: item.prim,
          size: 0.9,
          radius: 0.5,
          subdivisions: 24
        });
        galfus.realm3dCreateMaterial(realmId, mid, {
          baseColor: item.color as [number, number, number, number],
          roughness: item.rough,
          metallic: item.metal
        });
        galfus.realm3dCreateModel(
          realmId,
          modId,
          { geometryId: gid, materialId: mid },
          { position: [fx + item.pos[0], item.pos[1], fz + item.pos[2]] }
        );
      });
      break;
    }

    case 'lighting': {
      // Occluder Pillars casting shadows + 3 RGB Dynamic Lights + Glowing Emissive Box
      const p1 = baseId + 40;
      const m1 = baseId + 41;
      galfus.realm3dCreateGeometry(realmId, p1, { primitive: 'cylinder', radius: 0.25, size: 2.5 });
      galfus.realm3dCreateMaterial(realmId, m1, {
        baseColor: [0.35, 0.38, 0.45, 1.0],
        roughness: 0.4,
        metallic: 0.2
      });

      [-1.5, 1.5].forEach((ox, idx) => {
        galfus.realm3dCreateModel(
          realmId,
          baseId + 42 + idx,
          { geometryId: p1, materialId: m1 },
          { position: [fx + ox, 1.25, fz] }
        );
      });

      // Emissive Glowing Box
      const geomBox = baseId + 45;
      const matEmiss = baseId + 46;
      galfus.realm3dCreateGeometry(realmId, geomBox, { primitive: 'cube', size: 0.8 });
      galfus.realm3dCreateMaterial(realmId, matEmiss, {
        baseColor: [1.0, 0.4, 0.1, 1.0],
        emissiveColor: [1.0, 0.5, 0.1, 1.0],
        emissiveIntensity: 4.5,
        roughness: 0.1,
        metallic: 0.0
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 47,
        { geometryId: geomBox, materialId: matEmiss },
        { position: [fx, 1.4, fz] }
      );

      // RGB Point lights
      galfus.realm3dCreateLight(
        realmId,
        baseId + 50,
        { kind: 'point', color: [1.0, 0.2, 0.2], intensity: 4.0, range: 10.0, castShadow: true },
        { position: [fx - 2.0, 2.0, fz - 1.0] }
      );
      galfus.realm3dCreateLight(
        realmId,
        baseId + 51,
        { kind: 'point', color: [0.2, 1.0, 0.3], intensity: 4.0, range: 10.0, castShadow: true },
        { position: [fx + 2.0, 2.0, fz - 1.0] }
      );
      galfus.realm3dCreateLight(
        realmId,
        baseId + 52,
        { kind: 'point', color: [0.2, 0.4, 1.0], intensity: 4.0, range: 10.0, castShadow: true },
        { position: [fx, 3.0, fz + 2.0] }
      );
      break;
    }

    case 'particles': {
      // GPU Sparks Fountain + Occluder pillars
      const matPart = baseId + 60;
      galfus.realm3dCreateMaterial(realmId, matPart, {
        surfaceType: 'additive',
        baseColor: [1.0, 0.75, 0.2, 1.0]
      });
      galfus.realm3dCreateParticleEmitter(
        realmId,
        baseId + 61,
        {
          label: 'Tour Spark Fountain',
          materialId: matPart,
          maxParticles: 800,
          spawnRate: 200,
          lifetimeRange: [0.7, 1.5],
          speedRange: [3.8, 6.2],
          direction: [0.0, 1.0, 0.0],
          spreadAngleRad: 0.35,
          gravity: [0.0, -6.5, 0.0],
          sizeRange: [0.05, 0.12]
        },
        { position: [fx, 0.5, fz] }
      );
      break;
    }

    case 'animation': {
      // Kinetic sculptures actively driven by transitions
      const geomCube = baseId + 70;
      const matBounce = baseId + 71;
      const modelBounce = baseId + 72;

      galfus.realm3dCreateGeometry(realmId, geomCube, { primitive: 'cube', size: 1.0 });
      galfus.realm3dCreateMaterial(realmId, matBounce, {
        baseColor: [0.2, 0.7, 1.0, 1.0],
        roughness: 0.2,
        metallic: 0.3
      });
      galfus.realm3dCreateModel(
        realmId,
        modelBounce,
        { geometryId: geomCube, materialId: matBounce },
        { position: [fx - 1.8, 0.6, fz] }
      );

      // Active Transition 1: Vertical Bouncing Cube
      const transBounce = baseId + 80;
      try {
        galfus.animationDestroyTransition(transBounce);
      } catch {}
      galfus.animationCreateTransition(
        transBounce,
        { type: 'transform3D', value: [fx - 1.8, 0.6, fz, 0, 0, 0, 1, 1, 1, 1] },
        { duration: 1.6, delay: 0.1, easing: 'easeOutBounce', loopMode: 'pingPong' }
      );
      galfus.animationBindTarget(transBounce, {
        kind: 'modelTransform3D',
        realmId,
        modelId: modelBounce
      });
      galfus.animationTransitionTo(transBounce, {
        type: 'transform3D',
        value: [fx - 1.8, 3.2, fz, 0, 0.707, 0, 0.707, 1, 1, 1]
      });

      // Model 2: Elastic Pulsing Sphere
      const geomSphere = baseId + 73;
      const matPulse = baseId + 74;
      const modelPulse = baseId + 75;
      galfus.realm3dCreateGeometry(realmId, geomSphere, {
        primitive: 'sphere',
        radius: 0.6,
        subdivisions: 24
      });
      galfus.realm3dCreateMaterial(realmId, matPulse, {
        baseColor: [1.0, 0.25, 0.45, 1.0],
        roughness: 0.15,
        metallic: 0.7
      });
      galfus.realm3dCreateModel(
        realmId,
        modelPulse,
        { geometryId: geomSphere, materialId: matPulse },
        { position: [fx, 1.4, fz] }
      );

      // Active Transition 2: Pulsing Sphere Scale
      const transPulse = baseId + 81;
      try {
        galfus.animationDestroyTransition(transPulse);
      } catch {}
      galfus.animationCreateTransition(
        transPulse,
        { type: 'transform3D', value: [fx, 1.4, fz, 0, 0, 0, 1, 0.7, 0.7, 0.7] },
        { duration: 1.3, delay: 0.0, easing: 'easeInOutCubic', loopMode: 'pingPong' }
      );
      galfus.animationBindTarget(transPulse, {
        kind: 'modelTransform3D',
        realmId,
        modelId: modelPulse
      });
      galfus.animationTransitionTo(transPulse, {
        type: 'transform3D',
        value: [fx, 1.4, fz, 0, 0, 0, 1, 1.5, 1.5, 1.5]
      });

      // Model 3: Rotating Torus
      const geomTorus = baseId + 76;
      const matTorus = baseId + 77;
      const modelTorus = baseId + 78;
      galfus.realm3dCreateGeometry(realmId, geomTorus, {
        primitive: 'torus',
        radius: 0.7,
        subdivisions: 24
      });
      galfus.realm3dCreateMaterial(realmId, matTorus, {
        baseColor: [0.3, 0.9, 0.4, 1.0],
        roughness: 0.25,
        metallic: 0.4
      });
      galfus.realm3dCreateModel(
        realmId,
        modelTorus,
        { geometryId: geomTorus, materialId: matTorus },
        { position: [fx + 1.8, 1.4, fz] }
      );

      // Active Transition 3: Smooth Hover Torus
      const transTorus = baseId + 82;
      try {
        galfus.animationDestroyTransition(transTorus);
      } catch {}
      galfus.animationCreateTransition(
        transTorus,
        { type: 'transform3D', value: [fx + 1.8, 0.8, fz, 0, 0, 0, 1, 1, 1, 1] },
        { duration: 1.5, delay: 0.2, easing: 'easeInOutSine', loopMode: 'pingPong' }
      );
      galfus.animationBindTarget(transTorus, {
        kind: 'modelTransform3D',
        realmId,
        modelId: modelTorus
      });
      galfus.animationTransitionTo(transTorus, {
        type: 'transform3D',
        value: [fx + 1.8, 2.4, fz, 0.5, 0.5, 0.5, 0.5, 1, 1, 1]
      });
      break;
    }

    case 'mirror_portal': {
      // Planar Reflection Mirror Quad + Portal Frame + Secret Chamber
      const geomMirror = baseId + 90;
      const matMirror = baseId + 91;
      const modelMirror = baseId + 92;

      galfus.realm3dCreateGeometry(realmId, geomMirror, { primitive: 'plane', size: 3.2 });
      galfus.realm3dCreateMaterial(realmId, matMirror, {
        surfaceType: 'mirror',
        baseColor: [0.95, 0.97, 1.0, 1.0],
        roughness: 0.02,
        metallic: 0.98,
        reflectance: 0.9
      });
      galfus.realm3dCreateModel(
        realmId,
        modelMirror,
        { geometryId: geomMirror, materialId: matMirror },
        { position: [fx, 1.8, fz - 1.5], rotation: [0.7071, 0, 0, 0.7071] } // Upright vertical mirror
      );

      // Register Planar Mirror Portal with Galfus
      galfus.realm3dCreatePortal(realmId, baseId + 93, {
        modelId: modelMirror,
        active: true
      });

      // Decorative Mirror Frame
      const geomFrame = baseId + 94;
      const matFrame = baseId + 95;
      galfus.realm3dCreateGeometry(realmId, geomFrame, {
        primitive: 'cylinder',
        radius: 0.1,
        size: 3.4
      });
      galfus.realm3dCreateMaterial(realmId, matFrame, {
        baseColor: [0.85, 0.7, 0.25, 1.0],
        roughness: 0.25,
        metallic: 0.85
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 96,
        { geometryId: geomFrame, materialId: matFrame },
        { position: [fx - 1.6, 1.8, fz - 1.5] }
      );
      galfus.realm3dCreateModel(
        realmId,
        baseId + 97,
        { geometryId: geomFrame, materialId: matFrame },
        { position: [fx + 1.6, 1.8, fz - 1.5] }
      );
      break;
    }

    case 'bones': {
      // 12-Joint Skinned Column / Tentacle
      const geomSkinned = baseId + 100;
      const matSkinned = baseId + 101;
      const modelSkinned = baseId + 102;

      const skinnedMesh = buildProceduralSkinnedMesh(24, 16, 5.0, 12);
      galfus.realm3dCreateGeometryRaw(
        realmId,
        geomSkinned,
        skinnedMesh.vertexBuffer,
        skinnedMesh.vertexBuffer.byteLength,
        skinnedMesh.indexBuffer,
        skinnedMesh.indexBuffer.length
      );

      galfus.realm3dCreateMaterial(realmId, matSkinned, {
        baseColor: [0.15, 0.85, 0.95, 1.0],
        emissiveColor: [0.05, 0.25, 0.35, 1.0],
        roughness: 0.2,
        metallic: 0.6
      });

      galfus.realm3dCreateModel(
        realmId,
        modelSkinned,
        {
          geometryId: geomSkinned,
          materialId: matSkinned,
          castShadow: true,
          boneCount: 12,
          boneOffset: 0,
          active: true
        },
        { position: [fx, 0.4, fz] }
      );
      break;
    }

    case 'refraction': {
      // Screen-Space Refraction Glass Gems
      const geomSphere = baseId + 110;
      const matGlass = baseId + 111;
      const modelGlass = baseId + 112;

      galfus.realm3dCreateGeometry(realmId, geomSphere, {
        primitive: 'sphere',
        radius: 1.0,
        subdivisions: 32
      });
      galfus.realm3dCreateMaterial(realmId, matGlass, {
        surfaceType: 'refractive',
        baseColor: [0.1, 0.85, 0.4, 0.35], // Emerald green tint
        roughness: 0.04,
        metallic: 0.0,
        reflectance: 0.7,
        refractionIndex: 1.52, // Crown glass
        refractionDistortion: 0.1
      });
      galfus.realm3dCreateModel(
        realmId,
        modelGlass,
        { geometryId: geomSphere, materialId: matGlass },
        { position: [fx, 1.5, fz] }
      );

      // Background patterned pillar behind the glass to clearly see optical refraction
      const geomBack = baseId + 113;
      const matBack = baseId + 114;
      galfus.realm3dCreateGeometry(realmId, geomBack, { primitive: 'cube', size: 1.2 });
      galfus.realm3dCreateMaterial(realmId, matBack, {
        baseColor: [0.95, 0.2, 0.35, 1.0],
        emissiveColor: [0.3, 0.05, 0.1, 1.0],
        roughness: 0.2,
        metallic: 0.5
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 115,
        { geometryId: geomBack, materialId: matBack },
        { position: [fx, 1.5, fz - 2.5] }
      );
      break;
    }

    case 'effects': {
      // Post-Processing & Screen Effects Exhibit
      const geomPodium = baseId + 120;
      const matPodium = baseId + 121;
      galfus.realm3dCreateGeometry(realmId, geomPodium, {
        primitive: 'torus',
        radius: 1.1,
        subdivisions: 32
      });
      galfus.realm3dCreateMaterial(realmId, matPodium, {
        baseColor: [0.85, 0.3, 0.9, 1.0],
        emissiveColor: [0.4, 0.1, 0.5, 1.0],
        roughness: 0.1,
        metallic: 0.8
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 122,
        { geometryId: geomPodium, materialId: matPodium },
        { position: [fx, 1.5, fz] }
      );
      break;
    }

    default: {
      // Spatial Audio Beacon & Finale Room
      const geomBeacon = baseId + 130;
      const matBeacon = baseId + 131;
      galfus.realm3dCreateGeometry(realmId, geomBeacon, {
        primitive: 'cylinder',
        radius: 0.7,
        size: 2.0,
        subdivisions: 24
      });
      galfus.realm3dCreateMaterial(realmId, matBeacon, {
        baseColor: [0.95, 0.8, 0.2, 1.0],
        emissiveColor: [0.35, 0.28, 0.05, 1.0],
        roughness: 0.2,
        metallic: 0.8
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 132,
        { geometryId: geomBeacon, materialId: matBeacon },
        { position: [fx, 1.4, fz] }
      );
      break;
    }
  }
}
