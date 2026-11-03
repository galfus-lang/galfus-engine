import { isKey, type Model3DComponent, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, getScrollY, type HostDemoOptions } from '../common/options';
import { createCheckerboardRGBA8 } from '../common/textures';

function createBrickNormalMapRGBA8(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const rows = 4;
  const cols = 2;
  const brickH = size / rows;
  const brickW = size / cols;
  const groove = 6;

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / brickH);
    const localY = y % brickH;
    const xOffset = (row % 2) * (brickW * 0.5);

    for (let x = 0; x < size; x++) {
      const shiftedX = (x + xOffset) % size;
      const localX = shiftedX % brickW;

      let nx = 0.0;
      let ny = 0.0;
      let nz = 1.0;

      if (localX < groove) nx = -0.85;
      else if (localX > brickW - groove) nx = 0.85;

      if (localY < groove) ny = -0.85;
      else if (localY > brickH - groove) ny = 0.85;

      nx += Math.sin(x * 0.35) * Math.cos(y * 0.35) * 0.12;
      ny += Math.cos(x * 0.25) * Math.sin(y * 0.25) * 0.12;

      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

function createWaveNormalMapRGBA8(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const half = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy) + 1e-5;
      const freq = 28.0;
      const dHeight = Math.cos(r * freq) * 0.75;

      let nx = -(dx / r) * dHeight;
      let ny = -(dy / r) * dHeight;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

export async function runDemo3d9(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 3D-9 Normal Mapping, Render Sides & Flat Shading',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();

    const checkerTex = runtime.resources.createTexture(createCheckerboardRGBA8(256, 32), {
      width: 256,
      height: 256,
      format: 'rgba8UnormSrgb'
    });
    const brickNormalTex = runtime.resources.createTexture(createBrickNormalMapRGBA8(256), {
      width: 256,
      height: 256,
      format: 'rgba8Unorm'
    });
    const waveNormalTex = runtime.resources.createTexture(createWaveNormalMapRGBA8(256), {
      width: 256,
      height: 256,
      format: 'rgba8Unorm'
    });

    const camPos: [number, number, number] = [0, 3.8, 11.5];
    const camTarget: [number, number, number] = [0, 1.8, 0];
    const camera = realm3d.createCamera(
      { fovY: 50, near: 0.1, far: 250, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.14, 0.16, 0.22, 0.25],
      exposure: 1.15,
      ssao: { radius: 0.6, bias: 0.025, intensity: 1.35, power: 1.8 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.05, 0.1, 0.22, 1.0],
        horizonColor: [0.28, 0.45, 0.72, 1.0],
        groundColor: [0.06, 0.06, 0.08, 1.0],
        sunDirection: [0.4, 0.85, 0.35, 0.0],
        sunColor: [1.0, 0.95, 0.86, 2.6],
        intensity: 1.0
      }
    });

    const sunPos: [number, number, number] = [6, 14, 8];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.95, 0.88], intensity: 2.2, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );
    const orbitLight1 = realm3d.createLight(
      { kind: 'point', color: [1.0, 0.65, 0.2], intensity: 22.0, range: 14.0, castShadow: true },
      { position: [0, 2.5, 3.5] }
    );
    const orbitLight2 = realm3d.createLight(
      { kind: 'point', color: [0.2, 0.8, 1.0], intensity: 18.0, range: 14.0, castShadow: false },
      { position: [0, 2.5, -3.5] }
    );

    const floorMat = realm3d.createMaterial({
      baseColor: [0.7, 0.75, 0.82, 1.0],
      metallic: 0.15,
      roughness: 0.55,
      albedoTextureId: checkerTex,
      normalTextureId: waveNormalTex
    }).materialId;
    const smoothSphereMat = realm3d.createMaterial({
      baseColor: [0.85, 0.35, 0.2, 1.0],
      metallic: 0.25,
      roughness: 0.35
    }).materialId;
    const brickNormalMat = realm3d.createMaterial({
      baseColor: [0.85, 0.35, 0.2, 1.0],
      metallic: 0.25,
      roughness: 0.35,
      normalTextureId: brickNormalTex
    }).materialId;
    const waveNormalMat = realm3d.createMaterial({
      baseColor: [0.95, 0.78, 0.25, 1.0],
      metallic: 0.85,
      roughness: 0.2,
      normalTextureId: waveNormalTex
    }).materialId;

    const frontSideMat = realm3d.createMaterial({
      baseColor: [0.2, 0.85, 0.5, 1.0],
      metallic: 0.2,
      roughness: 0.3,
      side: 'front'
    }).materialId;
    const backSideMat = realm3d.createMaterial({
      baseColor: [0.95, 0.25, 0.55, 1.0],
      metallic: 0.2,
      roughness: 0.3,
      side: 'back'
    }).materialId;
    const doubleSideMat = realm3d.createMaterial({
      baseColor: [0.2, 0.75, 0.98, 1.0],
      metallic: 0.3,
      roughness: 0.25,
      side: 'double',
      normalTextureId: waveNormalTex
    }).materialId;

    const smoothLowPolyMat = realm3d.createMaterial({
      baseColor: [0.65, 0.4, 0.98, 1.0],
      metallic: 0.35,
      roughness: 0.25
    }).materialId;
    const flatLowPolyMat = realm3d.createMaterial({
      baseColor: [0.65, 0.4, 0.98, 1.0],
      metallic: 0.35,
      roughness: 0.25
    }).materialId;

    realm3d.createPlane(30, 30, floorMat, { position: [0, 0, 0] });

    const s1 = realm3d.createSphere(0.95, 32, 48, smoothSphereMat, {
      position: [-4.5, 1.5, 1.5]
    }).entityId;
    const s2 = realm3d.createSphere(0.95, 32, 48, brickNormalMat, {
      position: [-2.2, 1.5, 1.5]
    }).entityId;
    const s3 = realm3d.createCube(1.5, brickNormalMat, { position: [-4.5, 1.5, -1.5] }).entityId;
    const s4 = realm3d.createTorus(0.8, 0.28, 48, 24, waveNormalMat, {
      position: [-2.2, 1.5, -1.5]
    }).entityId;

    const qFront = realm3d.createPrimitive(
      { kind: 'quad', width: 1.6, height: 2.2 },
      frontSideMat,
      {
        position: [0.5, 1.7, 1.8]
      }
    ).entityId;
    const qBack = realm3d.createPrimitive({ kind: 'quad', width: 1.6, height: 2.2 }, backSideMat, {
      position: [0.5, 1.7, 0.0]
    }).entityId;
    const qDouble = realm3d.createPrimitive(
      { kind: 'quad', width: 1.6, height: 2.2 },
      doubleSideMat,
      {
        position: [0.5, 1.7, -1.8]
      }
    ).entityId;

    const lowSmooth = realm3d.createSphere(1.05, 6, 10, smoothLowPolyMat, {
      position: [3.6, 1.6, 1.2]
    }).entityId;
    const lowFlat = realm3d.createSphere(1.05, 6, 10, flatLowPolyMat, {
      position: [3.6, 1.6, -1.2]
    }).entityId;

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });

    let elapsed = 0;
    let paused = false;
    let orbitYaw = 0;
    let orbitPitch = 0.28;
    let orbitDist = 11.5;
    let isDragging = false;
    let lastMouse: [number, number] = [0, 0];

    runtime.on('pointer', (ev) => {
      if (ev.type === 'button' && ev.button === 'primary') {
        isDragging = ev.state === 'pressed';
        lastMouse = ev.position;
      } else if (ev.type === 'move' && isDragging) {
        orbitYaw -= (ev.position[0] - lastMouse[0]) * 0.007;
        orbitPitch = Math.max(
          0.05,
          Math.min(1.25, orbitPitch + (ev.position[1] - lastMouse[1]) * 0.007)
        );
        lastMouse = ev.position;
      } else if (ev.type === 'scroll') {
        orbitDist = Math.max(4.5, Math.min(20.0, orbitDist - getScrollY(ev.delta) * 0.6));
      }
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed' && isKey(ev, 'space', ' ')) {
        paused = !paused;
      }
    });

    runtime.on('tick', ({ dt }) => {
      if (!paused) elapsed += dt;

      const cx = Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      const cy = Math.sin(orbitPitch) * orbitDist + 1.2;
      const cz = Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      realm3d.world
        .getComponent<Model3DComponent>(camera.entityId, 'Model3D')
        ?.setPosition(cx, cy, cz);

      const lx = Math.cos(elapsed * 1.1) * 5.2;
      const lz = Math.sin(elapsed * 1.1) * 3.2;
      realm3d.world
        .getComponent<Model3DComponent>(orbitLight1, 'Model3D')
        ?.setPosition(lx, 2.4 + Math.sin(elapsed * 2.2) * 0.8, lz);
      realm3d.world
        .getComponent<Model3DComponent>(orbitLight2, 'Model3D')
        ?.setPosition(-lx, 2.4 + Math.cos(elapsed * 2.2) * 0.8, -lz);

      const rotY = utils3D.quatFromAxisAngle([0, 1, 0], elapsed * 0.85);
      const rotTilted = utils3D.quatFromAxisAngle([0.4, 1.0, 0.2], elapsed * 0.9);

      realm3d.world
        .getComponent<Model3DComponent>(s1, 'Model3D')
        ?.setTRS([-4.5, 1.5, 1.5], rotY, [1, 1, 1]);
      realm3d.world
        .getComponent<Model3DComponent>(s2, 'Model3D')
        ?.setTRS([-2.2, 1.5, 1.5], rotY, [1, 1, 1]);
      realm3d.world
        .getComponent<Model3DComponent>(s3, 'Model3D')
        ?.setTRS([-4.5, 1.5, -1.5], rotTilted, [1, 1, 1]);
      realm3d.world
        .getComponent<Model3DComponent>(s4, 'Model3D')
        ?.setTRS([-2.2, 1.5, -1.5], rotTilted, [1, 1, 1]);

      const quadRot = utils3D.quatFromAxisAngle([0, 1, 0], elapsed * 1.35);
      realm3d.world
        .getComponent<Model3DComponent>(qFront, 'Model3D')
        ?.setTRS([0.5, 1.7, 1.8], quadRot, [1, 1, 1]);
      realm3d.world
        .getComponent<Model3DComponent>(qBack, 'Model3D')
        ?.setTRS([0.5, 1.7, 0.0], quadRot, [1, 1, 1]);
      realm3d.world
        .getComponent<Model3DComponent>(qDouble, 'Model3D')
        ?.setTRS([0.5, 1.7, -1.8], quadRot, [1, 1, 1]);

      realm3d.world
        .getComponent<Model3DComponent>(lowSmooth, 'Model3D')
        ?.setTRS([3.6, 1.6, 1.2], rotTilted, [1, 1, 1]);
      realm3d.world
        .getComponent<Model3DComponent>(lowFlat, 'Model3D')
        ?.setTRS([3.6, 1.6, -1.2], rotTilted, [1, 1, 1]);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemo3d9();
}
