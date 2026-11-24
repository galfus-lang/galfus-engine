/**
 * Realm 3D Demo 3D-15: Parallax Occlusion Mapping (POM) & Dynamic Snow Footprint Trail
 *
 * Showcases per-pixel Steep Parallax Occlusion Mapping (`heightTextureId` + `parallaxScale`)
 * on low-poly planes and cubes:
 * - Left / Back: Procedural beveled stone-brick wall & cobblestone slab with deep mortar grooves.
 * - Right: Dynamic snow surface whose heightmap & normal map are mutated live via partial
 *   `updateTexture` uploads as an animated orb carves a recessed trail in real time.
 *
 * Controls:
 * - [P] Toggle POM on / off (`parallaxScale` vs `0.0`)
 * - [Up] / [Down] Adjust `parallaxScale` (`0.00` .. `0.12`)
 * - [Space] Pause / resume camera orbit
 * - [Esc] / [Q] Exit
 */
import { isKey, type Mesh3DComponent, type Model3DComponent, utils3D } from '@galfus/engine';
import type { Material3DDesc } from '@galfus/transport-types';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

/** Builds a tangent-space RGBA8 normal map from a scalar [0, 1] height field. */
function buildNormalMapFromHeight(
  height: Float32Array,
  size: number,
  strength: number,
  out: Uint8Array,
  x0 = 0,
  y0 = 0,
  w = size,
  h = size
): void {
  const sample = (x: number, y: number): number => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return height[wy * size + wx] ?? 1.0;
  };
  for (let py = y0; py < y0 + h; py++) {
    for (let px = x0; px < x0 + w; px++) {
      const hL = sample(px - 1, py);
      const hR = sample(px + 1, py);
      const hU = sample(px, py - 1);
      const hD = sample(px, py + 1);
      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.hypot(dx, dy, dz);
      const idx = (py * size + px) * 4;
      out[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      out[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      out[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }
}

/** Generates procedural beveled stone-brick albedo, heightmap, and normal map. */
function createStoneBrickTextures(size = 256): {
  albedo: Uint8Array;
  height: Uint8Array;
  normal: Uint8Array;
} {
  const albedo = new Uint8Array(size * size * 4);
  const heightBytes = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const heightField = new Float32Array(size * size);

  const cols = 4;
  const rows = 8;
  const mortar = 0.08;
  const bevel = 0.14;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * rows);
    const rv = v * rows - row;
    const rowShift = (row % 2) * 0.5;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const su = (u * cols + rowShift) % cols;
      const col = Math.floor(su);
      const ru = su - col;

      // Deterministic per-brick variation
      const seed = Math.sin((col + 13.7) * 127.1 + (row + 7.3) * 311.7) * 43758.5453;
      const rand = seed - Math.floor(seed);

      // Distance from brick edges
      const edgeU = Math.min(ru, 1.0 - ru);
      const edgeV = Math.min(rv, 1.0 - rv);
      const edge = Math.min(edgeU, edgeV * 0.55);

      let h = 0.0;
      if (edge > mortar) {
        const t = Math.min(1.0, (edge - mortar) / bevel);
        const smooth = t * t * (3.0 - 2.0 * t);
        const micro =
          0.03 * Math.sin(u * Math.PI * 24.0 + rand * 6.28) * Math.cos(v * Math.PI * 24.0);
        h = Math.max(0.08, Math.min(1.0, 0.15 + smooth * (0.78 + rand * 0.07) + micro));
      } else {
        h = 0.04 + 0.03 * Math.sin(u * Math.PI * 32.0) * Math.sin(v * Math.PI * 32.0);
      }

      heightField[y * size + x] = h;
      const hb = Math.round(h * 255);
      const idx = (y * size + x) * 4;
      heightBytes[idx] = hb;
      heightBytes[idx + 1] = hb;
      heightBytes[idx + 2] = hb;
      heightBytes[idx + 3] = 255;

      // Warm terracotta/sandstone bricks with dark mortar
      const inBrick = edge > mortar;
      const shade = 0.78 + rand * 0.22;
      const r = inBrick ? Math.round((176 + rand * 38) * shade) : 58;
      const g = inBrick ? Math.round((112 + rand * 28) * shade) : 54;
      const b = inBrick ? Math.round((84 + rand * 20) * shade) : 52;
      albedo[idx] = Math.min(255, r);
      albedo[idx + 1] = Math.min(255, g);
      albedo[idx + 2] = Math.min(255, b);
      albedo[idx + 3] = 255;
    }
  }

  buildNormalMapFromHeight(heightField, size, 12.0, normal);
  return { albedo, height: heightBytes, normal };
}

