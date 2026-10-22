import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { extractKey, quatFromLookAt } from './utils.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const INVOCATION_MAIN = 100;

const CAMERA_ID = 1;

// Geometries
const GEOM_PLANE_ID = 1;
const GEOM_PEDESTAL_ID = 2;
const GEOM_PILLAR_ID = 3;
const GEOM_MIRROR_QUAD_ID = 4;
const GEOM_GEM_ID = 5;
const GEOM_FRAME_H_ID = 6;
const GEOM_FRAME_V_ID = 7;
const GEOM_SECRET_OBELISK_ID = 8;

// Materials
const MAT_FLOOR_ID = 1;
const MAT_PEDESTAL_ID = 2;
const MAT_PILLAR_ID = 3;
const MAT_MIRROR_PORTAL_ID = 4;
const MAT_GEM_ID = 5;
const MAT_FRAME_ID = 6;
const MAT_SECRET_CHAMBER_ID = 7;
const MAT_PARTICLE_ID = 8;
const MAT_SECRET_PARTICLE_ID = 9;

// Models
const MODEL_FLOOR_ID = 1;
const MODEL_PEDESTAL_ID = 2;
const MODEL_PILLAR_FL_ID = 3;
const MODEL_PILLAR_FR_ID = 4;
const MODEL_PILLAR_BL_ID = 5;
const MODEL_PILLAR_BR_ID = 6;
const MODEL_GEM_ID = 7;
const MODEL_MIRROR_PORTAL_ID = 8;
const MODEL_FRAME_TOP_ID = 9;
const MODEL_FRAME_BOTTOM_ID = 10;
const MODEL_FRAME_LEFT_ID = 11;
const MODEL_FRAME_RIGHT_ID = 12;
const MODEL_SECRET_OBELISK_ID = 13;
const MODEL_SECRET_FLOOR_ID = 14;

// Lights
const LIGHT_DIR_ID = 1;
const LIGHT_POINT_CENTER_ID = 2;
const LIGHT_POINT_SECRET_ID = 3;

// Emitters & Portal
const EMITTER_FOUNTAIN_ID = 1;
const EMITTER_SECRET_OBELISK_ID = 2;
const PORTAL_GATEWAY_ID = 1;

interface MirrorTint {
  name: string;
  color: [number, number, number, number];
}

const MIRROR_TINTS: MirrorTint[] = [
  { name: 'Pure Silver', color: [0.96, 0.98, 1.0, 1.0] },
  { name: 'Warm Gold', color: [1.0, 0.88, 0.65, 1.0] },
  { name: 'Obsidian Dark', color: [0.45, 0.48, 0.55, 1.0] },
  { name: 'Mystic Cyan', color: [0.65, 0.95, 1.0, 1.0] }
];

