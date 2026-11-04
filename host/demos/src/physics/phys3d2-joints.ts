import {
  type EntityId,
  isKey,
  type Model3DComponent,
  presetsAnchor,
  utils3D
} from '@galfus/engine';
import { attachPhysics3D } from '@galfus/physics-3d';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import { createParticleAtlasTexture } from '../common/textures';

export async function runDemoPhys3d2(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Phys3D-2 Physical Joints & Anchored Emitters',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    const physics = await attachPhysics3D(runtime, realm3d, {
      gravity: [0, -9.81, 0],
      interpolate: true
    });

    const atlasData = createParticleAtlasTexture(64);
    const atlasTex = runtime.resources.createTexture(atlasData.pixels, {
      width: atlasData.width,
      height: atlasData.height,
      format: 'rgba8UnormSrgb'
    });

    const camPos: [number, number, number] = [0, 5.2, 13.5];
    const camTarget: [number, number, number] = [0, 3.5, 0];
    const camera = realm3d.createCamera(
      { fovY: 50, near: 0.1, far: 200, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.15, 0.17, 0.24, 0.3],
      exposure: 1.15,
      ssao: { radius: 0.6, bias: 0.025, intensity: 1.35, power: 1.8 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.04, 0.08, 0.2, 1.0],
        horizonColor: [0.25, 0.42, 0.72, 1.0],
        groundColor: [0.05, 0.05, 0.08, 1.0],
        sunDirection: [0.4, 0.85, 0.35, 0.0],
        sunColor: [1.0, 0.95, 0.85, 2.8],
        intensity: 1.0
      }
    });

    const sunPos: [number, number, number] = [6, 16, 10];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.96, 0.88], intensity: 2.6, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );

    const floorMat = realm3d.createMaterial({
      baseColor: [0.14, 0.16, 0.2, 1.0],
      metallic: 0.2,
      roughness: 0.65
    }).materialId;
    const pivotMat = realm3d.createMaterial({
      baseColor: [0.85, 0.88, 0.92, 1.0],
      metallic: 0.9,
      roughness: 0.2
    }).materialId;
    const chainMat = realm3d.createMaterial({
      baseColor: [1.0, 0.72, 0.2, 1.0],
      metallic: 0.85,
      roughness: 0.2
    }).materialId;
    const ropeMat = realm3d.createMaterial({
      baseColor: [1.0, 0.28, 0.55, 1.0],
      metallic: 0.5,
      roughness: 0.25,
      emissiveColor: [0.25, 0.02, 0.08, 1.0]
    }).materialId;
    const springMat = realm3d.createMaterial({
      baseColor: [0.2, 0.9, 0.55, 1.0],
      metallic: 0.45,
      roughness: 0.25,
      emissiveColor: [0.02, 0.2, 0.1, 1.0]
    }).materialId;
    const sparkParticleMat = realm3d.createMaterial({
      surfaceType: 'additive',
      baseColor: [1.0, 1.0, 1.0, 1.0],
      albedoTextureId: atlasTex
    }).materialId;

    realm3d.createPlane(30, 30, floorMat, { position: [0, 0, 0] });

    const chainRoot = realm3d.createCube(0.6, pivotMat, { position: [0, 7.2, 0] }).entityId;
    physics.addRigidBody(chainRoot, { type: 'fixed' });

    const chainNodes: EntityId[] = [chainRoot];
    for (let i = 1; i <= 5; i++) {
      const link = realm3d.createSphere(0.36, 16, 24, chainMat, {
        position: [i * 0.85, 7.2 - i * 0.45, 0]
      }).entityId;
      realm3d.addCollider(link, { type: 'sphere', radius: 0.36 });
      physics.addRigidBody(link, {
        type: 'dynamic',
        mass: 1.0,
        linearDamping: 0.15,
        angularDamping: 0.2
      });
      chainNodes.push(link);
    }
    realm3d.hierarchy.attachChain(chainNodes, {
      length: 0.96,
      strategy: 'chain'
    });

    const chainTip = chainNodes[chainNodes.length - 1]!;
    const tipLight = realm3d.createLight(
      { kind: 'point', color: [1.0, 0.7, 0.25], intensity: 16.0, range: 12.0, castShadow: false },
      { position: [0, 0, 0] }
    );
    realm3d.hierarchy.attach(tipLight, chainTip, presetsAnchor.static());

    const tipEmitter = realm3d.createParticleEmitter(
      {
        materialId: sparkParticleMat,
        maxParticles: 400,
        spawnRate: 90,
        lifetimeRange: [0.5, 1.2],
        speedRange: [0.6, 2.2],
        spreadAngleRad: Math.PI,
        gravity: [0, -2.5, 0],
        drag: 0.8,
        startSizeRange: [0.22, 0.38],
        endSizeRange: [0.04, 0.08],
        startColor: [1.0, 0.85, 0.3, 1.0],
        endColor: [1.0, 0.2, 0.05, 0.0],
        uvRect: [0.0, 0.0, 0.5, 0.5],
        emissionShape: { type: 'sphere', radius: 0.2 }
      },
      { position: [0, 0, 0] }
    );
    realm3d.hierarchy.attach(tipEmitter.entityId, chainTip, presetsAnchor.static());

    const ropeRoot = realm3d.createCube(0.6, pivotMat, { position: [-4.2, 7.0, 0] }).entityId;
    physics.addRigidBody(ropeRoot, { type: 'fixed' });

    const ropeBall = realm3d.createSphere(0.62, 20, 28, ropeMat, {
      position: [-6.4, 6.2, 0]
    }).entityId;
    realm3d.addCollider(ropeBall, { type: 'sphere', radius: 0.62 });
    physics.addRigidBody(ropeBall, { type: 'dynamic', mass: 2.0, linearDamping: 0.1 });
    realm3d.hierarchy.attach(ropeBall, ropeRoot, presetsAnchor.rope({ maxLength: 2.8 }));

    const springRoot = realm3d.createCube(0.6, pivotMat, { position: [4.2, 7.0, 0] }).entityId;
    physics.addRigidBody(springRoot, { type: 'fixed' });

    const springWeight = realm3d.createCube(0.95, springMat, {
      position: [4.2, 3.2, 0]
    }).entityId;
    realm3d.addCollider(springWeight, { type: 'box', halfExtents: [0.475, 0.475, 0.475] });
    physics.addRigidBody(springWeight, { type: 'dynamic', mass: 1.5, linearDamping: 0.2 });
    realm3d.hierarchy.attach(
      springWeight,
      springRoot,
      presetsAnchor.spring({ restLength: 2.2, stiffness: 55, damping: 3.5 })
    );

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed' && isKey(ev, 'space', ' ')) {
        physics.applyImpulse(chainTip, [12.0, 4.0, 5.0]);
        physics.applyImpulse(ropeBall, [14.0, 6.0, -4.0]);
        physics.applyImpulse(springWeight, [0.0, -14.0, 0.0]);
        realm3d.particleEmitterBurst(tipEmitter, 80);
      }
    });

    let elapsed = 0;
    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      const cx = Math.sin(elapsed * 0.22) * 3.5;
      realm3d.world
        .getComponent<Model3DComponent>(camera.entityId, 'Model3D')
        ?.setPosition(cx, 5.2, 13.5);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoPhys3d2();
}
