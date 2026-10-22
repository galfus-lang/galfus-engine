import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { createPrimitiveGeometry } from './geometry_3d.ts';
import { extractKey, quatFromLookAt } from './utils.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const INVOCATION_MAIN = 100;

const CAMERA_ID = 1;

// Geometries
const GEOM_PLANE_ID = 1;
const GEOM_PEDESTAL_ID = 2;
const GEOM_PILLAR_ID = 3;

// Materials
const MAT_FLOOR_ID = 1;
const MAT_PEDESTAL_ID = 2;
const MAT_PILLAR_ID = 3;
const MAT_PARTICLE_ADDITIVE_ID = 4;
const MAT_PARTICLE_SMOKE_ID = 5;

// Models
const MODEL_FLOOR_ID = 1;
const MODEL_PEDESTAL_ID = 2;
const MODEL_PILLAR_FRONT_ID = 3;
const MODEL_PILLAR_BACK_ID = 4;

// Lights
const LIGHT_DIR_ID = 1;
const LIGHT_POINT_ID = 2;

// Particle Emitters
const EMITTER_FOUNTAIN_ID = 1;
const EMITTER_VORTEX_ID = 2;
const EMITTER_SMOKE_ID = 3;

export async function runDemo3d5(): Promise<void> {
  console.log('=== Galfus Engine - Demo 3D-5 (TypeScript / Bun): 3D Particles ===\n');

  const galfus = new GalfusBun();

  console.log('==> Initializing Platform Context...');
  try {
    galfus.platformInit();
  } catch (err) {
    console.error('Failed to initialize platform context:', err);
    process.exit(1);
  }

  const windowId = 1;
  console.log('==> Creating window...');
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 3D-5: 3D GPU Particles & Reverse-Z',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });

  console.log('==> Attaching window to Multiverse...');
  galfus.multiverseAttachWindow(windowId);

  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });

  console.log(`==> Creating Realm3D (#${REALM_3D})...`);
  galfus.realm3dCreate(REALM_3D);

  // 1. Environment: Night atmosphere with HDR Bloom
  let bloomEnabled = true;
  let bloomIntensity = 1.8;
  let bloomThreshold = 0.35;
  let bloomScatter = 1.2;

  const applyEnvironment = () => {
    galfus.realm3dSetEnvironment(REALM_3D, {
      ambientColor: [0.03, 0.04, 0.08, 1.0],
      clearColor: [0.01, 0.015, 0.03, 1.0],
      fogMode: 'exponential',
      fogDensity: 0.02,
      fogColor: [0.02, 0.03, 0.06, 1.0],
      exposure: 1.2,
      bloom: {
        enabled: bloomEnabled,
        threshold: bloomThreshold,
        knee: 0.4,
        intensity: bloomIntensity,
        scatter: bloomScatter
      }
    });
  };
  applyEnvironment();

  // 2. Camera: Orbiting perspective with Reverse-Z
  let camDistance = 8.5;
  let camAngle = 0.5;
  let camHeight = 3.8;
  let autoOrbit = true;

  const updateCamera = () => {
    const camPos: [number, number, number] = [
      Math.sin(camAngle) * camDistance,
      camHeight,
      Math.cos(camAngle) * camDistance
    ];
    const camRot = quatFromLookAt(camPos, [0.0, 1.4, 0.0]);

    galfus.realm3dCreateCamera(
      REALM_3D,
      CAMERA_ID,
      {
        kind: 'perspective',
        fovY: 55.0,
        near: 0.1,
        far: 100.0,
        cameraSlot: 1
      },
      {
        position: camPos,
        rotation: camRot,
        scale: [1, 1, 1]
      }
    );
  };
  updateCamera();

  // 3. Geometries: Floor, Pedestal, and Occlusion Pillars
  createPrimitiveGeometry(galfus, REALM_3D, GEOM_PLANE_ID, {
    primitive: 'plane',
    size: 20.0
  });

  createPrimitiveGeometry(galfus, REALM_3D, GEOM_PEDESTAL_ID, {
    primitive: 'cylinder',
    radius: 1.6,
    size: 0.6,
    subdivisions: 32
  });

  createPrimitiveGeometry(galfus, REALM_3D, GEOM_PILLAR_ID, {
    primitive: 'cylinder',
    radius: 0.35,
    size: 4.5,
    subdivisions: 24
  });

  // 4. Materials
  galfus.realm3dCreateMaterial(REALM_3D, MAT_FLOOR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.12, 0.13, 0.16, 1.0],
    roughness: 0.8,
    metallic: 0.1
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_PEDESTAL_ID, {
    surfaceType: 'opaque',
    baseColor: [0.08, 0.09, 0.12, 1.0],
    roughness: 0.3,
    metallic: 0.7
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_PILLAR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.35, 0.35, 0.4, 1.0],
    roughness: 0.4,
    metallic: 0.3
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_PARTICLE_ADDITIVE_ID, {
    surfaceType: 'additive',
    baseColor: [1.0, 1.0, 1.0, 1.0]
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_PARTICLE_SMOKE_ID, {
    surfaceType: 'transparent',
    baseColor: [0.6, 0.6, 0.65, 0.3]
  });

  // 5. Models (Pedestal at center, pillars front and back to test Reverse-Z occlusion)
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FLOOR_ID,
    { geometryId: GEOM_PLANE_ID, materialId: MAT_FLOOR_ID },
    { position: [0.0, 0.0, 0.0], scale: [1, 1, 1] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PEDESTAL_ID,
    { geometryId: GEOM_PEDESTAL_ID, materialId: MAT_PEDESTAL_ID },
    { position: [0.0, 0.3, 0.0], scale: [1, 1, 1] }
  );

  // Front pillar (between camera initial position and emitter)
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PILLAR_FRONT_ID,
    { geometryId: GEOM_PILLAR_ID, materialId: MAT_PILLAR_ID },
    { position: [1.8, 2.25, 2.4], scale: [1, 1, 1] }
  );

  // Back pillar (behind emitter)
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PILLAR_BACK_ID,
    { geometryId: GEOM_PILLAR_ID, materialId: MAT_PILLAR_ID },
    { position: [-1.8, 2.25, -2.4], scale: [1, 1, 1] }
  );

  // 6. Lights
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_DIR_ID,
    {
      kind: 'directional',
      color: [0.3, 0.4, 0.7],
      intensity: 0.8,
      castShadow: true
    },
    { position: [5.0, 10.0, 5.0], rotation: [0, 0, 0, 1] }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_POINT_ID,
    {
      kind: 'point',
      color: [1.0, 0.6, 0.2],
      intensity: 3.5,
      range: 12.0,
      castShadow: true
    },
    { position: [0.0, 1.2, 0.0] }
  );

  // 7. Particle Emitter 1: Golden Sparks Fountain (Cone shape, Additive)
  galfus.realm3dCreateParticleEmitter(
    REALM_3D,
    EMITTER_FOUNTAIN_ID,
    {
      label: 'Spark Fountain',
      materialId: MAT_PARTICLE_ADDITIVE_ID,
      maxParticles: 1200,
      spawnRate: 250,
      lifetimeRange: [0.8, 1.6],
      speedRange: [4.5, 7.5],
      direction: [0.0, 1.0, 0.0],
      spreadAngleRad: 0.3,
      gravity: [0.0, -7.5, 0.0],
      drag: 0.05,
      startSizeRange: [0.08, 0.16],
      endSizeRange: [0.01, 0.03],
      startColor: [2.2, 1.6, 0.4, 1.0],
      endColor: [1.2, 0.2, 0.05, 0.0],
      emissionShape: {
        type: 'cone',
        radius: 0.15,
        angleRad: 0.25,
        height: 0.4
      },
      active: true
    },
    { position: [0.0, 0.6, 0.0] }
  );

  // 8. Particle Emitter 2: Mystic Energy Vortex (Cylinder shape, Rising Additive)
  galfus.realm3dCreateParticleEmitter(
    REALM_3D,
    EMITTER_VORTEX_ID,
    {
      label: 'Mystic Vortex',
      materialId: MAT_PARTICLE_ADDITIVE_ID,
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
      rotationSpeedRange: [-3.0, 3.0],
      emissionShape: {
        type: 'cylinder',
        radius: 1.5,
        height: 0.25
      },
      active: true
    },
    { position: [0.0, 0.65, 0.0] }
  );

  // 9. Particle Emitter 3: Soft Ambient Smoke (Sphere shape, Alpha)
  galfus.realm3dCreateParticleEmitter(
    REALM_3D,
    EMITTER_SMOKE_ID,
    {
      label: 'Altar Smoke',
      materialId: MAT_PARTICLE_SMOKE_ID,
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
      emissionShape: {
        type: 'sphere',
        radius: 0.35
      },
      active: true
    },
    { position: [0.0, 0.7, 0.0] }
  );

  // 10. Invocation Pipeline
  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    enabled: true
  });

  console.log('✔ Scene setup complete! Controls:');
  console.log('  [P] or [Space] - Trigger massive particle burst (200 particles)');
  console.log('  [O]           - Toggle automatic camera orbit');
  console.log('  [B]           - Toggle Bloom HDR glow');
  console.log('  [1] / [2]     - Decrease / Increase Bloom Intensity');
  console.log('  [3] / [4]     - Decrease / Increase Bloom Threshold');
  console.log('  [5] / [6]     - Decrease / Increase Bloom Scatter (Halo radius)');
  console.log('  [Left / Right]- Orbit camera left / right');
  console.log('  [Up / Down]   - Move camera height');
  console.log('  [W / S]       - Zoom in / out');
  console.log('  [Esc] or [Q]  - Exit demo\n');

  let running = true;
  let frameCount = 0;
  let lastTime = performance.now();

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;
    frameCount++;

    // Handle Input Events
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          console.log('\nWindow close requested. Exiting demo...');
          running = false;
          break;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        if (ev.state === 'pressed') {
          const key = extractKey(ev);
          if (key === 'escape' || key === 'q') {
            console.log('\nExiting demo...');
            running = false;
            break;
          } else if (key === 'p' || key === ' ' || key === 'space') {
            console.log('>> Particle burst triggered! (+200 fountain, +100 vortex)');
            galfus.realm3dParticleEmitterBurst(REALM_3D, EMITTER_FOUNTAIN_ID, 200);
            galfus.realm3dParticleEmitterBurst(REALM_3D, EMITTER_VORTEX_ID, 100);
          } else if (key === 'o') {
            autoOrbit = !autoOrbit;
            console.log(`Auto-orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
          } else if (key === 'b') {
            bloomEnabled = !bloomEnabled;
            applyEnvironment();
            console.log(`Bloom HDR: ${bloomEnabled ? 'ON' : 'OFF'}`);
          } else if (key === '1') {
            bloomIntensity = Math.max(0.2, bloomIntensity - 0.2);
            applyEnvironment();
            console.log(`[Bloom] Intensity: ${bloomIntensity.toFixed(1)}`);
          } else if (key === '2') {
            bloomIntensity = Math.min(5.0, bloomIntensity + 0.2);
            applyEnvironment();
            console.log(`[Bloom] Intensity: ${bloomIntensity.toFixed(1)}`);
          } else if (key === '3') {
            bloomThreshold = Math.max(0.05, bloomThreshold - 0.1);
            applyEnvironment();
            console.log(`[Bloom] Threshold: ${bloomThreshold.toFixed(2)}`);
          } else if (key === '4') {
            bloomThreshold = Math.min(2.0, bloomThreshold + 0.1);
            applyEnvironment();
            console.log(`[Bloom] Threshold: ${bloomThreshold.toFixed(2)}`);
          } else if (key === '5') {
            bloomScatter = Math.max(0.2, bloomScatter - 0.2);
            applyEnvironment();
            console.log(`[Bloom] Scatter: ${bloomScatter.toFixed(1)}`);
          } else if (key === '6') {
            bloomScatter = Math.min(4.0, bloomScatter + 0.2);
            applyEnvironment();
            console.log(`[Bloom] Scatter: ${bloomScatter.toFixed(1)}`);
          } else if (key === 'arrowleft') {
            camAngle -= 0.08;
            updateCamera();
          } else if (key === 'arrowright') {
            camAngle += 0.08;
            updateCamera();
          } else if (key === 'arrowup') {
            camHeight = Math.min(camHeight + 0.3, 10.0);
            updateCamera();
          } else if (key === 'arrowdown') {
            camHeight = Math.max(camHeight - 0.3, 0.5);
            updateCamera();
          } else if (key === 'w') {
            camDistance = Math.max(camDistance - 0.4, 2.5);
            updateCamera();
          } else if (key === 's') {
            camDistance = Math.min(camDistance + 0.4, 18.0);
            updateCamera();
          }
        }
      }
    }

    if (autoOrbit) {
      camAngle += dt * 0.4;
      updateCamera();
    }

    // Render frame
    galfus.multiverseDispatch(frameCount, dt);
    await Bun.sleep(1);
  }
}
