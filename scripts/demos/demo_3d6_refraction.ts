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
const GEOM_TORUS_SPHERE_ID = 4;
const GEOM_PYRAMID_ID = 5;
const GEOM_CYLINDER_ID = 6;

// Materials
const MAT_FLOOR_ID = 1;
const MAT_PEDESTAL_ID = 2;
const MAT_PILLAR_ID = 3;
const MAT_GLASS_SPHERE_ID = 4;
const MAT_RUBY_PYRAMID_ID = 5;
const MAT_EMERALD_LENS_ID = 6;
const MAT_PARTICLE_ID = 7;

// Models
const MODEL_FLOOR_ID = 1;
const MODEL_PEDESTAL_ID = 2;
const MODEL_PILLAR_LEFT_ID = 3;
const MODEL_PILLAR_RIGHT_ID = 4;
const MODEL_PILLAR_BACK_ID = 5;
const MODEL_GLASS_SPHERE_ID = 6;
const MODEL_RUBY_PYRAMID_ID = 7;
const MODEL_EMERALD_LENS_ID = 8;

// Lights
const LIGHT_DIR_ID = 1;
const LIGHT_POINT_CENTER_ID = 2;
const LIGHT_POINT_BACK_ID = 3;

// Particle Emitter
const EMITTER_FOUNTAIN_ID = 1;

interface CrystalPalette {
  name: string;
  color: [number, number, number, number];
}

const CRYSTAL_PALETTES: CrystalPalette[] = [
  { name: 'Pure Diamond (Clear)', color: [0.95, 0.98, 1.0, 0.12] },
  { name: 'Sapphire (Deep Blue)', color: [0.1, 0.45, 0.95, 0.35] },
  { name: 'Ruby (Crimson Red)', color: [0.95, 0.1, 0.25, 0.35] },
  { name: 'Emerald (Vibrant Green)', color: [0.1, 0.85, 0.35, 0.32] },
  { name: 'Amber (Warm Gold)', color: [0.95, 0.65, 0.1, 0.35] },
  { name: 'Amethyst (Mystic Purple)', color: [0.75, 0.2, 0.95, 0.35] }
];