export async function runDemo3d7(): Promise<void> {
  console.log(
    '=== Galfus Engine - Demo 3D-7 (TypeScript / Bun): Planar Mirror & Optical Portal ===\n'
  );

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
    title: 'Galfus Engine - Demo 3D-7: Planar Reflection Mirror & Optical Portal',
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

  // 1. Atmospheric Environment with HDR Bloom
  let bloomEnabled = true;
  const applyEnvironment = () => {
    galfus.realm3dSetEnvironment(REALM_3D, {
      ambientColor: [0.06, 0.07, 0.1, 1.0],
      clearColor: [0.02, 0.025, 0.04, 1.0],
      fogMode: 'exponential',
      fogDensity: 0.012,
      fogColor: [0.03, 0.035, 0.055, 1.0],
      exposure: 1.15,
      bloom: {
        enabled: bloomEnabled,
        threshold: 0.65,
        knee: 0.35,
        intensity: 1.1,
        scatter: 0.75
      }
    });
  };
  applyEnvironment();

  // 2. Geometries
  galfus.realm3dCreatePlane(REALM_3D, GEOM_PLANE_ID, 26.0, 26.0);
  galfus.realm3dCreateCylinder(REALM_3D, GEOM_PEDESTAL_ID, 1.6, 0.7, 32);
  galfus.realm3dCreateCylinder(REALM_3D, GEOM_PILLAR_ID, 0.38, 5.0, 24);
  galfus.realm3dCreateQuad(REALM_3D, GEOM_MIRROR_QUAD_ID, 5.6, 5.6);
  galfus.realm3dCreatePyramid(REALM_3D, GEOM_GEM_ID, 1.4, 1.4, 1.4);
  galfus.realm3dCreateCube(REALM_3D, GEOM_FRAME_H_ID, 1.0);
  galfus.realm3dCreateCube(REALM_3D, GEOM_FRAME_V_ID, 1.0);
  galfus.realm3dCreateCylinder(REALM_3D, GEOM_SECRET_OBELISK_ID, 0.8, 4.2, 16);

  // 3. Materials
  let currentReflectance = 0.95;
  let currentTintIdx = 0;
  let isPortalMode = false;

  const updateMirrorMaterial = () => {
    galfus.realm3dCreateMaterial(REALM_3D, MAT_MIRROR_PORTAL_ID, {
      surfaceType: isPortalMode ? 'portal' : 'mirror',
      baseColor: MIRROR_TINTS[currentTintIdx]!.color,
      roughness: 0.04,
      metallic: 0.95,
      reflectance: currentReflectance,
      emissiveColor: isPortalMode ? [0.15, 0.45, 0.95, 1.0] : [0, 0, 0, 0]
    });
  };

  galfus.realm3dCreateMaterial(REALM_3D, MAT_FLOOR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.18, 0.2, 0.24, 1.0],
    roughness: 0.65,
    metallic: 0.1
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PEDESTAL_ID, {
    surfaceType: 'opaque',
    baseColor: [0.28, 0.26, 0.3, 1.0],
    roughness: 0.4,
    metallic: 0.2
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PILLAR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.82, 0.8, 0.85, 1.0],
    roughness: 0.35,
    metallic: 0.15
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_GEM_ID, {
    surfaceType: 'opaque',
    baseColor: [0.95, 0.15, 0.3, 1.0],
    emissiveColor: [0.8, 0.1, 0.25, 1.0],
    roughness: 0.1,
    metallic: 0.3
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_FRAME_ID, {
    surfaceType: 'opaque',
    baseColor: [0.72, 0.58, 0.25, 1.0], // Golden border
    roughness: 0.3,
    metallic: 0.85
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_SECRET_CHAMBER_ID, {
    surfaceType: 'opaque',
    baseColor: [0.1, 0.85, 0.4, 1.0],
    emissiveColor: [0.2, 0.9, 0.45, 1.0],
    roughness: 0.2,
    metallic: 0.5
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PARTICLE_ID, {
    surfaceType: 'additive',
    baseColor: [1.0, 0.8, 0.3, 1.0]
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_SECRET_PARTICLE_ID, {
    surfaceType: 'additive',
    baseColor: [0.25, 1.0, 0.6, 1.0]
  });

  updateMirrorMaterial();

  // 4. Models
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FLOOR_ID,
    {
      geometryId: GEOM_PLANE_ID,
      materialId: MAT_FLOOR_ID
    },
    { position: [0, 0, 0] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PEDESTAL_ID,
    {
      geometryId: GEOM_PEDESTAL_ID,
      materialId: MAT_PEDESTAL_ID
    },
    { position: [0, 0.35, 0] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_GEM_ID,
    {
      geometryId: GEOM_GEM_ID,
      materialId: MAT_GEM_ID
    },
    { position: [0, 1.7, 0] }
  );

  // 4 Pillars around center
  const pillarPos: [number, number, number][] = [
    [-3.2, 2.5, -2.5],
    [3.2, 2.5, -2.5],
    [-3.2, 2.5, 3.2],
    [3.2, 2.5, 3.2]
  ];
  const pillarIds = [
    MODEL_PILLAR_FL_ID,
    MODEL_PILLAR_FR_ID,
    MODEL_PILLAR_BL_ID,
    MODEL_PILLAR_BR_ID
  ];
  for (let i = 0; i < 4; i++) {
    galfus.realm3dCreateModel(
      REALM_3D,
      pillarIds[i]!,
      {
        geometryId: GEOM_PILLAR_ID,
        materialId: MAT_PILLAR_ID
      },
      { position: pillarPos[i]! }
    );
  }

  // The Mirror / Portal Surface (facing +Z, placed on wall at Z = -4.8)
  const mirrorPosition: [number, number, number] = [0, 2.8, -4.8];
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_MIRROR_PORTAL_ID,
    {
      geometryId: GEOM_MIRROR_QUAD_ID,
      materialId: MAT_MIRROR_PORTAL_ID
    },
    {
      position: mirrorPosition,
      scale: [1.0, 0.72, 1.0]
    }
  );

  // Ornate Golden Frame
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FRAME_TOP_ID,
    {
      geometryId: GEOM_FRAME_H_ID,
      materialId: MAT_FRAME_ID
    },
    { position: [0, 4.9, -4.75], scale: [6.0, 0.25, 0.2] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FRAME_BOTTOM_ID,
    {
      geometryId: GEOM_FRAME_H_ID,
      materialId: MAT_FRAME_ID
    },
    { position: [0, 0.7, -4.75], scale: [6.0, 0.25, 0.2] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FRAME_LEFT_ID,
    {
      geometryId: GEOM_FRAME_V_ID,
      materialId: MAT_FRAME_ID
    },
    { position: [-2.9, 2.8, -4.75], scale: [0.25, 4.3, 0.2] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FRAME_RIGHT_ID,
    {
      geometryId: GEOM_FRAME_V_ID,
      materialId: MAT_FRAME_ID
    },
    { position: [2.9, 2.8, -4.75], scale: [0.25, 4.3, 0.2] }
  );

  // Secret Chamber Objects (Far off at X=25, Z=-25)
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_SECRET_FLOOR_ID,
    {
      geometryId: GEOM_PEDESTAL_ID,
      materialId: MAT_PEDESTAL_ID
    },
    { position: [25.0, 0.2, -25.0], scale: [8.0, 0.4, 8.0] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_SECRET_OBELISK_ID,
    {
      geometryId: GEOM_SECRET_OBELISK_ID,
      materialId: MAT_SECRET_CHAMBER_ID
    },
    { position: [25.0, 2.6, -25.0] }
  );

  // Setup Animation Transitions for Gem and Secret Obelisk via Transition API
  console.log('==> Configuring Animation Transitions for Gem & Portal Obelisk...');
  galfus.animationCreateTransition(
    1,
    { type: 'transform3D', value: [0, 1.62, 0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 2.5, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(1, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_GEM_ID
  });
  galfus.animationTransitionTo(1, {
    type: 'transform3D',
    value: [0, 1.78, 0, 0, 0.707, 0, 0.707, 1, 1, 1]
  });

  galfus.animationCreateTransition(
    2,
    { type: 'transform3D', value: [25.0, 2.7, -25.0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 3.0, delay: 0.1, easing: 'easeInOutCubic', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(2, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_SECRET_OBELISK_ID
  });
  galfus.animationTransitionTo(2, {
    type: 'transform3D',
    value: [25.0, 2.9, -25.0, 0, -0.6, 0, 0.8, 1, 1, 1]
  });

  // 5. Lights
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_DIR_ID,
    {
      kind: 'directional',
      color: [1.0, 0.95, 0.9],
      intensity: 1.6,
      castShadow: true
    },
    {
      position: [6.0, 10.0, 6.0],
      rotation: quatFromLookAt([6.0, 10.0, 6.0], [0, 0, 0])
    }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_POINT_CENTER_ID,
    {
      kind: 'point',
      color: [1.0, 0.3, 0.4],
      intensity: 4.5,
      range: 12.0
    },
    { position: [0, 2.2, 0] }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_POINT_SECRET_ID,
    {
      kind: 'point',
      color: [0.2, 1.0, 0.5],
      intensity: 6.0,
      range: 16.0
    },
    { position: [25.0, 3.5, -24.0] }
  );

  // 6. Particle Emitter above the central pedestal
  galfus.realm3dCreateParticleEmitter(
    REALM_3D,
    EMITTER_FOUNTAIN_ID,
    {
      label: 'Pedestal Sparkles',
      materialId: MAT_PARTICLE_ID,
      maxParticles: 400,
      spawnRate: 45.0,
      lifetimeRange: [1.5, 2.8],
      speedRange: [1.2, 2.6],
      startColor: [1.0, 0.85, 0.4, 0.9],
      endColor: [0.95, 0.2, 0.1, 0.0],
      startSizeRange: [0.22, 0.3],
      endSizeRange: [0.04, 0.08],
      gravity: [0.0, -0.6, 0.0],
      drag: 0.15,
      emissionShape: {
        type: 'cone',
        radius: 0.4,
        height: 1.2,
        angleRad: 0.4
      },
      active: true
    },
    {
      position: [0, 1.9, 0],
      rotation: [0, 0, 0, 1]
    }
  );

  // 6b. Particle Emitter surrounding the Secret Obelisk
  galfus.realm3dCreateParticleEmitter(
    REALM_3D,
    EMITTER_SECRET_OBELISK_ID,
    {
      label: 'Secret Obelisk Aura',
      materialId: MAT_SECRET_PARTICLE_ID,
      maxParticles: 350,
      spawnRate: 40.0,
      lifetimeRange: [1.2, 2.5],
      speedRange: [0.8, 1.8],
      direction: [0.0, 1.0, 0.0],
      spreadAngleRad: 0.35,
      startColor: [0.2, 1.8, 0.7, 1.0],
      endColor: [0.05, 0.7, 0.25, 0.0],
      startSizeRange: [0.25, 0.35],
      endSizeRange: [0.05, 0.1],
      gravity: [0.0, 0.3, 0.0],
      drag: 0.08,
      emissionShape: {
        type: 'cylinder',
        radius: 0.9,
        height: 3.5
      },
      active: true
    },
    {
      position: [25.0, 1.0, -25.0],
      rotation: [0, 0, 0, 1]
    }
  );

  // 7. Portal Registration
  const syncPortal = () => {
    if (isPortalMode) {
      galfus.realm3dCreatePortal(REALM_3D, PORTAL_GATEWAY_ID, {
        modelId: MODEL_MIRROR_PORTAL_ID,
        exitTransform: {
          position: [25.0, 2.8, -18.0],
          rotation: [0, 1, 0, 0] // Look towards the green obelisk
        },
        active: true
      });
      console.log('>> [Mode] OPTICAL PORTAL: Connected to Secret Chamber at [25, 2.8, -25]');
    } else {
      galfus.realm3dCreatePortal(REALM_3D, PORTAL_GATEWAY_ID, {
        modelId: MODEL_MIRROR_PORTAL_ID,
        active: true
      });
      console.log('>> [Mode] PLANAR MIRROR: Real-time reflection of the chamber and particles');
    }
  };
  syncPortal();

  // 8. Camera and Invocation
  let camDistance = 8.0;
  let camAngle = 0.2;
  let camHeight = 3.2;
  let autoOrbit = true;

  const updateCamera = () => {
    const camX = Math.sin(camAngle) * camDistance;
    const camZ = Math.cos(camAngle) * camDistance;
    const camPos: [number, number, number] = [camX, camHeight, camZ];
    const lookTarget: [number, number, number] = [0, 2.2, -1.0];

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
  console.log('  [M]           - Toggle Planar Mirror / Optical Portal');
  console.log(
    '  [1] / [2]     - Decrease / Increase Mirror Reflectance (Current: ' +
      currentReflectance.toFixed(2) +
      ')'
  );
  console.log(
    '  [C]           - Cycle Mirror Tint Palette (' + MIRROR_TINTS[currentTintIdx]!.name + ')'
  );
  console.log('  [B]           - Toggle Bloom / HDR Glow');
  console.log('  [P] / [Space] - Burst particles in front of the mirror');
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
          } else if (key === 'm') {
            isPortalMode = !isPortalMode;
            updateMirrorMaterial();
            syncPortal();
          } else if (key === '1') {
            currentReflectance = Math.max(0.1, currentReflectance - 0.05);
            updateMirrorMaterial();
            console.log(`Reflectance: ${currentReflectance.toFixed(2)}`);
          } else if (key === '2') {
            currentReflectance = Math.min(1.0, currentReflectance + 0.05);
            updateMirrorMaterial();
            console.log(`Reflectance: ${currentReflectance.toFixed(2)}`);
          } else if (key === 'c') {
            currentTintIdx = (currentTintIdx + 1) % MIRROR_TINTS.length;
            updateMirrorMaterial();
            console.log(`[Mirror Tint] Switched to ${MIRROR_TINTS[currentTintIdx]!.name}`);
          } else if (key === 'b') {
            bloomEnabled = !bloomEnabled;
            applyEnvironment();
            console.log(`Bloom / HDR Glow: ${bloomEnabled ? 'ON' : 'OFF'}`);
          } else if (key === 'o') {
            autoOrbit = !autoOrbit;
            console.log(`Auto orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
          } else if (key === 'p' || key === ' ') {
            galfus.realm3dParticleEmitterBurst(REALM_3D, EMITTER_FOUNTAIN_ID, 120);
            galfus.realm3dParticleEmitterBurst(REALM_3D, EMITTER_SECRET_OBELISK_ID, 80);
            console.log('>> Particle burst triggered (Pedestal & Portal Chamber)!');
          } else if (key === 'arrowleft') {
            camAngle -= 0.08;
            updateCamera();
          } else if (key === 'arrowright') {
            camAngle += 0.08;
            updateCamera();
          } else if (key === 'arrowup') {
            camHeight = Math.min(8.0, camHeight + 0.2);
            updateCamera();
          } else if (key === 'arrowdown') {
            camHeight = Math.max(0.8, camHeight - 0.2);
            updateCamera();
          } else if (key === 'w') {
            camDistance = Math.max(3.0, camDistance - 0.4);
            updateCamera();
          } else if (key === 's') {
            camDistance = Math.min(18.0, camDistance + 0.4);
            updateCamera();
          }
        }
      }
    }

    if (autoOrbit) {
      camAngle += dt * 0.35;
      updateCamera();
    }

    // Advance Animations via Transition API
    galfus.animationStep(dt);

    galfus.multiverseDispatch(frameCount, dt);
    await Bun.sleep(1);
  }

  console.log('\nExiting demo 3D-7...');
  galfus.platformShutdown();
  process.exit(0);
}
