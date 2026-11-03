/**
 * Multiverse Demo MV-4: Global Anti-Aliasing & Per-Invocation Overrides
 *
 * Compares raw un-antialiased edges (left viewport, explicit `antiAliasing: 'none'`)
 * against the global Multiverse AA mode (right viewport: FXAA / SMAA / TAA / SSAA).
 */
import { isKey, type Model3DComponent, quat } from '@galfus/engine';
import type { AntiAliasingMode } from '@galfus/transport-types';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoMv4(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Engine - Demo MV-4: Anti-Aliasing [FXAA]',
    options,
    [1024, 768]
  );

  try {
    const aaModes: AntiAliasingMode[] = ['none', 'fxaa', 'smaa', 'taa', 'ssaa2x', 'ssaa4x'];
    let aaIndex = 1;
    runtime.multiverse.setAntiAliasing(aaModes[aaIndex]!);

    const realm3d = runtime.createRealm3D();
    realm3d.setEnvironment({
      ambientColor: [0.08, 0.1, 0.15, 1.0],
      clearColor: [0.04, 0.05, 0.08, 1.0],
      exposure: 1.2
    });

    const camPos: [number, number, number] = [0.0, 3.2, 7.5];
    const camRot = quat.create();
    quat.fromLookAt(camRot, camPos, [0.0, 1.0, 0.0]);
    realm3d.createCamera(
      { kind: 'perspective', fovY: 50, near: 0.1, far: 100, cameraSlot: 1 },
      { position: camPos, rotation: camRot }
    );

    const { materialId: cyanMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.0, 0.95, 1.0, 1.0],
      emissiveColor: [0.0, 0.05, 0.1, 1.0],
      metallic: 0.1,
      roughness: 0.25
    });
    const { materialId: magentaMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [1.0, 0.1, 0.5, 1.0],
      emissiveColor: [0.08, 0.0, 0.02, 1.0],
      metallic: 0.15,
      roughness: 0.25
    });
    const { materialId: amberMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [1.0, 0.85, 0.15, 1.0],
      emissiveColor: [0.06, 0.04, 0.0, 1.0],
      metallic: 0.3,
      roughness: 0.2
    });
    const { materialId: groundMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.12, 0.15, 0.2, 1.0],
      metallic: 0.05,
      roughness: 0.8
    });

    const cube1 = realm3d.createCube(1.8, cyanMat, { position: [-2.6, 1.3, 0.0] });
    const cube2 = realm3d.createCube(1.8, magentaMat, {
      position: [0.0, 1.8, -0.8],
      scale: [1.4, 1.4, 1.4]
    });
    const cube3 = realm3d.createCube(1.8, amberMat, { position: [2.6, 1.3, 0.0] });
    realm3d.createPlane(25, 25, groundMat, { position: [0, 0, 0] });

    const lightRot = quat.create();
    quat.fromEuler(lightRot, -0.8, -0.6, 0.0);
    realm3d.createLight(
      { kind: 'directional', color: [1, 1, 1], intensity: 4.0, castShadow: false },
      { position: [0, 10, 0], rotation: lightRot }
    );

    const invRaw = runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { anchorX: 'left', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      clearColor: [0.04, 0.05, 0.08, 1.0],
      antiAliasing: 'none'
    });
    const invAa = runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { anchorX: 'right', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      clearColor: [0.04, 0.05, 0.08, 1.0]
    });

    let isSplitScreen = true;
    let isRotating = true;

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'f', 'space', ' ')) {
        aaIndex = (aaIndex + 1) % aaModes.length;
        const mode = aaModes[aaIndex]!;
        runtime.multiverse.setAntiAliasing(mode);
        console.log(`[mv4] Global Anti-Aliasing: ${mode.toUpperCase()}`);
      } else if (isKey(ev, 's')) {
        isSplitScreen = !isSplitScreen;
        runtime.multiverse.setInvocationEnabled(invRaw, isSplitScreen);
        runtime.multiverse.setInvocationViewport(invAa, {
          anchorX: isSplitScreen ? 'right' : 'left',
          anchorY: 'top',
          width: { vw: isSplitScreen ? 50 : 100 },
          height: { vh: 100 }
        });
      } else if (isKey(ev, 'r')) {
        isRotating = !isRotating;
      }
    });

    const m1 = realm3d.world.getComponent<Model3DComponent>(cube1.entityId, 'Model3D')!;
    const m2 = realm3d.world.getComponent<Model3DComponent>(cube2.entityId, 'Model3D')!;
    const m3 = realm3d.world.getComponent<Model3DComponent>(cube3.entityId, 'Model3D')!;
    const q = quat.create();

    runtime.on('tick', ({ timeMs }) => {
      if (!isRotating) return;
      const t = timeMs * 0.001;
      quat.fromEuler(q, Math.sin(t) * 1.2, Math.cos(t * 0.8) * 0.8, 0);
      m1.setRotation(q);
      quat.fromEuler(q, Math.cos(t * 0.7) * 0.5, -Math.sin(t * 0.9) * 1.1, 0.3);
      m2.setRotation(q);
      quat.fromEuler(q, -Math.sin(t * 0.8) * 0.7, Math.cos(t) * 1.3, 0.5);
      m3.setRotation(q);
    });

    console.log('[mv4] Ready. F/Space: cycle AA | S: split/fullscreen | R: pause | Esc: exit.');
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
