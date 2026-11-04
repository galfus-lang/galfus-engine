/**
 * Realm 3D Demo 3D-3: Omnidirectional Point Light Shadows (6 Cube Faces) & SSAO
 */
import { isKey, type Light3DComponent, type Model3DComponent, quat } from '@galfus/engine';
import type { PathCommand } from '@galfus/transport-types';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

function createOcclusionTexture(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1) - 0.5;
      const v = y / (size - 1) - 0.5;
      const radial = Math.min(Math.sqrt(u * u + v * v) * 1.8, 1.0);
      const value = Math.round((0.32 + radial * 0.68) * 255);
      const offset = (y * size + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function createCutoutTexture(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stripe = Math.floor(x / 8) % 2 === 0;
      const crossbar = y > size / 2 - 3 && y < size / 2 + 3;
      const offset = (y * size + x) * 4;
      pixels[offset] = 50;
      pixels[offset + 1] = 170;
      pixels[offset + 2] = 235;
      pixels[offset + 3] = stripe || crossbar ? 255 : 0;
    }
  }
  return pixels;
}

export async function runDemo3d3(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Realm 3D - Demo 3D-3: Point Shadows & SSAO',
    options,
    [1024, 768]
  );

  try {
    const realm3d = runtime.createRealm3D();
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { width: { vw: 100 }, height: { vh: 100 } },
      clearColor: [0.01, 0.01, 0.02, 1.0]
    });

    let ssaoEnabled = true;
    let ssaoIntensity = 0.65;
    let autoOrbit = true;

    const applyEnv = (rotation = 0) => {
      realm3d.setEnvironment({
        ambientColor: [0.08, 0.08, 0.1, 1.0],
        clearColor: [0.01, 0.01, 0.02, 1.0],
        exposure: 1.0,
        skybox: {
          mode: 'procedural',
          skyColor: [0.2, 0.35, 0.65, 1.0],
          horizonColor: [0.55, 0.65, 0.75, 1.0],
          groundColor: [0.05, 0.05, 0.08, 1.0],
          sunDirection: [0.6, 0.8, 0.3, 0.0],
          sunColor: [1.0, 0.95, 0.8, 2.0],
          intensity: 1.0,
          sunSize: 0.03,
          rotation
        },
        outline: { enabled: true, width: 1.2, threshold: 0.2, strength: 0.8 },
        ssao: {
          enabled: ssaoEnabled,
          radius: 0.45,
          bias: 0.025,
          power: 1.0,
          intensity: ssaoIntensity,
          blurRadius: 2
        }
      });
    };
    applyEnv();

    const aoTex = runtime.resources.createTexture(createOcclusionTexture(64), {
      width: 64,
      height: 64,
      format: 'rgba8Unorm'
    });
    const cutoutTex = runtime.resources.createTexture(createCutoutTexture(64), {
      width: 64,
      height: 64,
      format: 'rgba8UnormSrgb'
    });

    const camDistance = 14.0;
    let camAngle = 0.7;
    const camHeight = 6.0;
    const camera = realm3d.createCamera(
      { kind: 'perspective', fovY: 55, near: 0.1, far: 500, cameraSlot: 1 },
      { position: [Math.sin(camAngle) * camDistance, camHeight, Math.cos(camAngle) * camDistance] }
    );
    realm3d.setCameraLookAt(camera, { target: [0, 1.5, 0] });

    const { materialId: groundMat } = realm3d.createMaterial({
      baseColor: [0.65, 0.68, 0.7, 1.0],
      metallic: 0.05,
      roughness: 0.6,
      occlusionTextureId: aoTex,
      occlusionStrength: 0.7,
      surfaceType: 'opaque'
    });
    const { materialId: pillarMat } = realm3d.createMaterial({
      baseColor: [0.85, 0.45, 0.25, 1.0],
      metallic: 0.2,
      roughness: 0.4,
      occlusionTextureId: aoTex,
      occlusionStrength: 0.7,
      surfaceType: 'opaque'
    });
    const { materialId: orbMat } = realm3d.createMaterial({
      baseColor: [1.0, 0.95, 0.6, 1.0],
      emissiveColor: [3.0, 2.5, 1.2, 1.0],
      metallic: 0.8,
      roughness: 0.1,
      surfaceType: 'opaque'
    });
    const { materialId: cutoutMat } = realm3d.createMaterial({
      baseColor: [0.5, 0.85, 1.0, 1.0],
      albedoTextureId: cutoutTex,
      textureSamplers: ['nearestClamp'],
      alphaCutoff: 0.5,
      roughness: 0.35,
      metallic: 0.05,
      side: 'double',
      surfaceType: 'masked'
    });

    realm3d.createPlane(30, 30, groundMat, { position: [0, 0, 0] });

    const NUM_PILLARS = 8;
    const PILLAR_RADIUS = 5.5;
    for (let i = 0; i < NUM_PILLARS; i++) {
      const angle = (i * 2.0 * Math.PI) / NUM_PILLARS;
      realm3d.createCube(
        1.5,
        pillarMat,
        {
          position: [Math.cos(angle) * PILLAR_RADIUS, 1.5, Math.sin(angle) * PILLAR_RADIUS],
          scale: [1, 2.0, 1]
        },
        {
          castShadow: true,
          receiveShadow: true,
          castOutline: true,
          outlineColor: [0.9, 0.6, 0.3, 1]
        }
      );
    }

    const orb = realm3d.createCube(
      0.5,
      orbMat,
      { position: [0, 2.5, 0] },
      { castShadow: false, receiveShadow: false, castOutline: true }
    );
    realm3d.createPlane(
      2.8,
      3.8,
      cutoutMat,
      { position: [2.8, 1.9, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
      { castShadow: true, receiveShadow: true }
    );

    const pointLight = realm3d.createLight(
      { kind: 'point', color: [1.0, 0.85, 0.5], intensity: 3.5, range: 20.0, castShadow: true },
      { position: [0, 2.5, 0] }
    );
    realm3d.createLight(
      { kind: 'directional', color: [0.35, 0.45, 0.6], intensity: 0.5, castShadow: false },
      { position: [0, 20, 0], rotation: [0.4, 0.3, 0.1, 0.86] }
    );

    const NUM_WAYPOINTS = 16;
    const pathCommands: PathCommand[] = [];
    for (let k = 0; k < NUM_WAYPOINTS; k++) {
      const angle = (k * 2.0 * Math.PI) / NUM_WAYPOINTS;
      let r = 5.3;
      if (k % 2 === 0) {
        const pillarIdx = (k / 2) % NUM_PILLARS;
        r = pillarIdx % 2 === 0 ? 3.0 : 7.6;
      }
      const pt: [number, number, number] = [
        Number((Math.cos(angle) * r).toFixed(3)),
        Number((2.1 + 0.8 * Math.sin(angle * 2.0)).toFixed(3)),
        Number((Math.sin(angle) * r).toFixed(3))
      ];
      pathCommands.push(k === 0 ? { type: 'moveTo', to: pt } : { type: 'smoothTo', to: pt });
    }
    pathCommands.push({ type: 'close' });

    realm3d.flush();

    const pathCfg = { duration: 14.0, easing: 'linear' as const, loopMode: 'loop' as const };
    runtime.animation.createPathFollow(pathCommands, pathCfg, {
      kind: 'modelTransform3D',
      realmId: realm3d.realmId,
      modelId: orb.modelId
    });
    const pointLightComp = realm3d.world.getComponent<Light3DComponent>(pointLight, 'Light3D')!;
    runtime.animation.createPathFollow(pathCommands, pathCfg, {
      kind: 'light3DTransform',
      realmId: realm3d.realmId,
      lightId: pointLightComp.lightId
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 's')) ssaoEnabled = !ssaoEnabled;
      else if (isKey(ev, '1', '-')) ssaoIntensity = Math.max(0.1, ssaoIntensity - 0.1);
      else if (isKey(ev, '2', '+', '=')) ssaoIntensity = Math.min(2.5, ssaoIntensity + 0.1);
      else if (isKey(ev, 'o')) autoOrbit = !autoOrbit;
    });

    const camModel = realm3d.world.getComponent<Model3DComponent>(camera.entityId, 'Model3D')!;
    const _q = quat.create();

    runtime.on('tick', ({ timeMs, dt }) => {
      if (autoOrbit) camAngle += dt * 0.3;
      camModel.setPosition(
        Math.sin(camAngle) * camDistance,
        camHeight,
        Math.cos(camAngle) * camDistance
      );
      applyEnv(timeMs * 0.00005);
    });

    console.log('[3d3] Ready. S: toggle SSAO | 1/2: SSAO intensity | O: auto-orbit | Esc: exit.');
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
