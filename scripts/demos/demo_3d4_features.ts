/**
 * Demo 3D-4 - 3D Realm Advanced Features Showcase
 *
 * Demonstrates:
 * 1. New 3D Geometry Primitives: Torus, Capsule, Cylinder, and Pyramid.
 * 2. Multi-Scale Bloom HDR Glow post-processing on emissive materials.
 * 3. 3D Debug Gizmo System: Reverse-Z depth-tested wireframe AABBs, lines, and ground grid.
 * 4. Parallel Compute Light Culling: Real-time GPU compute shader culling 8 dynamic lights against frustum.
 */

import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { createDemo3d4Environment } from './demo_3d4_environment.ts';
import { extractKey, quatFromEuler, quatFromLookAt } from './utils.ts';

import {
  TARGET_WINDOW,
  REALM_3D,
  INVOCATION_MAIN,
  CAMERA_ID,
  MODEL_GROUND,
  MODEL_TORUS,
  MODEL_CAPSULE,
  MODEL_CYLINDER,
  MODEL_PYRAMID,
  MODEL_GLOW_CORE,
  GEOM_GROUND,
  GEOM_TORUS,
  GEOM_CAPSULE,
  GEOM_CYLINDER,
  GEOM_PYRAMID,
  GEOM_SPHERE,
  MAT_GROUND,
  MAT_TORUS,
  MAT_CAPSULE,
  MAT_CYLINDER,
  MAT_PYRAMID,
  MAT_GLOW_CORE,
  LIGHT_SUN,
  LIGHT_ORBIT_START,
  NUM_ORBIT_LIGHTS,
  LIGHT_PALETTE,
  POS_TORUS,
  POS_CAPSULE,
  POS_CYLINDER,
  POS_PYRAMID,
  POS_CORE
} from './demo_3d4_scene.ts';

