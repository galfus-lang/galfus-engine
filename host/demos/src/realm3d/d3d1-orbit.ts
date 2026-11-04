/**
 * Realm 3D Demo 3D-1: Reverse-Z Orbit Camera, Custom Surface Shaders & Dynamic Shadows
 */
import { isKey, type Model3DComponent, quat } from '@galfus/engine';
import type { InvocationFilter } from '@galfus/transport-types';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import {
  FRESNEL_SURFACE_SNIPPET,
  HOLOGRAM_SURFACE_SNIPPET,
  WORLD_WAVE_SURFACE_SNIPPET
} from './shaders-3d';

export async function runDemo3d1(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Engine - Demo 3D-1: 3D Realm (Reverse-Z & Shadows)',
    options,
    [1024, 768]
  );

  try {
    const realm3d = runtime.createRealm3D();

    let camDistance = 7.0;
    let camAngle = 0.6;
    const camHeight = 3.2;
    const camRot = quat.create();
    const camera = realm3d.createCamera(
      { kind: 'perspective', fovY: 60, near: 0.1, far: 1000, cameraSlot: 1 },
      { position: [Math.sin(camAngle) * camDistance, camHeight, Math.cos(camAngle) * camDistance] }
    );
    realm3d.setCameraLookAt(camera, { target: [0, 1.0, 0] });

    const { materialId: fresnelMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [1.0, 0.45, 0.1, 1.0],
      emissiveColor: [0.04, 0.02, 0.0, 1.0],
      metallic: 0.3,
      roughness: 0.25,
      shaderEffect: FRESNEL_SURFACE_SNIPPET,
      customParams: [
        [0.0, 0.9, 1.0, 1.0],
        [3.0, 4.0, 0.0, 0.0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ]
    });
    const { materialId: floorMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.18, 0.22, 0.28, 1.0],
      metallic: 0.05,
      roughness: 0.85
    });
    const { materialId: waveMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.1, 0.85, 0.4, 1.0],
      metallic: 0.2,
      roughness: 0.3,
      shaderEffect: WORLD_WAVE_SURFACE_SNIPPET,
      customParams: [
        [0.1, 0.85, 0.4, 1.0],
        [3.5, 4.0, 0.0, 0.0],
        [0.9, 0.15, 0.6, 1.0],
        [0, 0, 0, 0]
      ]
    });
    const { materialId: holoMat } = realm3d.createMaterial({
      surfaceType: 'transparent',
      baseColor: [0.2, 0.6, 1.0, 0.8],
      emissiveColor: [0.1, 0.3, 0.8, 1.0],
      metallic: 0.8,
      roughness: 0.15,
      shaderEffect: HOLOGRAM_SURFACE_SNIPPET,
      customParams: [
        [0.2, 0.7, 1.0, 1.0],
        [22.0, 7.0, 0.0, 0.0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ]
    });

    const cubeFresnel = realm3d.createCube(
      1.6,
      fresnelMat,
      { position: [0.0, 1.0, 0.0] },
      { castShadow: true, receiveShadow: true, castOutline: true, outlineColor: [0, 1, 0.85, 1] }
    );
    const cubeWave = realm3d.createCube(
      1.6,
      waveMat,
      { position: [-2.8, 1.0, 0.0] },
      { castShadow: true, receiveShadow: true, castOutline: true, outlineColor: [0.2, 1, 0.4, 1] }
    );
    const cubeHolo = realm3d.createCube(
      1.6,
      holoMat,
      { position: [2.8, 1.0, 0.0] },
      { castShadow: true, receiveShadow: true, castOutline: true, outlineColor: [0.3, 0.6, 1, 1] }
    );
    realm3d.createPlane(20, 20, floorMat, { position: [0, 0, 0] });

    const dirRot = quat.create();
    quat.fromLookAt(dirRot, [8, 14, 8], [0, 0, 0]);
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.96, 0.88], intensity: 1.4, castShadow: true },
      { position: [8, 14, 8], rotation: dirRot }
    );

    const spotRot = quat.create();
    quat.fromLookAt(spotRot, [-6, 9, -5], [0, 1.0, 0]);
    const spotLight = realm3d.createLight(
      {
        kind: 'spot',
        color: [0.3, 0.8, 1.0],
        intensity: 4.5,
        range: 30.0,
        spotInnerAngleRad: 0.35,
        spotOuterAngleRad: 0.65,
        castShadow: true
      },
      { position: [-6, 9, -5], rotation: spotRot }
    );

    const pointLight = realm3d.createLight(
      { kind: 'point', color: [1.0, 0.45, 0.2], intensity: 2.0, range: 12.0, castShadow: true },
      { position: [2.5, 2.0, 1.5] }
    );

    const fogModes = ['none', 'linear', 'exponential'] as const;
    let fogIdx = 1;
    let skyboxEnabled = true;
    let outlineEnabled = true;

    const applyEnv = () => {
      realm3d.setEnvironment({
        ambientColor: [0.06, 0.08, 0.12, 1.0],
        clearColor: [0.02, 0.03, 0.05, 1.0],
        fogColor: [0.04, 0.06, 0.1, 1.0],
        fogMode: fogModes[fogIdx]!,
        fogStart: 8.0,
        fogEnd: 40.0,
        fogDensity: 0.03,
        exposure: 1.0,
        skybox: {
          mode: skyboxEnabled ? 'procedural' : 'none',
          skyColor: [0.15, 0.35, 0.75, 1.0],
          horizonColor: [0.65, 0.75, 0.9, 1.0],
          groundColor: [0.08, 0.08, 0.1, 1.0],
          sunDirection: [8, 14, 8, 0.0],
          sunColor: [1.0, 0.95, 0.85, 2.0],
          intensity: 1.0,
          sunSize: 0.03
        },
        outline: { enabled: outlineEnabled, width: 1.5, threshold: 0.2, strength: 1.0 }
      });
    };
    applyEnv();

    const invId = runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { width: { vw: 100 }, height: { vh: 100 } },
      clearColor: [0.02, 0.03, 0.05, 1.0]
    });

    const filters: InvocationFilter[][] = [
      [],
      ['vignette'],
      ['chromaticAberration'],
      ['filmGrain'],
      ['tonemapAces'],
      ['sepia'],
      ['edgeOutline']
    ];
    let filterIdx = 0;
    let autoOrbit = true;
    let rotating = true;

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'o')) autoOrbit = !autoOrbit;
      else if (isKey(ev, 'space', ' ')) rotating = !rotating;
      else if (isKey(ev, 'f')) {
        fogIdx = (fogIdx + 1) % fogModes.length;
        applyEnv();
      } else if (isKey(ev, 'k')) {
        skyboxEnabled = !skyboxEnabled;
        applyEnv();
      } else if (isKey(ev, 'l')) {
        outlineEnabled = !outlineEnabled;
        applyEnv();
      } else if (isKey(ev, 'p')) {
        filterIdx = (filterIdx + 1) % filters.length;
        runtime.multiverse.setInvocationFilters(invId, filters[filterIdx]!);
      } else if (isKey(ev, 'arrowleft')) camAngle -= 0.15;
      else if (isKey(ev, 'arrowright')) camAngle += 0.15;
      else if (isKey(ev, 'arrowup')) camDistance = Math.max(2.0, camDistance - 0.5);
      else if (isKey(ev, 'arrowdown')) camDistance = Math.min(15.0, camDistance + 0.5);
    });

    const camModel = realm3d.world.getComponent<Model3DComponent>(camera.entityId, 'Model3D')!;
    const mFresnel = realm3d.world.getComponent<Model3DComponent>(cubeFresnel.entityId, 'Model3D')!;
    const mWave = realm3d.world.getComponent<Model3DComponent>(cubeWave.entityId, 'Model3D')!;
    const mHolo = realm3d.world.getComponent<Model3DComponent>(cubeHolo.entityId, 'Model3D')!;
    const mPoint = realm3d.world.getComponent<Model3DComponent>(pointLight, 'Model3D')!;
    const mSpot = realm3d.world.getComponent<Model3DComponent>(spotLight, 'Model3D')!;
    const q = quat.create();

    runtime.on('tick', ({ timeMs, dt }) => {
      const t = timeMs * 0.001;
      if (autoOrbit) camAngle += dt * 0.4;
      camModel.setPosition(
        Math.sin(camAngle) * camDistance,
        camHeight,
        Math.cos(camAngle) * camDistance
      );

      if (rotating) {
        quat.fromEuler(q, Math.sin(t) * 0.6, t * 1.1, 0);
        mFresnel.setRotation(q);
        mFresnel.setPosition(0, 1.15 + Math.sin(t * 2) * 0.2, 0);

        quat.fromEuler(q, Math.cos(t * 0.8) * 0.5, -t * 0.9, 0.3);
        mWave.setRotation(q);
        mWave.setPosition(-2.8, 1.15 + Math.cos(t * 2) * 0.2, 0);

        quat.fromEuler(q, -Math.sin(t) * 0.8, t * 1.2, 0);
        mHolo.setRotation(q);
        mHolo.setPosition(2.8, 1.15 + Math.sin(t * 2 + 1) * 0.2, 0);
      }

      mPoint.setPosition(
        Math.cos(t * 1.8) * 3.0,
        2.5 + Math.sin(t * 3.0) * 0.5,
        Math.sin(t * 1.8) * 3.0
      );
      const sx = Math.sin(t * 0.6) * 5.0 - 3.5;
      const sz = Math.cos(t * 0.6) * 5.0 - 3.5;
      mSpot.setPosition(sx, 8.5, sz);
      quat.fromLookAt(camRot, [sx, 8.5, sz], [0, 1.0, 0]);
      mSpot.setRotation(camRot);
    });

    console.log(
      '[3d1] Ready. Arrows: orbit/zoom | O: auto-orbit | F: fog | K: skybox | L: outline | P: filter | Esc: exit.'
    );
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