export async function runDemo3d6(): Promise<void> {
  console.log('=== Galfus Engine - Demo 3D-6 (TypeScript / Bun): 3D Refraction ===\n');

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
    title: 'Galfus Engine - Demo 3D-6: Screen-Space Optical Refraction & Glass',
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

  // 1. Atmospheric Environment with HDR Bloom & Fog
  let bloomEnabled = true;
  const applyEnvironment = () => {
    galfus.realm3dSetEnvironment(REALM_3D, {
      ambientColor: [0.04, 0.05, 0.08, 1.0],
      clearColor: [0.015, 0.02, 0.035, 1.0],
      fogMode: 'exponential',
      fogDensity: 0.015,
      fogColor: [0.02, 0.03, 0.05, 1.0],
      exposure: 1.2,
      bloom: {
        enabled: bloomEnabled,
        threshold: 0.6,
        knee: 0.4,
        intensity: 1.2,
        scatter: 0.8
      }
    });
  };
  applyEnvironment();

  // 2. Geometries
  createPrimitiveGeometry(galfus, REALM_3D, GEOM_PLANE_ID, {
    primitive: 'plane',
    size: 24.0
  });
  createPrimitiveGeometry(galfus, REALM_3D, GEOM_PEDESTAL_ID, {
    primitive: 'cylinder',
    radius: 1.8,
    size: 0.6,
    subdivisions: 32
  });
  createPrimitiveGeometry(galfus, REALM_3D, GEOM_PILLAR_ID, {
    primitive: 'cylinder',
    radius: 0.35,
    size: 4.5,
    subdivisions: 24
  });
  createPrimitiveGeometry(galfus, REALM_3D, GEOM_TORUS_SPHERE_ID, {
    primitive: 'torus',
    radius: 0.85,
    subdivisions: 32
  });
  createPrimitiveGeometry(galfus, REALM_3D, GEOM_PYRAMID_ID, {
    primitive: 'pyramid',
    size: 1.6
  });
  createPrimitiveGeometry(galfus, REALM_3D, GEOM_CYLINDER_ID, {
    primitive: 'cylinder',
    radius: 0.7,
    size: 1.4,
    subdivisions: 32
  });

  // 3. Opaque Materials (Floor, Pedestal, Pillars)
  galfus.realm3dCreateMaterial(REALM_3D, MAT_FLOOR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.18, 0.22, 0.28, 1.0],
    roughness: 0.35,
    metallic: 0.1,
    reflectance: 0.4
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_PEDESTAL_ID, {
    surfaceType: 'opaque',
    baseColor: [0.25, 0.28, 0.35, 1.0],
    roughness: 0.25,
    metallic: 0.2,
    reflectance: 0.6
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_PILLAR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.45, 0.4, 0.35, 1.0],
    roughness: 0.6,
    metallic: 0.0,
    reflectance: 0.3
  });

  // 4. Refractive Materials (Crystal Sphere, Ruby Gem, Emerald Lens)
  let currentPaletteIdx = 0;
  let currentIor = 1.52; // Crown Glass
  let currentDistortion = 0.08;

  const updateSphereMaterial = () => {
    const pal = CRYSTAL_PALETTES[currentPaletteIdx]!;
    galfus.realm3dCreateMaterial(REALM_3D, MAT_GLASS_SPHERE_ID, {
      surfaceType: 'refractive',
      baseColor: pal.color,
      roughness: 0.04,
      metallic: 0.0,
      reflectance: 0.6,
      refractionIndex: currentIor,
      refractionDistortion: currentDistortion
    });
  };
  updateSphereMaterial();

  galfus.realm3dCreateMaterial(REALM_3D, MAT_RUBY_PYRAMID_ID, {
    surfaceType: 'refractive',
    baseColor: [0.95, 0.12, 0.22, 0.35],
    roughness: 0.08,
    metallic: 0.0,
    reflectance: 0.7,
    refractionIndex: 2.42,
    refractionDistortion: 0.12
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_EMERALD_LENS_ID, {
    surfaceType: 'refractive',
    baseColor: [0.12, 0.9, 0.4, 0.3],
    roughness: 0.06,
    metallic: 0.0,
    reflectance: 0.5,
    refractionIndex: 1.58,
    refractionDistortion: 0.07
  });

  // 5. Particle Material (Emissive Spark Particles)
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PARTICLE_ID, {
    surfaceType: 'additive',
    baseColor: [2.5, 1.8, 0.5, 1.0],
    roughness: 0.2,
    metallic: 0.0,
    reflectance: 0.5
  });

  // 6. Spawn Models
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FLOOR_ID,
    { geometryId: GEOM_PLANE_ID, materialId: MAT_FLOOR_ID, receiveShadow: true },
    { position: [0, 0, 0], scale: [1, 1, 1] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PEDESTAL_ID,
    {
      geometryId: GEOM_PEDESTAL_ID,
      materialId: MAT_PEDESTAL_ID,
      castShadow: true,
      receiveShadow: true
    },
    { position: [0, 0.3, 0], scale: [1, 1, 1] }
  );

  // Decorative stone pillars positioned around
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PILLAR_LEFT_ID,
    { geometryId: GEOM_PILLAR_ID, materialId: MAT_PILLAR_ID, castShadow: true },
    { position: [-3.5, 2.25, -2.0], scale: [1, 1, 1] }
  );
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PILLAR_RIGHT_ID,
    { geometryId: GEOM_PILLAR_ID, materialId: MAT_PILLAR_ID, castShadow: true },
    { position: [3.5, 2.25, -2.0], scale: [1, 1, 1] }
  );
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PILLAR_BACK_ID,
    { geometryId: GEOM_PILLAR_ID, materialId: MAT_PILLAR_ID, castShadow: true },
    { position: [0.0, 2.25, -4.2], scale: [1, 1, 1] }
  );

  // Refractive Glass Models positioned on the pedestal
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_GLASS_SPHERE_ID,
    { geometryId: GEOM_TORUS_SPHERE_ID, materialId: MAT_GLASS_SPHERE_ID },
    { position: [0, 1.8, 0], scale: [1.1, 1.1, 1.1] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_RUBY_PYRAMID_ID,
    { geometryId: GEOM_PYRAMID_ID, materialId: MAT_RUBY_PYRAMID_ID },
    { position: [-1.8, 1.2, 0.4], scale: [1, 1, 1] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_EMERALD_LENS_ID,
    { geometryId: GEOM_CYLINDER_ID, materialId: MAT_EMERALD_LENS_ID },
    { position: [1.8, 1.0, 0.4], scale: [1, 1, 1] }
  );

  // Setup Animation Transitions for Refractive Crystals via Transition API
  console.log('==> Configuring Animation Transitions for Refractive Crystals...');
  galfus.animationCreateTransition(
    1,
    { type: 'transform3D', value: [0, 1.72, 0, 0, 0, 0, 1, 1.1, 1.1, 1.1] },
    { duration: 2.8, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(1, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_GLASS_SPHERE_ID
  });
  galfus.animationTransitionTo(1, {
    type: 'transform3D',
    value: [0, 1.88, 0, 0, 0.707, 0, 0.707, 1.1, 1.1, 1.1]
  });

  galfus.animationCreateTransition(
    2,
    { type: 'transform3D', value: [-1.8, 1.14, 0.4, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 2.2, delay: 0.2, easing: 'easeInOutCubic', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(2, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_RUBY_PYRAMID_ID
  });
  galfus.animationTransitionTo(2, {
    type: 'transform3D',
    value: [-1.8, 1.26, 0.4, 0, 0.5, 0, 0.866, 1, 1, 1]
  });

  galfus.animationCreateTransition(
    3,
    { type: 'transform3D', value: [1.8, 0.94, 0.4, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 2.5, delay: 0.1, easing: 'easeInOutQuad', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(3, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_EMERALD_LENS_ID
  });
  galfus.animationTransitionTo(3, {
    type: 'transform3D',
    value: [1.8, 1.06, 0.4, 0, -0.6, 0, 0.8, 1, 1, 1]
  });

  // 7. Dynamic Lights
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_DIR_ID,
    {
      kind: 'directional',
      color: [0.95, 0.95, 1.0],
      intensity: 1.5,
      castShadow: true
    },
    {
      position: [5, 12, 6],
      rotation: quatFromLookAt([5, 12, 6], [0, 0, 0])
    }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_POINT_CENTER_ID,
    {
      kind: 'point',
      color: [0.2, 0.7, 1.0],
      intensity: 3.5
    },
    {
      position: [0, 2.5, 0]
    }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_POINT_BACK_ID,
    {
      kind: 'point',
      color: [1.0, 0.5, 0.1],
      intensity: 2.5
    },
    {
      position: [0, 1.5, -2.5]
    }
  );

  // 8. Particle Emitter behind the glass objects
  galfus.realm3dCreateParticleEmitter(
    REALM_3D,
    EMITTER_FOUNTAIN_ID,
    {
      label: 'Back Sparks',
      materialId: MAT_PARTICLE_ID,
      maxParticles: 400,
      spawnRate: 60,
      lifetimeRange: [1.2, 2.2],
      speedRange: [1.5, 3.2],
      startSizeRange: [0.08, 0.12],
      endSizeRange: [0.01, 0.03],
      startColor: [2.5, 1.6, 0.4, 1.0],
      endColor: [1.0, 0.2, 0.05, 0.0],
      gravity: [0, -1.8, 0],
      spreadAngleRad: 0.45,
      direction: [0, 1, 0],
      emissionShape: { type: 'cone', radius: 0.3, angleRad: 0.45, height: 0.4 },
      active: true
    },
    {
      position: [0, 0.7, -1.5]
    }
  );

  // Camera settings
  let camDistance = 7.5;
  let camAngle = 0.4;
  let camHeight = 2.8;
  let autoOrbit = true;

  const updateCamera = () => {
    const camX = Math.sin(camAngle) * camDistance;
    const camZ = Math.cos(camAngle) * camDistance;
    const camPos: [number, number, number] = [camX, camHeight, camZ];
    const lookTarget: [number, number, number] = [0, 1.6, 0];

    galfus.realm3dCreateCamera(
      REALM_3D,
      CAMERA_ID,
      {
        kind: 'perspective',
        fovY: 45.0,
        near: 0.1,
        far: 100.0,
        cameraSlot: 1
      },
      {
        position: camPos,
        rotation: quatFromLookAt(camPos, lookTarget)
      }
    );
  };
  updateCamera();

  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    targetId: TARGET_WINDOW,
    realmId: REALM_3D,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    enabled: true
  });

  console.log('✔ Scene setup complete! Controls:');
  console.log(
    '  [1] / [2]     - Decrease / Increase Central Crystal IOR (Current: ' +
      currentIor.toFixed(2) +
      ')'
  );
  console.log(
    '  [3] / [4]     - Decrease / Increase Distortion Strength (Current: ' +
      currentDistortion.toFixed(2) +
      ')'
  );
  console.log('  [C]           - Cycle Crystal Color Palette');
  console.log('  [B]           - Toggle Bloom / HDR Glow');
  console.log('  [P] / [Space] - Burst particles behind the crystal');
  console.log('  [O]           - Toggle automatic camera orbit');
  console.log('  [Left/Right]  - Rotate camera angle');
  console.log('  [Up/Down]     - Adjust camera height');
  console.log('  [W / S]       - Zoom in / out');
  console.log('  [Esc] or [Q]  - Exit demo\n');

  let running = true;
  let frameCount = 0;
  let totalTime = 0;
  let lastTime = performance.now();

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;
    totalTime += dt;
    frameCount++;

    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          running = false;
          break;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        if (ev.state === 'pressed') {
          const key = extractKey(ev);
          if (key === 'escape' || key === 'q') {
            running = false;
          } else if (key === 'o') {
            autoOrbit = !autoOrbit;
            console.log(`Auto orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
          } else if (key === '1') {
            currentIor = Math.max(1.0, currentIor - 0.05);
            updateSphereMaterial();
            console.log(`Refraction Index (IOR): ${currentIor.toFixed(2)}`);
          } else if (key === '2') {
            currentIor = Math.min(3.0, currentIor + 0.05);
            updateSphereMaterial();
            console.log(`Refraction Index (IOR): ${currentIor.toFixed(2)}`);
          } else if (key === '3') {
            currentDistortion = Math.max(0.01, currentDistortion - 0.01);
            updateSphereMaterial();
            console.log(`Distortion Strength: ${currentDistortion.toFixed(2)}`);
          } else if (key === '4') {
            currentDistortion = Math.min(0.3, currentDistortion + 0.01);
            updateSphereMaterial();
            console.log(`Distortion Strength: ${currentDistortion.toFixed(2)}`);
          } else if (key === 'c') {
            currentPaletteIdx = (currentPaletteIdx + 1) % CRYSTAL_PALETTES.length;
            updateSphereMaterial();
            console.log(
              `[Crystal Palette] Switched to ${CRYSTAL_PALETTES[currentPaletteIdx]!.name}`
            );
          } else if (key === 'b') {
            bloomEnabled = !bloomEnabled;
            applyEnvironment();
            console.log(`Bloom / HDR Glow: ${bloomEnabled ? 'ON' : 'OFF'}`);
          } else if (key === 'p' || key === ' ') {
            galfus.realm3dParticleEmitterBurst(REALM_3D, EMITTER_FOUNTAIN_ID, 120);
            console.log('>> Particle burst triggered behind the glass!');
          } else if (key === 'arrowleft') {
            camAngle -= 0.08;
            updateCamera();
          } else if (key === 'arrowright') {
            camAngle += 0.08;
            updateCamera();
          } else if (key === 'arrowup') {
            camHeight = Math.min(7.0, camHeight + 0.2);
            updateCamera();
          } else if (key === 'arrowdown') {
            camHeight = Math.max(0.5, camHeight - 0.2);
            updateCamera();
          } else if (key === 'w') {
            camDistance = Math.max(2.5, camDistance - 0.4);
            updateCamera();
          } else if (key === 's') {
            camDistance = Math.min(16.0, camDistance + 0.4);
            updateCamera();
          }
        }
      }
    }

    if (autoOrbit) {
      camAngle += dt * 0.4;
      updateCamera();
    }

    // Gently rotate the crystal objects via Transition API
    galfus.animationStep(dt);

    // Move back point light in a circle
    galfus.realm3dSetLightTransform(REALM_3D, LIGHT_POINT_BACK_ID, {
      position: [Math.sin(totalTime * 2.0) * 2.0, 2.0, -2.5 + Math.cos(totalTime * 1.5) * 0.5]
    });

    galfus.multiverseDispatch(frameCount, dt);
    await Bun.sleep(1);
  }

  console.log('\nExiting demo 3D-6...');
  galfus.platformShutdown();
  process.exit(0);
}