/** Extracts a tightly packed RGBA sub-rectangle for `updateTexture`. */
function extractRectBytes(
  src: Uint8Array,
  texSize: number,
  x: number,
  y: number,
  w: number,
  h: number
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcOffset = ((y + row) * texSize + x) * 4;
    out.set(src.subarray(srcOffset, srcOffset + w * 4), row * w * 4);
  }
  return out;
}

export async function runDemo3d15(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 3D-15 Parallax Occlusion Mapping (POM) & Dynamic Snow Trail',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    realm3d.setEnvironment({
      ambientColor: [0.16, 0.2, 0.28, 0.45],
      skybox: {
        mode: 'procedural',
        skyColor: [0.06, 0.12, 0.24, 1.0],
        horizonColor: [0.24, 0.3, 0.4, 1.0],
        groundColor: [0.06, 0.07, 0.09, 1.0]
      }
    });

    const cam = realm3d.createCamera(
      { fovY: 48, near: 0.2, far: 120, cameraSlot: 0 },
      { position: [0, 3.6, 8.2] }
    );
    realm3d.setCameraLookAt(cam, { target: [0, 0.3, 0] });
    const camModel = realm3d.world.getComponent<Model3DComponent>(cam.entityId, 'Model3D');

    // Warm raking key directional light + cool rim light to accentuate POM depth & bevel normals
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.94, 0.84], intensity: 2.8, castShadow: true },
      { position: [10, 5.5, 6], rotation: utils3D.quatFromLookAt([10, 5.5, 6], [0, 0, 0]) }
    );
    realm3d.createLight(
      { kind: 'point', color: [0.45, 0.72, 1.0], intensity: 4.5, range: 18, castShadow: false },
      { position: [-4, 3.5, 4] }
    );

    // 1. Procedural stone-brick textures (256x256)
    const texSize = 256;
    const brick = createStoneBrickTextures(texSize);
    const brickAlbedoId = runtime.resources.createTexture(brick.albedo, {
      label: 'pom-brick-albedo',
      width: texSize,
      height: texSize,
      format: 'rgba8UnormSrgb'
    });
    const brickHeightId = runtime.resources.createTexture(brick.height, {
      label: 'pom-brick-height',
      width: texSize,
      height: texSize,
      format: 'rgba8Unorm'
    });
    const brickNormalId = runtime.resources.createTexture(brick.normal, {
      label: 'pom-brick-normal',
      width: texSize,
      height: texSize,
      format: 'rgba8Unorm'
    });

    // 2. Dynamic snow heightmap + normal map (256x256)
    const snowField = new Float32Array(texSize * texSize);
    const snowHeightBytes = new Uint8Array(texSize * texSize * 4);
    const snowNormalBytes = new Uint8Array(texSize * texSize * 4);
    const snowAlbedoBytes = new Uint8Array(texSize * texSize * 4);
    for (let y = 0; y < texSize; y++) {
      for (let x = 0; x < texSize; x++) {
        const u = x / texSize;
        const v = y / texSize;
        const drift =
          0.92 +
          0.04 * Math.sin(u * Math.PI * 6.0) * Math.cos(v * Math.PI * 6.0) +
          0.02 * Math.sin((u + v) * Math.PI * 16.0);
        const h = Math.min(1.0, Math.max(0.75, drift));
        snowField[y * texSize + x] = h;
        const hb = Math.round(h * 255);
        const idx = (y * texSize + x) * 4;
        snowHeightBytes[idx] = hb;
        snowHeightBytes[idx + 1] = hb;
        snowHeightBytes[idx + 2] = hb;
        snowHeightBytes[idx + 3] = 255;
        const grain = Math.round(((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 8);
        snowAlbedoBytes[idx] = Math.min(255, Math.max(0, 232 + grain));
        snowAlbedoBytes[idx + 1] = Math.min(255, Math.max(0, 238 + grain));
        snowAlbedoBytes[idx + 2] = Math.min(255, Math.max(0, 248 + grain));
        snowAlbedoBytes[idx + 3] = 255;
      }
    }
    buildNormalMapFromHeight(snowField, texSize, 18.0, snowNormalBytes);

    const snowAlbedoId = runtime.resources.createTexture(snowAlbedoBytes, {
      label: 'pom-snow-albedo',
      width: texSize,
      height: texSize,
      format: 'rgba8UnormSrgb'
    });
    const snowHeightId = runtime.resources.createTexture(snowHeightBytes, {
      label: 'pom-snow-height',
      width: texSize,
      height: texSize,
      format: 'rgba8Unorm'
    });
    const snowNormalId = runtime.resources.createTexture(snowNormalBytes, {
      label: 'pom-snow-normal',
      width: texSize,
      height: texSize,
      format: 'rgba8Unorm'
    });

    let pomEnabled = true;
    let parallaxScale = 0.025;

    const makeBrickMatDesc = (scale: number): Material3DDesc => ({
      albedoTextureId: brickAlbedoId,
      normalTextureId: brickNormalId,
      heightTextureId: brickHeightId,
      normalScale: 1.0,
      parallaxScale: scale,
      parallaxMinLayers: 8,
      parallaxMaxLayers: 32,
      parallaxFadeDistance: 35.0,
      roughness: 0.72,
      metallic: 0.05
    });

    const makeSnowMatDesc = (scale: number): Material3DDesc => ({
      albedoTextureId: snowAlbedoId,
      normalTextureId: snowNormalId,
      heightTextureId: snowHeightId,
      normalScale: 1.35,
      parallaxScale: scale * 1.4,
      parallaxMinLayers: 10,
      parallaxMaxLayers: 32,
      parallaxFadeDistance: 35.0,
      roughness: 0.55,
      metallic: 0.02
    });

    let brickMatId = realm3d.createMaterial(makeBrickMatDesc(parallaxScale)).materialId;
    let snowMatId = realm3d.createMaterial(makeSnowMatDesc(parallaxScale)).materialId;
    const orbMat = realm3d.createMaterial({
      baseColor: [1.0, 0.75, 0.25, 1.0],
      emissiveColor: [1.0, 0.55, 0.12, 1.0],
      roughness: 0.2,
      metallic: 0.3
    });

    // Left slab: Stone Brick Floor + Vertical Stone Block
    const brickFloor = realm3d.createPlane(5.2, 5.2, brickMatId, { position: [-2.8, 0.0, 0.0] });
    const brickCube = realm3d.createCube(2.4, brickMatId, { position: [-2.8, 1.2, -1.3] });

    // Right slab: Dynamic Snow Field + Carving Orb
    const snowCenterX = 2.8;
    const snowSize = 5.2;
    const snowPlane = realm3d.createPlane(snowSize, snowSize, snowMatId, {
      position: [snowCenterX, 0.0, 0.0]
    });
    const orb = realm3d.createSphere(0.28, 20, 14, orbMat.materialId, {
      position: [snowCenterX, 0.28, 0.0]
    });
    const orbComp = realm3d.world.getComponent<Model3DComponent>(orb.entityId, 'Model3D');
    const brickFloorComp = realm3d.world.getComponent<Mesh3DComponent>(
      brickFloor.entityId,
      'Mesh3D'
    );
    const brickCubeComp = realm3d.world.getComponent<Mesh3DComponent>(brickCube.entityId, 'Mesh3D');
    const snowPlaneComp = realm3d.world.getComponent<Mesh3DComponent>(snowPlane.entityId, 'Mesh3D');

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 0
    });

    const syncMaterials = (): void => {
      const activeScale = pomEnabled ? parallaxScale : 0.0;
      const nextBrickId = realm3d.createMaterial(makeBrickMatDesc(activeScale)).materialId;
      const nextSnowId = realm3d.createMaterial(makeSnowMatDesc(activeScale)).materialId;
      if (brickFloorComp) {
        brickFloorComp.materialId = nextBrickId;
        brickFloorComp.isDirty = true;
      }
      if (brickCubeComp) {
        brickCubeComp.materialId = nextBrickId;
        brickCubeComp.isDirty = true;
      }
      if (snowPlaneComp) {
        snowPlaneComp.materialId = nextSnowId;
        snowPlaneComp.isDirty = true;
      }
      realm3d.destroyMaterial(brickMatId);
      realm3d.destroyMaterial(snowMatId);
      brickMatId = nextBrickId;
      snowMatId = nextSnowId;
      console.log(
        `[3D-15] POM ${pomEnabled ? 'ON' : 'OFF'} | parallaxScale=${activeScale.toFixed(3)}`
      );
    };

    const stampSnowDepression = (u: number, v: number): void => {
      const cx = Math.floor(u * texSize);
      const cy = Math.floor(v * texSize);
      const radiusPx = 18;
      const x0 = Math.max(0, cx - radiusPx - 2);
      const y0 = Math.max(0, cy - radiusPx - 2);
      const x1 = Math.min(texSize - 1, cx + radiusPx + 2);
      const y1 = Math.min(texSize - 1, cy + radiusPx + 2);
      const rw = x1 - x0 + 1;
      const rh = y1 - y0 + 1;

      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const d = Math.hypot(px - cx, py - cy) / radiusPx;
          if (d >= 1.2) continue;
          const idx = py * texSize + px;
          const cur = snowField[idx] ?? 0.92;
          let target = cur;
          if (d < 0.85) {
            // Carve deep smooth trench
            const t = 1.0 - d / 0.85;
            const carve = 0.08 + (1.0 - t * t) * 0.84;
            target = Math.min(cur, carve);
          } else {
            // Subtle raised snow rim around footprint edge
            const rim = 1.0 - Math.abs(d - 1.0) / 0.2;
            target = Math.min(1.0, Math.max(cur, 0.92 + rim * 0.08));
          }
          snowField[idx] = target;
          const hb = Math.round(target * 255);
          const bIdx = idx * 4;
          snowHeightBytes[bIdx] = hb;
          snowHeightBytes[bIdx + 1] = hb;
          snowHeightBytes[bIdx + 2] = hb;

          // Cool icy-blue cavity shading inside the carved trench so POM shift is crisp
          const depthFactor = Math.min(1.0, Math.max(0.0, (0.92 - target) / 0.84));
          const rimBoost = target > 0.94 ? 14 : 0;
          snowAlbedoBytes[bIdx] = Math.min(255, Math.round(234 - depthFactor * 112) + rimBoost);
          snowAlbedoBytes[bIdx + 1] = Math.min(255, Math.round(240 - depthFactor * 82) + rimBoost);
          snowAlbedoBytes[bIdx + 2] = Math.min(255, Math.round(250 - depthFactor * 42) + rimBoost);
        }
      }

      buildNormalMapFromHeight(snowField, texSize, 18.0, snowNormalBytes, x0, y0, rw, rh);
      const rect = { x: x0, y: y0, width: rw, height: rh };
      runtime.resources.updateTexture(
        snowAlbedoId,
        extractRectBytes(snowAlbedoBytes, texSize, x0, y0, rw, rh),
        rect
      );
      runtime.resources.updateTexture(
        snowHeightId,
        extractRectBytes(snowHeightBytes, texSize, x0, y0, rw, rh),
        rect
      );
      runtime.resources.updateTexture(
        snowNormalId,
        extractRectBytes(snowNormalBytes, texSize, x0, y0, rw, rh),
        rect
      );
    };

    let elapsed = 0;
    let paused = false;
    let lastStampT = -1;

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'Space')) {
        paused = !paused;
      } else if (isKey(ev, 'KeyP')) {
        pomEnabled = !pomEnabled;
        syncMaterials();
      } else if (isKey(ev, 'ArrowUp') || isKey(ev, 'Equal')) {
        parallaxScale = Math.min(0.08, +(parallaxScale + 0.005).toFixed(3));
        pomEnabled = true;
        syncMaterials();
      } else if (isKey(ev, 'ArrowDown') || isKey(ev, 'Minus')) {
        parallaxScale = Math.max(0.0, +(parallaxScale - 0.005).toFixed(3));
        syncMaterials();
      }
    });

    runtime.on('tick', ({ dt }) => {
      if (!paused) {
        elapsed += dt;
      }

      // Orbit camera at low grazing angle so POM parallax depth pops clearly
      const angle = elapsed * 0.35;
      const radius = 8.2;
      const camX = Math.sin(angle) * radius;
      const camZ = Math.cos(angle) * radius;
      const camY = 3.0 + Math.sin(elapsed * 0.5) * 1.1;
      camModel?.setPosition(camX, camY, camZ);

      // Move carving orb in a figure-8 path across the snow plane
      const trailT = elapsed * 0.75;
      const localX = Math.sin(trailT) * 1.75;
      const localZ = Math.sin(trailT * 2.0) * 1.45;
      orbComp?.setPosition(snowCenterX + localX, 0.28, localZ);

      if (elapsed - lastStampT >= 0.04) {
        lastStampT = elapsed;
        const u = (localX + snowSize * 0.5) / snowSize;
        const v = (localZ + snowSize * 0.5) / snowSize;
        stampSnowDepression(u, v);
      }
    });

    console.log(
      '[3D-15] POM Demo | [P] Toggle POM | [Up/Down] Adjust parallaxScale | [Space] Pause orbit | [Esc/Q] Exit'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['Escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