export async function runDemo3d4(): Promise<void> {
  console.log(`================================================================
   GALFUS ENGINE - DEMO 3D-4: 3D ADVANCED REALM FEATURES
================================================================
Showcasing:
  1. New 3D Geometry Primitives: Torus, Capsule, Cylinder, Pyramid
  2. Multi-Scale Bloom HDR Glow (Pre-filter, Downsample Blur & Upsample)
  3. Reverse-Z 3D Debug Gizmos (AABBs, Lines, Ground Grid)
  4. Parallel Compute Light Culling (Frustum Planes vs 8 Point Lights)
================================================================`);

  const galfus = new GalfusBun();
  galfus.platformInit();

  const windowId = 1;
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 3D-4: 3D Advanced Features (Bloom, Gizmos & Light Culling)',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created (Logical ID: ${windowId})`);

  galfus.multiverseAttachWindow(windowId);
  galfus.multiverseCreateTarget(TARGET_WINDOW, { kind: { type: 'window', windowId } });

  console.log(`==> Creating Realm3D (#${REALM_3D})...`);
  galfus.realm3dCreate(REALM_3D);

  let bloomEnabled = true;
  let bloomIntensity = 1.6;
  let bloomThreshold = 0.75;
  let gizmosEnabled = true;
  let autoOrbit = true;
  let isPaused = false;

  const updateEnvironment = () => {
    galfus.realm3dSetEnvironment(
      REALM_3D,
      createDemo3d4Environment({
        bloomEnabled,
        bloomIntensity,
        bloomThreshold
      })
    );
  };
  updateEnvironment();

  let camDistance = 15.0;
  let camAngle = 0.5;
  let camHeight = 6.5;

  const applyCamera = () => {
    const eye: [number, number, number] = [
      Math.sin(camAngle) * camDistance,
      camHeight,
      Math.cos(camAngle) * camDistance
    ];
    galfus.realm3dCreateCamera(
      REALM_3D,
      CAMERA_ID,
      { kind: 'perspective', fovY: 52.0, near: 0.1, far: 500.0, cameraSlot: 1 },
      { position: eye, rotation: quatFromLookAt(eye, [0.0, 1.2, 0.0]), scale: [1, 1, 1] }
    );
  };
  applyCamera();

  console.log('==> Creating New 3D Geometry Primitives...');
  galfus.realm3dCreatePlane(REALM_3D, GEOM_GROUND, 36.0, 36.0);
  galfus.realm3dCreateTorus(REALM_3D, GEOM_TORUS, 1.2, 0.36, 36, 18);
  galfus.realm3dCreateCapsule(REALM_3D, GEOM_CAPSULE, 0.65, 0.3, 6, 12);
  galfus.realm3dCreateCylinder(REALM_3D, GEOM_CYLINDER, 0.75, 2.2, 32);
  galfus.realm3dCreatePyramid(REALM_3D, GEOM_PYRAMID, 1.8, 1.8, 1.8);
  galfus.realm3dCreateSphere(REALM_3D, GEOM_SPHERE, 0.85, 16, 32);

  console.log('==> Creating PBR Materials & High-Intensity HDR Emissives...');
  galfus.realm3dCreateMaterial(REALM_3D, MAT_GROUND, {
    baseColor: [0.15, 0.17, 0.22, 1.0],
    metallic: 0.15,
    roughness: 0.65
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_TORUS, {
    baseColor: [1.0, 0.82, 0.3, 1.0],
    metallic: 0.95,
    roughness: 0.18
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CAPSULE, {
    surfaceType: 'transparent',
    side: 'double',
    baseColor: [0.15, 0.75, 0.95, 0.58],
    metallic: 0.6,
    roughness: 0.25
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CYLINDER, {
    baseColor: [0.82, 0.85, 0.9, 1.0],
    metallic: 0.88,
    roughness: 0.22
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PYRAMID, {
    surfaceType: 'masked',
    alphaCutoff: 0.75,
    baseColor: [0.95, 0.18, 0.28, 0.9],
    metallic: 0.3,
    roughness: 0.3
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_GLOW_CORE, {
    surfaceType: 'additive',
    baseColor: [1.0, 1.0, 1.0, 0.45],
    emissiveColor: [4.0, 2.2, 8.5, 1.0]
  });

  console.log('==> Instantiating Models in Cardinal Positions...');
  const models = [
    {
      id: MODEL_GROUND,
      geom: GEOM_GROUND,
      mat: MAT_GROUND,
      pos: [0, 0, 0] as [number, number, number],
      cast: false
    },
    { id: MODEL_TORUS, geom: GEOM_TORUS, mat: MAT_TORUS, pos: POS_TORUS, cast: true },
    { id: MODEL_CAPSULE, geom: GEOM_CAPSULE, mat: MAT_CAPSULE, pos: POS_CAPSULE, cast: true },
    { id: MODEL_CYLINDER, geom: GEOM_CYLINDER, mat: MAT_CYLINDER, pos: POS_CYLINDER, cast: true },
    { id: MODEL_PYRAMID, geom: GEOM_PYRAMID, mat: MAT_PYRAMID, pos: POS_PYRAMID, cast: true },
    { id: MODEL_GLOW_CORE, geom: GEOM_SPHERE, mat: MAT_GLOW_CORE, pos: POS_CORE, cast: false }
  ];
  for (const m of models) {
    galfus.realm3dCreateModel(
      REALM_3D,
      m.id,
      {
        geometryId: m.geom,
        materialId: m.mat,
        castShadow: m.cast,
        receiveShadow: true,
        active: true
      },
      { position: m.pos, rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
    );
  }

  // Setup Animation Transitions for 3D Feature Models via Transition API
  console.log('==> Configuring Animation Transitions for 3D Feature Models...');
  const qTorusRot = quatFromEuler(1.5, 3.14, 0.0);
  galfus.animationCreateTransition(
    1,
    { type: 'transform3D', value: [POS_TORUS[0], POS_TORUS[1], POS_TORUS[2], 0, 0, 0, 1, 1, 1, 1] },
    { duration: 3.5, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(1, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_TORUS
  });
  galfus.animationTransitionTo(1, {
    type: 'transform3D',
    value: [
      POS_TORUS[0],
      POS_TORUS[1],
      POS_TORUS[2],
      qTorusRot[0],
      qTorusRot[1],
      qTorusRot[2],
      qTorusRot[3],
      1,
      1,
      1
    ]
  });

  galfus.animationCreateTransition(
    2,
    {
      type: 'transform3D',
      value: [POS_CAPSULE[0], POS_CAPSULE[1] - 0.25, POS_CAPSULE[2], 0, 0, 0, 1, 1, 1, 1]
    },
    { duration: 2.2, delay: 0.1, easing: 'easeInOutCubic', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(2, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_CAPSULE
  });
  galfus.animationTransitionTo(2, {
    type: 'transform3D',
    value: [POS_CAPSULE[0], POS_CAPSULE[1] + 0.35, POS_CAPSULE[2], 0, 0, 0.35, 0.936, 1, 1, 1]
  });

  const qCylRot = quatFromEuler(3.14, 0.0, 0.0);
  galfus.animationCreateTransition(
    3,
    {
      type: 'transform3D',
      value: [POS_CYLINDER[0], POS_CYLINDER[1], POS_CYLINDER[2], 0, 0, 0, 1, 1, 1, 1]
    },
    { duration: 2.8, delay: 0.2, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(3, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_CYLINDER
  });
  galfus.animationTransitionTo(3, {
    type: 'transform3D',
    value: [
      POS_CYLINDER[0],
      POS_CYLINDER[1],
      POS_CYLINDER[2],
      qCylRot[0],
      qCylRot[1],
      qCylRot[2],
      qCylRot[3],
      1,
      1,
      1
    ]
  });

  const qPyrRot = quatFromEuler(3.14, 0.0, 0.0);
  galfus.animationCreateTransition(
    4,
    {
      type: 'transform3D',
      value: [POS_PYRAMID[0], POS_PYRAMID[1], POS_PYRAMID[2], 0, 0, 0, 1, 1, 1, 1]
    },
    { duration: 3.2, delay: 0.3, easing: 'easeInOutQuad', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(4, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_PYRAMID
  });
  galfus.animationTransitionTo(4, {
    type: 'transform3D',
    value: [
      POS_PYRAMID[0],
      POS_PYRAMID[1],
      POS_PYRAMID[2],
      qPyrRot[0],
      qPyrRot[1],
      qPyrRot[2],
      qPyrRot[3],
      1,
      1,
      1
    ]
  });

  galfus.animationCreateTransition(
    5,
    {
      type: 'transform3D',
      value: [POS_CORE[0], POS_CORE[1] - 0.25, POS_CORE[2], 0, 0, 0, 1, 1, 1, 1]
    },
    { duration: 1.8, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(5, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_GLOW_CORE
  });
  galfus.animationTransitionTo(5, {
    type: 'transform3D',
    value: [POS_CORE[0], POS_CORE[1] + 0.35, POS_CORE[2], 0, 0, 0, 1, 1, 1, 1]
  });

  console.log('==> Creating Directional Sun & 8 Orbiting Point Lights (GPU Compute Culling)...');
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_SUN,
    { kind: 'directional', color: [1.0, 0.95, 0.88], intensity: 1.2, castShadow: true },
    {
      position: [0.0, 10.0, 0.0],
      rotation: quatFromLookAt([10, 15, 10], [0, 0, 0]),
      scale: [1, 1, 1]
    }
  );

  for (let i = 0; i < NUM_ORBIT_LIGHTS; i++) {
    const lightId = LIGHT_ORBIT_START + i;
    const color = LIGHT_PALETTE[i % LIGHT_PALETTE.length]!;
    galfus.realm3dCreateLight(
      REALM_3D,
      lightId,
      { kind: 'point', color, intensity: 4.5, range: 6.5, castShadow: false },
      { position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
    );
  }

  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    clearColor: [0.015, 0.015, 0.025, 1.0]
  });

  console.log(`================================================================
CONTROLS:
  [B]        : Toggle Multi-Scale Bloom HDR (Currently: ON)
  [G]        : Toggle 3D Debug Gizmos (AABBs, Lines, Grid) (Currently: ON)
  [O]        : Toggle Camera Auto-Orbit (Currently: ON)
  [1] / [2]  : Decrease / Increase Bloom Intensity
  [3] / [4]  : Decrease / Increase Bloom Threshold
  [W/A/S/D]  : Manual Camera Orbit
  [Space]    : Pause / Resume Animation
  [Escape]   : Exit Demo
================================================================`);

  let frameCount = 0;
  let animTime = 0.0;
  const dt = 1.0 / 60.0;
  let isRunning = true;

  while (isRunning) {
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          isRunning = false;
          break;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        if (ev.state === 'pressed') {
          const k = extractKey(ev);
          if (k === 'escape') {
            isRunning = false;
            break;
          }
          if (k === 'b') {
            bloomEnabled = !bloomEnabled;
            console.log(`Bloom HDR: ${bloomEnabled ? 'ENABLED' : 'DISABLED'}`);
            updateEnvironment();
          } else if (k === 'g') {
            gizmosEnabled = !gizmosEnabled;
            if (!gizmosEnabled) galfus.realm3dClearGizmos(REALM_3D);
            console.log(`Debug Gizmos: ${gizmosEnabled ? 'ENABLED' : 'DISABLED'}`);
          } else if (k === 'o') {
            autoOrbit = !autoOrbit;
            console.log(`Auto-Orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
          } else if (k === 'space') {
            isPaused = !isPaused;
          } else if (k === '1') {
            bloomIntensity = Math.max(0.2, bloomIntensity - 0.2);
            updateEnvironment();
          } else if (k === '2') {
            bloomIntensity = Math.min(5.0, bloomIntensity + 0.2);
            updateEnvironment();
          } else if (k === '3') {
            bloomThreshold = Math.max(0.1, bloomThreshold - 0.1);
            updateEnvironment();
          } else if (k === '4') {
            bloomThreshold = Math.min(2.0, bloomThreshold + 0.1);
            updateEnvironment();
          } else if (k === 'a') {
            camAngle -= 0.06;
            applyCamera();
          } else if (k === 'd') {
            camAngle += 0.06;
            applyCamera();
          } else if (k === 'w') {
            camDistance = Math.max(6.0, camDistance - 0.5);
            applyCamera();
          } else if (k === 's') {
            camDistance = Math.min(30.0, camDistance + 0.5);
            applyCamera();
          }
        }
      }
    }

    if (!isPaused) animTime += dt;
    if (autoOrbit && !isPaused) {
      camAngle += 0.008;
      applyCamera();
    }

    // Advance Models via Transition API
    if (!isPaused) {
      galfus.animationStep(dt);
    }
    const coreState = galfus.animationGetState(5);
    const coreBob =
      coreState && 'value' in (coreState.currentValue as any)
        ? ((coreState.currentValue as any).value[1] as number) - POS_CORE[1]
        : 0.0;

    // Animate 8 Point Lights (Compute Frustum Culling)
    const lightPositions: [number, number, number][] = [];
    for (let i = 0; i < NUM_ORBIT_LIGHTS; i++) {
      const angle = (i / NUM_ORBIT_LIGHTS) * Math.PI * 2.0 + animTime * 0.8;
      const radius = 6.8 + Math.sin(animTime * 1.2 + i) * 1.5;
      const ly = Math.max(0.4, 2.0 + Math.sin(animTime * 1.6 + i * 1.5) * 1.8);
      const lx = Math.cos(angle) * radius;
      const lz = Math.sin(angle) * radius;
      lightPositions.push([lx, ly, lz]);

      galfus.realm3dSetLightTransform(REALM_3D, LIGHT_ORBIT_START + i, {
        position: [lx, ly, lz],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1]
      });
    }

    // Render 3D Debug Gizmos
    if (gizmosEnabled) {
      galfus.realm3dClearGizmos(REALM_3D);

      // Axes & Grid
      galfus.realm3dDrawLine(REALM_3D, 0, 0.05, 0, 2.5, 0.05, 0, 1.0, 0.1, 0.1, 1.0);
      galfus.realm3dDrawLine(REALM_3D, 0, 0.05, 0, 0, 2.55, 0, 0.1, 1.0, 0.1, 1.0);
      galfus.realm3dDrawLine(REALM_3D, 0, 0.05, 0, 0, 0.05, 2.5, 0.1, 0.3, 1.0, 1.0);

      const GRID_EXTENT = 12.0,
        GRID_STEP = 2.0;
      for (let g = -GRID_EXTENT; g <= GRID_EXTENT; g += GRID_STEP) {
        galfus.realm3dDrawLine(
          REALM_3D,
          g,
          0.02,
          -GRID_EXTENT,
          g,
          0.02,
          GRID_EXTENT,
          0.25,
          0.28,
          0.35,
          0.35
        );
        galfus.realm3dDrawLine(
          REALM_3D,
          -GRID_EXTENT,
          0.02,
          g,
          GRID_EXTENT,
          0.02,
          g,
          0.25,
          0.28,
          0.35,
          0.35
        );
      }

      // Reverse-Z AABBs around rotating primitives
      galfus.realm3dDrawAabb(
        REALM_3D,
        POS_TORUS[0] - 1.5,
        POS_TORUS[1] - 0.7,
        POS_TORUS[2] - 1.5,
        POS_TORUS[0] + 1.5,
        POS_TORUS[1] + 0.7,
        POS_TORUS[2] + 1.5,
        1.0,
        0.82,
        0.3,
        0.85
      );
      galfus.realm3dDrawAabb(
        REALM_3D,
        POS_CAPSULE[0] - 0.8,
        POS_CAPSULE[1] - 1.6,
        POS_CAPSULE[2] - 0.8,
        POS_CAPSULE[0] + 0.8,
        POS_CAPSULE[1] + 1.6,
        POS_CAPSULE[2] + 0.8,
        0.15,
        0.75,
        0.95,
        0.85
      );
      galfus.realm3dDrawAabb(
        REALM_3D,
        POS_CYLINDER[0] - 0.9,
        POS_CYLINDER[1] - 1.25,
        POS_CYLINDER[2] - 0.9,
        POS_CYLINDER[0] + 0.9,
        POS_CYLINDER[1] + 1.25,
        POS_CYLINDER[2] + 0.9,
        0.82,
        0.85,
        0.9,
        0.85
      );
      galfus.realm3dDrawAabb(
        REALM_3D,
        POS_PYRAMID[0] - 1.0,
        POS_PYRAMID[1] - 0.1,
        POS_PYRAMID[2] - 1.0,
        POS_PYRAMID[0] + 1.0,
        POS_PYRAMID[1] + 1.8,
        POS_PYRAMID[2] + 1.0,
        0.95,
        0.18,
        0.28,
        0.85
      );
      galfus.realm3dDrawAabb(
        REALM_3D,
        POS_CORE[0] - 0.95,
        POS_CORE[1] + coreBob - 0.95,
        POS_CORE[2] - 0.95,
        POS_CORE[0] + 0.95,
        POS_CORE[1] + coreBob + 0.95,
        POS_CORE[2] + 0.95,
        0.75,
        0.35,
        1.0,
        0.9
      );

      // Ray vectors from lights
      for (let i = 0; i < NUM_ORBIT_LIGHTS; i++) {
        const pos = lightPositions[i],
          col = LIGHT_PALETTE[i % LIGHT_PALETTE.length];
        if (!pos || !col) continue;
        const [lx, ly, lz] = pos,
          [r, g, b] = col;
        galfus.realm3dDrawLine(REALM_3D, lx, ly, lz, lx, 0.05, lz, r, g, b, 0.55);
        galfus.realm3dDrawLine(
          REALM_3D,
          lx,
          ly,
          lz,
          POS_CORE[0],
          POS_CORE[1] + coreBob,
          POS_CORE[2],
          r,
          g,
          b,
          0.25
        );
      }
    }

    galfus.multiverseDispatch(frameCount, dt);
    frameCount++;
    await Bun.sleep(16);
  }

  console.log('==> Shutting down Demo 3D-4...');
  galfus.multiverseDestroyInvocation(INVOCATION_MAIN);
  galfus.realm3dDestroy(REALM_3D);
  galfus.windowClose(windowId);
  galfus.platformShutdown();
  console.log('✔ Cleanup complete. Goodbye!');
}
