/**
 * Multiverse Demo MV-2: Fullscreen 3D & 2D Corner Minimap (RTT Texture Reuse)
 *
 * Demonstrates rendering a 2D Realm into an offscreen RTT target and consuming
 * that live texture simultaneously on a 3D PBR cube and a corner HUD minimap.
 */
import { isKey, type Model2DComponent, type Model3DComponent, quat } from '@galfus/engine';
import type { InvocationFilter, ViewportRect } from '@galfus/transport-types';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoMv2(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Engine - Demo MV2: Fullscreen 3D & 2D Minimap (RTT Texture Reuse)',
    options,
    [1024, 768]
  );

  try {
    const rttTarget = runtime.multiverse.createTarget({
      kind: { type: 'texture', width: 512, height: 512, format: 'rgba8unorm' }
    });

    const realm3d = runtime.createRealm3D();
    const realm2d = runtime.createRealm2D();

    runtime.multiverse.bindTargetTexture({
      sourceTargetId: rttTarget,
      realmId: realm3d.realmId,
      slot: 'material_cube_albedo'
    });

    realm3d.setEnvironment({
      ambientColor: [0.08, 0.09, 0.13, 1.0],
      clearColor: [0.03, 0.04, 0.06, 1.0],
      exposure: 1.15
    });

    const camPos: [number, number, number] = [0.0, 2.2, 4.2];
    const camRot = quat.create();
    quat.fromLookAt(camRot, camPos, [0, 0, 0]);
    realm3d.createCamera(
      { fovY: 45, near: 0.1, far: 100, cameraSlot: 1 },
      { position: camPos, rotation: camRot }
    );

    const { materialId: cubeMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      albedoTextureId: rttTarget,
      baseColor: [1, 1, 1, 1],
      roughness: 0.25,
      metallic: 0.1
    });
    const { materialId: pedestalMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.15, 0.18, 0.24, 1],
      roughness: 0.7,
      metallic: 0.2
    });

    const cube = realm3d.createCube(1.8, cubeMat, { position: [0, 0.2, 0] });
    realm3d.createPlane(10, 10, pedestalMat, { position: [0, -1.3, 0] });

    const dirPos: [number, number, number] = [-2, 6, 4];
    const dirRot = quat.create();
    quat.fromLookAt(dirRot, dirPos, [0, 0, 0]);
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.96, 0.88], intensity: 2.5 },
      { position: dirPos, rotation: dirRot }
    );
    const pointLight3d = realm3d.createLight(
      { kind: 'point', color: [0.3, 0.8, 1.0], intensity: 4.0, range: 12.0 },
      { position: [2.5, 2.0, 1.5] }
    );

    // Realm 2D scene
    realm2d.createCamera({ orthoScale: 16.0, cameraSlot: 1 });
    const bgMat = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.06, 0.07, 0.11, 1]
    });
    const coreMat = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.25, 0.45, 1]
    });
    const orbitAMat = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.15, 0.85, 0.95, 1]
    });
    const orbitBMat = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [1.0, 0.82, 0.2, 1]
    });
    const partMat = realm2d.createMaterial({
      surfaceType: 'additive',
      baseColor: [1.0, 0.9, 0.5, 1]
    });

    realm2d.createSprite(
      { dimensions: [24, 18], materialId: bgMat },
      { position: [0, 0], zLayer: -10 }
    );
    const coreShape = realm2d.createShape(
      { kind: 'rectangle', size: [3.2, 3.2], materialId: coreMat },
      { position: [0, 0], zLayer: 2 }
    );
    const orbitA = realm2d.createShape(
      { kind: 'circle', radius: 1.0, materialId: orbitAMat },
      { position: [3.5, 0], zLayer: 3 }
    );
    const orbitB = realm2d.createShape(
      { kind: 'rectangle', size: [1.6, 1.6], materialId: orbitBMat },
      { position: [-3.5, 0], zLayer: 3 }
    );
    const light2d = realm2d.createLight(
      { color: [1, 0.9, 0.7], intensity: 2.2, range: 12, lightRadius: 0.2 },
      { position: [0, 0], zLayer: 5 }
    );
    realm2d.createParticleEmitter(
      {
        materialId: partMat,
        maxParticles: 256,
        spawnRate: 45,
        lifetimeRange: [1.2, 2.5],
        speedRange: [1.5, 3.5],
        direction: [0, 1],
        spreadAngleRad: 1.2,
        startSizeRange: [0.25, 0.4],
        endSizeRange: [0.02, 0.08],
        startColor: [1, 0.7, 0.2, 1],
        endColor: [1, 0.1, 0.3, 0],
        emissionShape: { type: 'rectangle', extents: [2.0, 0.3] },
        zLayer: 6
      },
      { position: [0, -2], zLayer: 6 }
    );

    // Invocations
    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId: rttTarget,
      cameraSlot: 1,
      viewport: { width: { vw: 100 }, height: { vh: 100 } },
      clearColor: [0.06, 0.07, 0.11, 1]
    });
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { width: { vw: 100 }, height: { vh: 100 } },
      zIndex: 0,
      clearColor: [0.03, 0.04, 0.06, 1]
    });

    let minimapBottom = false;
    const getMinimapVp = (bottom: boolean): ViewportRect => ({
      anchorX: 'right',
      anchorY: bottom ? 'bottom' : 'top',
      offsetX: { px: -24 },
      offsetY: { px: bottom ? -24 : 24 },
      width: { vh: 28 },
      height: { vh: 28 }
    });
    const minimapInv = runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: getMinimapVp(minimapBottom),
      filters: ['vignette'],
      zIndex: 10,
      clearColor: [0.06, 0.07, 0.11, 1]
    });

    const filters: InvocationFilter[][] = [['vignette'], ['edgeOutline'], ['filmGrain'], []];
    let filterIdx = 0;

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'm')) {
        minimapBottom = !minimapBottom;
        runtime.multiverse.setInvocationViewport(minimapInv, getMinimapVp(minimapBottom));
      } else if (isKey(ev, 'f')) {
        filterIdx = (filterIdx + 1) % filters.length;
        runtime.multiverse.setInvocationFilters(minimapInv, filters[filterIdx]!);
      }
    });

    const cubeModel = realm3d.world.getComponent<Model3DComponent>(cube.entityId, 'Model3D')!;
    const light3dModel = realm3d.world.getComponent<Model3DComponent>(pointLight3d, 'Model3D')!;
    const coreModel = realm2d.world.getComponent<Model2DComponent>(coreShape, 'Model2D')!;
    const orbitAModel = realm2d.world.getComponent<Model2DComponent>(orbitA, 'Model2D')!;
    const orbitBModel = realm2d.world.getComponent<Model2DComponent>(orbitB, 'Model2D')!;
    const light2dModel = realm2d.world.getComponent<Model2DComponent>(light2d, 'Model2D')!;
    const qRot = quat.create();

    runtime.on('tick', ({ timeMs }) => {
      const t = timeMs * 0.001;
      quat.fromEuler(qRot, t * 0.7, t * 1.1, t * 0.4);
      cubeModel.setRotation(qRot);
      cubeModel.setPosition(0, 0.2 + Math.sin(t * 2) * 0.15, 0);
      light3dModel.setPosition(
        Math.cos(t * 1.5) * 3.2,
        2.0 + Math.sin(t * 3) * 0.8,
        Math.sin(t * 1.5) * 3.2
      );

      coreModel.setRotation(t * 1.4);
      const ax = Math.cos(t * 1.8) * 4.2;
      const ay = Math.sin(t * 1.8) * 4.2;
      orbitAModel.setPosition(ax, ay);
      light2dModel.setPosition(ax, ay);
      orbitBModel.setPosition(Math.cos(-t * 1.2) * 4.8, Math.sin(-t * 1.2) * 3.3);
      orbitBModel.setRotation(-t * 3.0);
    });

    console.log('[mv2] Ready. M: toggle minimap corner | F: cycle filter | Esc: exit.');
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
