/**
 * Realm 3D Demo 3D-5: 3D GPU Particles (Textured Atlas Billboards + Procedural Radial Glow)
 *
 * Showcases:
 * - Textured 3D particle emitters sampling a 2x2 UV atlas (`uvRect`: Star Flare & Shockwave Ring)
 * - Procedural radial glow fallback emitter (when material has no baseColorTexture)
 * - Reverse-Z depth occlusion against front/back pillars and HDR Bloom
 */
import { isKey, type Model3DComponent } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import { createParticleAtlasTexture } from '../common/textures';

export async function runDemo3d5(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Engine - Demo 3D-5: 3D GPU Particles (Textured Atlas & Reverse-Z)',
    options,
    [1024, 768]
  );

  try {
    const realm3d = runtime.createRealm3D();
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { width: { vw: 100 }, height: { vh: 100 } }
    });

    let bloomEnabled = true;
    let bloomIntensity = 1.8;
    const applyEnv = () => {
      realm3d.setEnvironment({
        ambientColor: [0.03, 0.04, 0.08, 1.0],
        clearColor: [0.01, 0.015, 0.03, 1.0],
        fogMode: 'exponential',
        fogDensity: 0.02,
        fogColor: [0.02, 0.03, 0.06, 1.0],
        exposure: 1.2,
        bloom: {
          enabled: bloomEnabled,
          threshold: 0.35,
          knee: 0.4,
          intensity: bloomIntensity,
          scatter: 1.2
        }
      });
    };
    applyEnv();

    let camDistance = 8.5;
    let camAngle = 0.5;
    let camHeight = 3.8;
    let autoOrbit = true;

    const camera = realm3d.createCamera(
      { kind: 'perspective', fovY: 55, near: 0.1, far: 100, cameraSlot: 1 },
      { position: [Math.sin(camAngle) * camDistance, camHeight, Math.cos(camAngle) * camDistance] }
    );
    realm3d.setCameraLookAt(camera, { target: [0, 1.4, 0] });

    // Upload 2x2 particle texture atlas (Star, Ring, Diamond, Smoke Puff)
    const atlasData = createParticleAtlasTexture(64);
    const atlasTex = runtime.resources.createTexture(atlasData.pixels, {
      width: atlasData.width,
      height: atlasData.height,
      format: 'rgba8Unorm'
    });

    const { materialId: floorMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.12, 0.13, 0.16, 1.0],
      roughness: 0.8,
      metallic: 0.1
    });
    const { materialId: pedestalMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.08, 0.09, 0.12, 1.0],
      roughness: 0.3,
      metallic: 0.7
    });
    const { materialId: pillarMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.35, 0.35, 0.4, 1.0],
      roughness: 0.4,
      metallic: 0.3
    });

    // Material with texture atlas for Star Flare & Ring emitters
    const { materialId: texturedAdditiveMat } = realm3d.createMaterial({
      surfaceType: 'additive',
      albedoTextureId: atlasTex,
      baseColor: [1.0, 1.0, 1.0, 1.0]
    });
    // Material without texture (validates procedural radial circle fallback)
    const { materialId: proceduralAdditiveMat } = realm3d.createMaterial({
      surfaceType: 'additive',
      baseColor: [1.0, 1.0, 1.0, 1.0]
    });
    // Textured alpha-blended smoke material
    const { materialId: smokeMat } = realm3d.createMaterial({
      surfaceType: 'transparent',
      albedoTextureId: atlasTex,
      baseColor: [0.6, 0.6, 0.65, 0.35]
    });

    realm3d.createPlane(20, 20, floorMat, { position: [0, 0, 0] });
    realm3d.createCylinder(1.6, 0.6, 32, pedestalMat, { position: [0, 0.3, 0] });
    realm3d.createCylinder(0.35, 4.5, 24, pillarMat, { position: [1.8, 2.25, 2.4] });
    realm3d.createCylinder(0.35, 4.5, 24, pillarMat, { position: [-1.8, 2.25, -2.4] });

    realm3d.createLight(
      { kind: 'directional', color: [0.3, 0.4, 0.7], intensity: 0.8, castShadow: true },
      { position: [5, 10, 5] }
    );
    realm3d.createLight(
      { kind: 'point', color: [1.0, 0.6, 0.2], intensity: 3.5, range: 12.0, castShadow: true },
      { position: [0, 1.2, 0] }
    );

    // 1. Textured Star Flare Fountain (Top-Left cell [0, 0, 0.5, 0.5] of atlas)
    const fountainEmitter = realm3d.createParticleEmitter(
      {
        label: 'Textured Star Fountain',
        materialId: texturedAdditiveMat,
        uvRect: [0.0, 0.0, 0.5, 0.5],
        maxParticles: 1200,
        spawnRate: 220,
        lifetimeRange: [0.8, 1.6],
        speedRange: [4.5, 7.5],
        direction: [0.0, 1.0, 0.0],
        spreadAngleRad: 0.3,
        gravity: [0.0, -7.5, 0.0],
        drag: 0.05,
        startSizeRange: [0.14, 0.28],
        endSizeRange: [0.02, 0.05],
        startColor: [2.2, 1.6, 0.4, 1.0],
        endColor: [1.2, 0.2, 0.05, 0.0],
        rotationSpeedRange: [-2.5, 2.5],
        emissionShape: { type: 'cone', radius: 0.15, angleRad: 0.25, height: 0.4 }
      },
      { position: [0.0, 0.6, 0.0] }
    );

    // 2. Procedural Radial Glow Vortex (Validates untextured circle fallback)
    const vortexEmitter = realm3d.createParticleEmitter(
      {
        label: 'Procedural Mystic Vortex',
        materialId: proceduralAdditiveMat,
        maxParticles: 800,
        spawnRate: 140,
        lifetimeRange: [1.2, 2.2],
        speedRange: [0.6, 1.8],
        direction: [0.0, 1.0, 0.0],
        spreadAngleRad: 0.5,
        gravity: [0.0, 0.8, 0.0],
        drag: 0.02,
        startSizeRange: [0.15, 0.28],
        endSizeRange: [0.02, 0.06],
        startColor: [0.3, 1.8, 2.8, 0.95],
        endColor: [1.2, 0.2, 1.8, 0.0],
        emissionShape: { type: 'cylinder', radius: 1.5, height: 0.25 }
      },
      { position: [0.0, 0.65, 0.0] }
    );

    // 3. Textured Soft Smoke Emitter (Bottom-Right cell [0.5, 0.5, 1.0, 1.0] of atlas)
    realm3d.createParticleEmitter(
      {
        label: 'Textured Altar Smoke',
        materialId: smokeMat,
        uvRect: [0.5, 0.5, 1.0, 1.0],
        maxParticles: 200,
        spawnRate: 20,
        lifetimeRange: [2.0, 3.5],
        speedRange: [0.2, 0.6],
        direction: [0.0, 1.0, 0.0],
        spreadAngleRad: 0.4,
        gravity: [0.0, 0.25, 0.0],
        drag: 0.08,
        startSizeRange: [0.25, 0.4],
        endSizeRange: [0.9, 1.4],
        startColor: [0.35, 0.35, 0.4, 0.35],
        endColor: [0.1, 0.1, 0.15, 0.0],
        rotationSpeedRange: [-0.5, 0.5],
        emissionShape: { type: 'sphere', radius: 0.35 }
      },
      { position: [0.0, 0.7, 0.0] }
    );

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'p', 'space', ' ')) {
        realm3d.particleEmitterBurst(fountainEmitter, 200);
        realm3d.particleEmitterBurst(vortexEmitter, 100);
      } else if (isKey(ev, 'o')) {
        autoOrbit = !autoOrbit;
      } else if (isKey(ev, 'b')) {
        bloomEnabled = !bloomEnabled;
        applyEnv();
      } else if (isKey(ev, 'arrowleft')) camAngle -= 0.08;
      else if (isKey(ev, 'arrowright')) camAngle += 0.08;
      else if (isKey(ev, 'arrowup')) camHeight = Math.min(camHeight + 0.3, 10.0);
      else if (isKey(ev, 'arrowdown')) camHeight = Math.max(camHeight - 0.3, 0.5);
      else if (isKey(ev, 'w')) camDistance = Math.max(camDistance - 0.4, 2.5);
      else if (isKey(ev, 's')) camDistance = Math.min(camDistance + 0.4, 18.0);
    });

    const camModel = realm3d.world.getComponent<Model3DComponent>(camera.entityId, 'Model3D')!;
    runtime.on('tick', ({ dt }) => {
      if (autoOrbit) camAngle += dt * 0.4;
      camModel.setPosition(
        Math.sin(camAngle) * camDistance,
        camHeight,
        Math.cos(camAngle) * camDistance
      );
    });

    console.log(
      '[3d5] Ready. Space/P: particle burst | O: auto-orbit | B: toggle bloom | Esc: exit.'
    );
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
