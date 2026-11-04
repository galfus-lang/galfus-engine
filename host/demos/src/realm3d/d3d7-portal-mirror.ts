import { isKey, type Model3DComponent, type Portal3DComponent, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, getScrollY, type HostDemoOptions } from '../common/options';

export async function runDemo3d7(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 3D-7 Stencil Portals & Planar Mirrors',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();

    const camPos: [number, number, number] = [0, 3.2, 10.5];
    const camTarget: [number, number, number] = [0, 1.8, 0];
    const camera = realm3d.createCamera(
      { fovY: 52, near: 0.1, far: 250, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.16, 0.18, 0.24, 0.3],
      exposure: 1.15,
      ssao: { radius: 0.55, bias: 0.025, intensity: 1.3, power: 1.8 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.05, 0.1, 0.22, 1.0],
        horizonColor: [0.28, 0.45, 0.75, 1.0],
        groundColor: [0.06, 0.06, 0.08, 1.0],
        sunDirection: [0.3, 0.85, 0.4, 0.0],
        sunColor: [1.0, 0.95, 0.85, 2.8],
        intensity: 1.0
      }
    });

    const sunPos: [number, number, number] = [5, 14, 8];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.95, 0.88], intensity: 2.8, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );
    realm3d.createLight(
      { kind: 'point', color: [0.2, 0.85, 1.0], intensity: 12.0, range: 16.0, castShadow: true },
      { position: [0, 3.5, 2.0] }
    );
    realm3d.createLight(
      { kind: 'point', color: [1.0, 0.35, 0.1], intensity: 18.0, range: 22.0, castShadow: true },
      { position: [25, 4.5, 0] }
    );
    realm3d.createLight(
      { kind: 'point', color: [1.0, 0.15, 0.6], intensity: 14.0, range: 18.0, castShadow: false },
      { position: [25, 2.5, -4.0] }
    );

    const floorMainMat = realm3d.createMaterial({
      baseColor: [0.2, 0.22, 0.27, 1.0],
      metallic: 0.15,
      roughness: 0.6
    }).materialId;
    const frameMirrorMat = realm3d.createMaterial({
      baseColor: [0.85, 0.88, 0.95, 1.0],
      metallic: 0.9,
      roughness: 0.15
    }).materialId;
    const framePortalMat = realm3d.createMaterial({
      baseColor: [1.0, 0.45, 0.1, 1.0],
      metallic: 0.7,
      roughness: 0.2,
      emissiveColor: [0.8, 0.25, 0.02, 1.0]
    }).materialId;
    const heroGoldMat = realm3d.createMaterial({
      baseColor: [1.0, 0.78, 0.22, 1.0],
      metallic: 0.85,
      roughness: 0.18
    }).materialId;
    const heroCyanMat = realm3d.createMaterial({
      baseColor: [0.1, 0.9, 0.95, 1.0],
      metallic: 0.3,
      roughness: 0.2,
      emissiveColor: [0.05, 0.35, 0.4, 1.0]
    }).materialId;
    const mirrorTintMat = realm3d.createMaterial({
      surfaceType: 'mirror',
      baseColor: [0.85, 0.92, 1.0, 1.0],
      metallic: 0.9,
      roughness: 0.05,
      reflectance: 0.9
    }).materialId;
    const portalSurfaceMat = realm3d.createMaterial({
      surfaceType: 'portal',
      baseColor: [1.0, 1.0, 1.0, 1.0],
      metallic: 0.0,
      roughness: 1.0
    }).materialId;
    const sanctuaryFloorMat = realm3d.createMaterial({
      baseColor: [0.28, 0.12, 0.18, 1.0],
      metallic: 0.3,
      roughness: 0.4
    }).materialId;
    const sanctuaryCrystalMat = realm3d.createMaterial({
      baseColor: [1.0, 0.2, 0.55, 1.0],
      metallic: 0.4,
      roughness: 0.15,
      emissiveColor: [0.9, 0.1, 0.35, 1.0]
    }).materialId;
    const sanctuaryPillarMat = realm3d.createMaterial({
      baseColor: [0.95, 0.6, 0.15, 1.0],
      metallic: 0.8,
      roughness: 0.2,
      emissiveColor: [0.25, 0.08, 0.0, 1.0]
    }).materialId;

    realm3d.createPlane(22, 22, floorMainMat, { position: [0, 0, 0] });

    const mirrorQuad = realm3d.createPrimitive(
      { kind: 'quad', width: 3.4, height: 3.8 },
      mirrorTintMat,
      {
        position: [-2.6, 2.0, -2.5],
        rotation: utils3D.quatFromAxisAngle([0, 1, 0], 0.22)
      }
    );
    const mirrorRot = utils3D.quatFromAxisAngle([0, 1, 0], 0.22);
    realm3d.createCylinder(0.12, 4.0, 16, frameMirrorMat, {
      position: [-4.2, 2.0, -2.13],
      rotation: mirrorRot
    });
    realm3d.createCylinder(0.12, 4.0, 16, frameMirrorMat, {
      position: [-1.0, 2.0, -2.87],
      rotation: mirrorRot
    });

    const portalQuad = realm3d.createPrimitive(
      { kind: 'quad', width: 3.4, height: 3.8 },
      portalSurfaceMat,
      {
        position: [2.6, 2.0, -2.5],
        rotation: utils3D.quatFromAxisAngle([0, 1, 0], -0.22)
      }
    );
    const portalRot = utils3D.quatFromAxisAngle([0, 1, 0], -0.22);
    realm3d.createCylinder(0.12, 4.0, 16, framePortalMat, {
      position: [1.0, 2.0, -2.87],
      rotation: portalRot
    });
    realm3d.createCylinder(0.12, 4.0, 16, framePortalMat, {
      position: [4.2, 2.0, -2.13],
      rotation: portalRot
    });

    const heroTorus = realm3d.createTorus(0.85, 0.28, 48, 24, heroGoldMat, {
      position: [0, 1.8, 0.5]
    }).entityId;
    const heroOrb1 = realm3d.createSphere(0.45, 24, 32, heroCyanMat, {
      position: [-1.8, 1.2, 1.2]
    }).entityId;
    const heroOrb2 = realm3d.createSphere(0.45, 24, 32, framePortalMat, {
      position: [1.8, 1.2, 1.2]
    }).entityId;

    realm3d.createPlane(22, 22, sanctuaryFloorMat, { position: [25, 0, 0] });
    const sanctPyramid = realm3d.createPyramid(1.8, 1.8, 2.4, sanctuaryCrystalMat, {
      position: [25, 1.8, -3.5]
    }).entityId;
    const sanctTorus = realm3d.createTorus(1.4, 0.25, 48, 24, sanctuaryPillarMat, {
      position: [25, 2.2, -3.5]
    }).entityId;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      realm3d.createCylinder(0.35, 4.0, 24, sanctuaryPillarMat, {
        position: [25 + Math.cos(angle) * 4.2, 2.0, -3.5 + Math.sin(angle) * 4.2]
      });
    }

    const mirrorEntity = realm3d.createPortal({
      modelId: mirrorQuad.modelId,
      active: true
    });
    const portalEntity = realm3d.createPortal({
      modelId: portalQuad.modelId,
      exitTransform: {
        position: [25.0, 2.0, 1.5],
        rotation: [0, 0, 0, 1]
      },
      active: true
    });

    const mirrorPortalId = realm3d.world.getComponent<Portal3DComponent>(
      mirrorEntity,
      'Portal3D'
    )!.portalId;
    const telePortalId = realm3d.world.getComponent<Portal3DComponent>(
      portalEntity,
      'Portal3D'
    )!.portalId;

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });
    realm3d.flush();

    let elapsed = 0;
    let orbitYaw = 0;
    let orbitPitch = 0.22;
    let orbitDist = 10.5;
    let isDragging = false;
    let lastMouse: [number, number] = [0, 0];
    let mirrorActive = true;
    let portalActive = true;

    runtime.on('pointer', (ev) => {
      if (ev.type === 'button' && ev.button === 'primary') {
        isDragging = ev.state === 'pressed';
        lastMouse = ev.position;
      } else if (ev.type === 'move' && isDragging) {
        orbitYaw -= (ev.position[0] - lastMouse[0]) * 0.007;
        orbitPitch = Math.max(
          0.05,
          Math.min(1.1, orbitPitch + (ev.position[1] - lastMouse[1]) * 0.007)
        );
        lastMouse = ev.position;
      } else if (ev.type === 'scroll') {
        orbitDist = Math.max(4.5, Math.min(18.0, orbitDist - getScrollY(ev.delta) * 0.5));
      }
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed') {
        if (isKey(ev, '1')) {
          mirrorActive = !mirrorActive;
          realm3d.setPortalActive(mirrorPortalId, mirrorActive);
          console.log(`[3d7] Mirror toggled: ${mirrorActive ? 'ON' : 'OFF'}`);
        } else if (isKey(ev, '2')) {
          portalActive = !portalActive;
          realm3d.setPortalActive(telePortalId, portalActive);
          console.log(`[3d7] Portal toggled: ${portalActive ? 'ON' : 'OFF'}`);
        }
      }
    });

    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      if (!isDragging) orbitYaw = Math.sin(elapsed * 0.4) * 0.55;

      const cx = Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      const cy = Math.sin(orbitPitch) * orbitDist + 1.2;
      const cz = Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      realm3d.world
        .getComponent<Model3DComponent>(camera.entityId, 'Model3D')
        ?.setPosition(cx, cy, cz);

      realm3d.world
        .getComponent<Model3DComponent>(heroTorus, 'Model3D')
        ?.setTRS(
          [Math.sin(elapsed * 0.9) * 1.2, 1.8 + Math.cos(elapsed * 1.5) * 0.3, 0.5],
          utils3D.quatFromAxisAngle([0.5, 1.0, 0.3], elapsed * 1.3),
          [1, 1, 1]
        );
      realm3d.world
        .getComponent<Model3DComponent>(heroOrb1, 'Model3D')
        ?.setPosition(
          Math.cos(elapsed * 1.4) * 2.2,
          1.2 + Math.sin(elapsed * 2.2) * 0.4,
          0.6 + Math.sin(elapsed * 1.4) * 1.2
        );
      realm3d.world
        .getComponent<Model3DComponent>(heroOrb2, 'Model3D')
        ?.setPosition(
          Math.cos(elapsed * 1.4 + Math.PI) * 2.2,
          1.2 + Math.cos(elapsed * 2.2) * 0.4,
          0.6 + Math.sin(elapsed * 1.4 + Math.PI) * 1.2
        );
      realm3d.world
        .getComponent<Model3DComponent>(sanctPyramid, 'Model3D')
        ?.setTRS(
          [25, 1.8 + Math.sin(elapsed * 2.0) * 0.35, -3.5],
          utils3D.quatFromAxisAngle([0, 1, 0], elapsed * 1.1),
          [1, 1, 1]
        );
      realm3d.world
        .getComponent<Model3DComponent>(sanctTorus, 'Model3D')
        ?.setTRS(
          [25, 2.0, -3.5],
          utils3D.quatFromAxisAngle([1, 0.5, 0.2], -elapsed * 0.9),
          [1, 1, 1]
        );
    });

    console.log(
      '[3d7] Ready. 1: toggle Mirror | 2: toggle Portal | Drag/Scroll: orbit/zoom | Esc: exit.'
    );
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemo3d7();
}
