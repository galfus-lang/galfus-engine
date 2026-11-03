/**
 * Multiverse Demo MV-3: Cyclic Realm Dependencies & Deterministic Soft Cut
 *
 * Demonstrates a mutual RTT cycle:
 * - Realm 3D renders into Target 3D RTT while sampling Target 2D RTT on its cube
 * - Realm 2D renders into Target 2D RTT while sampling Target 3D RTT on its portal sprite
 * Multiverse detects the cycle and resolves it via a deterministic Soft Cut edge.
 */
import { isKey, type Model2DComponent, type Model3DComponent, quat } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoMv3(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Engine - Demo MV3: Multiverse Cyclic Feedback & Soft Cut',
    options,
    [1024, 768]
  );

  try {
    const target3dRtt = runtime.multiverse.createTarget({
      kind: { type: 'texture', width: 512, height: 512, format: 'rgba8unorm' }
    });
    const target2dRtt = runtime.multiverse.createTarget({
      kind: { type: 'texture', width: 512, height: 512, format: 'rgba8unorm' }
    });

    const realm3d = runtime.createRealm3D();
    const realm2d = runtime.createRealm2D();

    // Mutual cyclic binding
    runtime.multiverse.bindTargetTexture({
      sourceTargetId: target2dRtt,
      realmId: realm3d.realmId,
      slot: 'material_cube_albedo'
    });
    runtime.multiverse.bindTargetTexture({
      sourceTargetId: target3dRtt,
      realmId: realm2d.realmId,
      slot: 'portal_sprite_texture'
    });

    realm3d.setEnvironment({
      ambientColor: [0.08, 0.08, 0.12, 1.0],
      clearColor: [0.02, 0.02, 0.04, 1.0],
      exposure: 1.2
    });

    const rttCamPos: [number, number, number] = [0, 1.5, 3.2];
    const rttCamRot = quat.create();
    quat.fromLookAt(rttCamRot, rttCamPos, [0, 0, 0]);
    realm3d.createCamera(
      { fovY: 55, near: 0.1, far: 100, cameraSlot: 1 },
      { position: rttCamPos, rotation: rttCamRot }
    );

    const mainCamPos: [number, number, number] = [0, 2.0, 4.5];
    const mainCamRot = quat.create();
    quat.fromLookAt(mainCamRot, mainCamPos, [0, 0, 0]);
    realm3d.createCamera(
      { fovY: 45, near: 0.1, far: 100, cameraSlot: 2 },
      { position: mainCamPos, rotation: mainCamRot }
    );

    const { materialId: cubeMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      albedoTextureId: target2dRtt,
      baseColor: [1, 1, 1, 1],
      roughness: 0.2,
      metallic: 0.1
    });
    const { materialId: floorMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.1, 0.12, 0.16, 1],
      roughness: 0.8,
      metallic: 0.1
    });

    const cube = realm3d.createCube(1.8, cubeMat, { position: [0, 0, 0] });
    realm3d.createPlane(12, 12, floorMat, { position: [0, -1.4, 0] });

    const dirPos: [number, number, number] = [-2, 6, 4];
    const dirRot = quat.create();
    quat.fromLookAt(dirRot, dirPos, [0, 0, 0]);
    realm3d.createLight(
      { kind: 'directional', color: [0.9, 0.95, 1.0], intensity: 1.5 },
      { position: dirPos, rotation: dirRot }
    );
    const point3d = realm3d.createLight(
      { kind: 'point', color: [0.2, 0.8, 1.0], intensity: 3.5, range: 10 },
      { position: [1.8, 1.2, 1.5] }
    );

    // Realm 2D
    realm2d.createCamera({ orthoScale: 16.0, cameraSlot: 1 });
    const bgMat = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.05, 0.07, 0.12, 1]
    });
    const portalMat = realm2d.createMaterial({
      surfaceType: 'opaque',
      textureId: target3dRtt,
      baseColor: [1, 1, 1, 1]
    });
    const ringMat = realm2d.createMaterial({
      surfaceType: 'transparent',
      baseColor: [0, 0.9, 1.0, 0.8]
    });

    realm2d.createSprite(
      { dimensions: [24, 18], materialId: bgMat },
      { position: [0, 0], zLayer: -10 }
    );
    realm2d.createSprite(
      { dimensions: [6.5, 6.5], materialId: portalMat },
      { position: [0, 0], zLayer: 0 }
    );
    const ring = realm2d.createShape(
      { kind: 'rectangle', size: [7.2, 7.2], materialId: ringMat },
      { position: [0, 0], zLayer: 2 }
    );
    const light2d = realm2d.createLight(
      { color: [0, 0.8, 1], intensity: 2.5, range: 12, lightRadius: 0.2 },
      { position: [0, 0], zLayer: 5 }
    );
    const emitter2d = realm2d.createParticleEmitter(
      {
        materialId: ringMat,
        maxParticles: 256,
        spawnRate: 40,
        lifetimeRange: [1.0, 2.0],
        speedRange: [1.5, 3.5],
        direction: [0, 1],
        spreadAngleRad: Math.PI * 2,
        startSizeRange: [0.2, 0.35],
        endSizeRange: [0.02, 0.05],
        startColor: [0, 1, 0.8, 1],
        endColor: [1, 0.2, 0.8, 0],
        emissionShape: { type: 'circle', radius: 3.5 },
        zLayer: 6
      },
      { position: [0, 0], zLayer: 6 }
    );

    const fullVp = { width: { vw: 100 }, height: { vh: 100 } };
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId: target3dRtt,
      cameraSlot: 1,
      viewport: fullVp,
      clearColor: [0.02, 0.02, 0.04, 1]
    });
    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId: target2dRtt,
      cameraSlot: 1,
      viewport: fullVp,
      clearColor: [0.01, 0.01, 0.02, 1]
    });
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 2,
      viewport: fullVp,
      zIndex: 0,
      clearColor: [0.02, 0.02, 0.04, 1]
    });
    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: {
        anchorX: 'right',
        anchorY: 'top',
        offsetX: { px: 24 },
        offsetY: { px: 24 },
        width: { px: 240 },
        height: { px: 240 }
      },
      zIndex: 10,
      clearColor: [0, 0, 0, 0]
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed' && isKey(ev, 'space', ' ')) {
        realm2d.particleEmitterBurst(emitter2d, 60);
      }
    });

    const cubeModel = realm3d.world.getComponent<Model3DComponent>(cube.entityId, 'Model3D')!;
    const light3dModel = realm3d.world.getComponent<Model3DComponent>(point3d, 'Model3D')!;
    const ringModel = realm2d.world.getComponent<Model2DComponent>(ring, 'Model2D')!;
    const light2dModel = realm2d.world.getComponent<Model2DComponent>(light2d, 'Model2D')!;
    const qRot = quat.create();

    runtime.on('tick', ({ timeMs }) => {
      const t = timeMs * 0.001;
      quat.fromEuler(qRot, t * 0.6, t * 1.1, t * 0.3);
      cubeModel.setRotation(qRot);
      light3dModel.setPosition(Math.cos(t * 1.5) * 2.5, 1.2, Math.sin(t * 1.5) * 2.5);
      ringModel.setRotation(t * 1.2);
      light2dModel.setPosition(Math.cos(t * 2.5) * 4.0, Math.sin(t * 2.5) * 4.0);
    });

    console.log('[mv3] Cyclic Soft Cut active. Space: particle burst | Esc: exit.');
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
