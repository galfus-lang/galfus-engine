import {
  type EntityId,
  isKey,
  type Model3DComponent,
  presetsAnchor,
  utils3D
} from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoAnchor1(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Anchor-1 Kinematic Rope, Chain & Spring',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();

    const camPos: [number, number, number] = [0, 7.5, 13.5];
    const camTarget: [number, number, number] = [0, 2.0, 0];
    const camera = realm3d.createCamera(
      { fovY: 50, near: 0.1, far: 200, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.16, 0.18, 0.25, 0.35],
      exposure: 1.15,
      ssao: { radius: 0.55, bias: 0.025, intensity: 1.3, power: 1.8 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.05, 0.1, 0.22, 1.0],
        horizonColor: [0.28, 0.48, 0.78, 1.0],
        groundColor: [0.06, 0.06, 0.08, 1.0],
        sunDirection: [0.4, 0.85, 0.35, 0.0],
        sunColor: [1.0, 0.95, 0.85, 2.8],
        intensity: 1.0
      }
    });

    const sunPos: [number, number, number] = [8, 16, 10];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.96, 0.88], intensity: 2.8, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );

    const floorMat = realm3d.createMaterial({
      baseColor: [0.14, 0.16, 0.2, 1.0],
      metallic: 0.2,
      roughness: 0.65
    }).materialId;
    const leaderMat = realm3d.createMaterial({
      baseColor: [1.0, 0.8, 0.2, 1.0],
      metallic: 0.85,
      roughness: 0.15,
      emissiveColor: [0.45, 0.25, 0.02, 1.0]
    }).materialId;
    const chainMat = realm3d.createMaterial({
      baseColor: [0.2, 0.85, 0.98, 1.0],
      metallic: 0.7,
      roughness: 0.22
    }).materialId;
    const ropeMat = realm3d.createMaterial({
      baseColor: [1.0, 0.3, 0.55, 1.0],
      metallic: 0.5,
      roughness: 0.28,
      emissiveColor: [0.25, 0.02, 0.08, 1.0]
    }).materialId;
    const springMat = realm3d.createMaterial({
      baseColor: [0.25, 0.95, 0.45, 1.0],
      metallic: 0.4,
      roughness: 0.25,
      emissiveColor: [0.04, 0.25, 0.08, 1.0]
    }).materialId;

    realm3d.createPlane(30, 30, floorMat, { position: [0, 0, 0] });

    const leader = realm3d.createSphere(0.55, 24, 32, leaderMat, {
      position: [0, 2.5, 0]
    }).entityId;
    const leaderLight = realm3d.createLight(
      { kind: 'point', color: [1.0, 0.8, 0.3], intensity: 14.0, range: 14.0, castShadow: false },
      { position: [0, 0.8, 0] }
    );
    realm3d.hierarchy.attach(leaderLight, leader, presetsAnchor.translation([0, 0.8, 0]));

    const chainEntities: EntityId[] = [leader];
    for (let i = 1; i <= 6; i++) {
      const seg = realm3d.createCapsule(0.22, 0.45, 12, 16, chainMat, {
        position: [0, 2.5, i * 0.95]
      }).entityId;
      chainEntities.push(seg);
    }
    realm3d.hierarchy.attachChain(chainEntities, {
      length: 0.95,
      strategy: 'chain',
      alignRotation: true
    });

    const ropeFollower = realm3d.createCube(0.75, ropeMat, {
      position: [-2.8, 1.5, 2.0]
    }).entityId;
    realm3d.hierarchy.attach(
      ropeFollower,
      leader,
      presetsAnchor.rope({ maxLength: 2.8, damping: 0.2 })
    );

    const springFollower = realm3d.createTorus(0.5, 0.16, 32, 16, springMat, {
      position: [2.5, 3.2, -1.5]
    }).entityId;
    realm3d.hierarchy.attach(
      springFollower,
      leader,
      presetsAnchor.spring({
        stiffness: 65,
        damping: 6.5,
        restLength: 1.6,
        offset: [0, 0.6, 0]
      })
    );

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });

    let elapsed = 0;
    let autoMove = true;
    const leaderPos: [number, number, number] = [0, 2.5, 0];
    const keysDown = new Set<string>();

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input') {
        const key = ev.logicalKey.toLowerCase();
        if (ev.state === 'pressed') {
          keysDown.add(key);
          if (isKey(ev, 'space', ' ')) autoMove = !autoMove;
        } else {
          keysDown.delete(key);
        }
      }
    });

    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      const manualInput =
        keysDown.has('w') ||
        keysDown.has('s') ||
        keysDown.has('a') ||
        keysDown.has('d') ||
        keysDown.has('q') ||
        keysDown.has('e');

      if (manualInput) {
        autoMove = false;
        const speed = 8.0 * dt;
        if (keysDown.has('w')) leaderPos[2] -= speed;
        if (keysDown.has('s')) leaderPos[2] += speed;
        if (keysDown.has('a')) leaderPos[0] -= speed;
        if (keysDown.has('d')) leaderPos[0] += speed;
        if (keysDown.has('e')) leaderPos[1] = Math.min(6.0, leaderPos[1] + speed);
        if (keysDown.has('q')) leaderPos[1] = Math.max(0.8, leaderPos[1] - speed);
      } else if (autoMove) {
        leaderPos[0] = Math.sin(elapsed * 1.35) * 4.2;
        leaderPos[1] = 2.4 + Math.sin(elapsed * 2.7) * 1.1;
        leaderPos[2] = Math.sin(elapsed * 2.7) * 2.6;
      }

      realm3d.world
        .getComponent<Model3DComponent>(leader, 'Model3D')
        ?.setPosition(leaderPos[0], leaderPos[1], leaderPos[2]);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoAnchor1();
}
