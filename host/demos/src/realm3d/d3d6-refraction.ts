import { type Model3DComponent, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, getScrollY, type HostDemoOptions } from '../common/options';

export async function runDemo3d6(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 3D-6 Transmission & Refraction',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();

    const camPos: [number, number, number] = [0, 3.0, 9.5];
    const camTarget: [number, number, number] = [0, 1.5, 0];
    const camera = realm3d.createCamera(
      { fovY: 50, near: 0.1, far: 200, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.18, 0.2, 0.25, 0.3],
      exposure: 1.15,
      ssao: { radius: 0.6, bias: 0.025, intensity: 1.4, power: 1.8 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.06, 0.12, 0.26, 1.0],
        horizonColor: [0.35, 0.55, 0.85, 1.0],
        groundColor: [0.08, 0.08, 0.1, 1.0],
        sunDirection: [0.4, 0.8, 0.4, 0.0],
        sunColor: [1.0, 0.96, 0.88, 3.0],
        intensity: 1.0
      }
    });

    const sunPos: [number, number, number] = [6, 12, 6];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.96, 0.88], intensity: 3.2, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );
    realm3d.createLight(
      { kind: 'point', color: [1.0, 0.2, 0.5], intensity: 14.0, range: 16.0, castShadow: true },
      { position: [-3.5, 2.5, -2.5] }
    );
    realm3d.createLight(
      { kind: 'point', color: [0.1, 0.85, 1.0], intensity: 14.0, range: 16.0, castShadow: true },
      { position: [3.5, 2.5, -2.5] }
    );

    const floorMat = realm3d.createMaterial({
      baseColor: [0.22, 0.24, 0.28, 1.0],
      metallic: 0.1,
      roughness: 0.65
    }).materialId;
    const pillarGoldMat = realm3d.createMaterial({
      baseColor: [1.0, 0.78, 0.25, 1.0],
      metallic: 0.85,
      roughness: 0.2
    }).materialId;
    const pillarCrimsonMat = realm3d.createMaterial({
      baseColor: [0.95, 0.15, 0.3, 1.0],
      metallic: 0.2,
      roughness: 0.3,
      emissiveColor: [0.3, 0.02, 0.05, 1.0]
    }).materialId;
    const pillarCyanMat = realm3d.createMaterial({
      baseColor: [0.1, 0.85, 0.95, 1.0],
      metallic: 0.3,
      roughness: 0.25,
      emissiveColor: [0.02, 0.25, 0.3, 1.0]
    }).materialId;
    const pillarEmeraldMat = realm3d.createMaterial({
      baseColor: [0.15, 0.9, 0.4, 1.0],
      metallic: 0.2,
      roughness: 0.3,
      emissiveColor: [0.02, 0.2, 0.05, 1.0]
    }).materialId;

    const glassClearMat = realm3d.createMaterial({
      surfaceType: 'refractive',
      baseColor: [0.95, 0.98, 1.0, 1.0],
      metallic: 0.0,
      roughness: 0.04,
      refractionIndex: 1.52
    }).materialId;
    const glassFrostedMat = realm3d.createMaterial({
      surfaceType: 'refractive',
      baseColor: [0.55, 0.88, 1.0, 1.0],
      metallic: 0.0,
      roughness: 0.38,
      refractionIndex: 1.48
    }).materialId;
    const glassRubyMat = realm3d.createMaterial({
      surfaceType: 'refractive',
      baseColor: [1.0, 0.3, 0.55, 1.0],
      metallic: 0.0,
      roughness: 0.08,
      refractionIndex: 2.2
    }).materialId;
    const glassAmberMat = realm3d.createMaterial({
      surfaceType: 'refractive',
      baseColor: [1.0, 0.82, 0.35, 1.0],
      metallic: 0.0,
      roughness: 0.12,
      refractionIndex: 1.65
    }).materialId;

    realm3d.createPlane(30, 30, floorMat, { position: [0, 0, 0] });

    const pillarMats = [pillarCrimsonMat, pillarGoldMat, pillarCyanMat, pillarEmeraldMat];
    const backdropEntities: number[] = [];
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 1.6;
      const mat = pillarMats[i % pillarMats.length]!;
      realm3d.createCylinder(0.35, 4.0, 24, mat, { position: [x, 2.0, -3.2] });
      const orb = realm3d.createSphere(0.45, 20, 24, mat, {
        position: [x, 1.5 + Math.sin(i) * 0.6, -1.6]
      }).entityId;
      backdropEntities.push(orb);
    }

    const glassLens = realm3d.createSphere(1.25, 32, 48, glassClearMat, {
      position: [-3.0, 1.7, 1.5]
    }).entityId;
    const frostedTorus = realm3d.createTorus(1.05, 0.38, 48, 24, glassFrostedMat, {
      position: [0.0, 1.7, 1.8]
    }).entityId;
    const rubyCube = realm3d.createCube(1.8, glassRubyMat, {
      position: [3.0, 1.7, 1.5]
    }).entityId;
    const amberCapsule = realm3d.createCapsule(0.45, 1.2, 16, 24, glassAmberMat, {
      position: [0.0, 3.4, 0.6]
    }).entityId;

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });

    let elapsed = 0;
    let orbitYaw = 0;
    let orbitPitch = 0.25;
    let orbitDist = 9.5;
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
          Math.min(1.2, orbitPitch + (ev.position[1] - lastMouse[1]) * 0.007)
        );
        lastMouse = ev.position;
      } else if (ev.type === 'scroll') {
        orbitDist = Math.max(4.0, Math.min(18.0, orbitDist - getScrollY(ev.delta) * 0.5));
      }
    });

    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      if (!isDragging) orbitYaw = Math.sin(elapsed * 0.35) * 0.55;

      const cx = Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      const cy = Math.sin(orbitPitch) * orbitDist + 1.2;
      const cz = Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      realm3d.world
        .getComponent<Model3DComponent>(camera.entityId, 'Model3D')
        ?.setPosition(cx, cy, cz);

      for (let i = 0; i < backdropEntities.length; i++) {
        const x = (i - 3) * 1.6;
        const y = 1.6 + Math.sin(elapsed * 2.0 + i * 0.9) * 0.85;
        realm3d.world
          .getComponent<Model3DComponent>(backdropEntities[i]!, 'Model3D')
          ?.setPosition(x, y, -1.6);
      }

      realm3d.world
        .getComponent<Model3DComponent>(glassLens, 'Model3D')
        ?.setPosition(-3.0, 1.7 + Math.sin(elapsed * 1.5) * 0.25, 1.5);
      realm3d.world
        .getComponent<Model3DComponent>(frostedTorus, 'Model3D')
        ?.setTRS(
          [0, 1.7, 1.8],
          utils3D.quatFromAxisAngle(
            [Math.sin(elapsed * 0.7), 1, Math.cos(elapsed * 0.5)],
            elapsed * 1.1
          ),
          [1, 1, 1]
        );
      realm3d.world
        .getComponent<Model3DComponent>(rubyCube, 'Model3D')
        ?.setTRS(
          [3.0, 1.7, 1.5],
          utils3D.quatFromAxisAngle([0.6, 1.0, 0.3], elapsed * 0.85),
          [1, 1, 1]
        );
      realm3d.world
        .getComponent<Model3DComponent>(amberCapsule, 'Model3D')
        ?.setTRS(
          [Math.sin(elapsed * 0.9) * 1.8, 3.3, 0.6],
          utils3D.quatFromAxisAngle([0, 0, 1], Math.PI * 0.5 + Math.sin(elapsed * 1.3) * 0.3),
          [1, 1, 1]
        );
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemo3d6();
}
