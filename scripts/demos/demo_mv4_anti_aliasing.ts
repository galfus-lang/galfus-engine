import { GalfusBun } from '../../sdk/bun/galfus.ts';
import type { AntiAliasingMode } from '../../sdk/typescript/galfus.ts';
import { extractKey, eulerToQuat, quatFromLookAt } from './utils.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const INVOCATION_RAW = 100;
const INVOCATION_AA = 101;

const CAMERA_ID = 1;
const GEOM_CUBE_ID = 1;
const GEOM_PLANE_ID = 2;

const MAT_CUBE_CYAN = 1;
const MAT_CUBE_MAGENTA = 2;
const MAT_CUBE_AMBER = 3;
const MAT_GROUND = 4;

const MODEL_CUBE_1 = 1;
const MODEL_CUBE_2 = 2;
const MODEL_CUBE_3 = 3;
const MODEL_GROUND = 4;

const LIGHT_DIR_ID = 1;

export async function runDemoMv4(): Promise<void> {
  console.log('================================================================');
  console.log('   GALFUS ENGINE - DEMO MV-4: GLOBAL MULTIVERSE ANTI-ALIASING');
  console.log('================================================================');

  const galfus = new GalfusBun();

  console.log('==> Initializing Platform Context...');
  try {
    galfus.platformInit();
  } catch (err) {
    console.error('Failed to initialize platform context:', err);
    process.exit(1);
  }

  const windowId = 1;
  const winWidth = 1024;
  const winHeight = 768;
  console.log('==> Creating window...');
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo MV-4: Anti-Aliasing (FXAA vs None)',
    size: [winWidth, winHeight],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created (Logical ID: ${windowId})`);

  console.log('==> Attaching window to Multiverse GPU presentation...');
  galfus.multiverseAttachWindow(windowId);

  // 1. Declare Window Target
  console.log('==> Declaring Window Target (#1)...');
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });

  // 2. Set initial Global AA to FXAA
  let currentGlobalAa: AntiAliasingMode = 'fxaa';
  galfus.multiverseSetAntiAliasing(currentGlobalAa);
  console.log(`✔ Multiverse Global Anti-Aliasing set to: [${currentGlobalAa.toUpperCase()}]`);

  // 3. Create Realm 3D
  console.log(`==> Creating Realm3D (#${REALM_3D})...`);
  galfus.realm3dCreate(REALM_3D);

  galfus.realm3dSetEnvironment(REALM_3D, {
    ambientColor: [0.08, 0.1, 0.15, 1.0],
    clearColor: [0.04, 0.05, 0.08, 1.0],
    fogColor: [0.04, 0.05, 0.08, 1.0],
    fogMode: 'none',
    fogStart: 10.0,
    fogEnd: 50.0,
    fogDensity: 0.01,
    exposure: 1.2
  });

  // Camera setup
  const camPos: [number, number, number] = [0.0, 3.2, 7.5];
  const camRot = quatFromLookAt(camPos, [0.0, 1.0, 0.0]);
  galfus.realm3dCreateCamera(
    REALM_3D,
    CAMERA_ID,
    {
      kind: 'perspective',
      fovY: 50.0,
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

  // Geometries
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_CUBE_ID, {
    primitive: 'cube',
    size: 1.8
  });
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_PLANE_ID, {
    primitive: 'plane',
    size: 25.0
  });

  // High-Contrast Materials to emphasize edge aliasing vs smoothing
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_CYAN, {
    surfaceType: 'opaque',
    baseColor: [0.0, 0.95, 1.0, 1.0], // Neon Cyan
    emissiveColor: [0.0, 0.05, 0.1, 1.0],
    metallic: 0.1,
    roughness: 0.25,
    reflectance: 0.5
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_MAGENTA, {
    surfaceType: 'opaque',
    baseColor: [1.0, 0.1, 0.5, 1.0], // Neon Magenta
    emissiveColor: [0.08, 0.0, 0.02, 1.0],
    metallic: 0.15,
    roughness: 0.25,
    reflectance: 0.5
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_AMBER, {
    surfaceType: 'opaque',
    baseColor: [1.0, 0.85, 0.15, 1.0], // Gold Amber
    emissiveColor: [0.06, 0.04, 0.0, 1.0],
    metallic: 0.3,
    roughness: 0.2,
    reflectance: 0.6
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_GROUND, {
    surfaceType: 'opaque',
    baseColor: [0.12, 0.15, 0.2, 1.0], // Dark Slate Ground
    emissiveColor: [0.0, 0.0, 0.0, 1.0],
    metallic: 0.05,
    roughness: 0.8,
    reflectance: 0.2
  });

  // Models
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_CUBE_1,
    {
      geometryId: GEOM_CUBE_ID,
      materialId: MAT_CUBE_CYAN,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    { position: [-2.6, 1.3, 0.0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_CUBE_2,
    {
      geometryId: GEOM_CUBE_ID,
      materialId: MAT_CUBE_MAGENTA,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    { position: [0.0, 1.8, -0.8], rotation: [0, 0, 0, 1], scale: [1.4, 1.4, 1.4] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_CUBE_3,
    {
      geometryId: GEOM_CUBE_ID,
      materialId: MAT_CUBE_AMBER,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    { position: [2.6, 1.3, 0.0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_GROUND,
    {
      geometryId: GEOM_PLANE_ID,
      materialId: MAT_GROUND,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    { position: [0.0, 0.0, 0.0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  );

  // Directional Light
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_DIR_ID,
    {
      kind: 'directional',
      color: [1.0, 1.0, 1.0],
      intensity: 4.0,
      castShadow: false
    },
    {
      position: [0.0, 10.0, 0.0],
      rotation: eulerToQuat(-0.8, -0.6, 0.0),
      scale: [1, 1, 1]
    }
  );

  // 4. Setup Invocations
  // Default: Split-Screen mode
  // Left: Forced None (Raw aliased edges)
  // Right: Inherits Global AA (FXAA)
  let isSplitScreen = true;

  console.log('==> Creating Multiverse Invocations:');
  console.log(
    '    [Left Viewport]  Invocation #100 -> Forced `antiAliasing: "none"` (Raw Staircases)'
  );
  galfus.multiverseCreateInvocation(INVOCATION_RAW, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: {
      anchorX: 'left',
      anchorY: 'top',
      width: { vw: 50 },
      height: { vh: 100 }
    },
    filters: [],
    zIndex: 0,
    enabled: true,
    antiAliasing: 'none' // Explicit override: raw edges
  });

  console.log(
    '    [Right Viewport] Invocation #101 -> Inheriting Multiverse Global AA (Smooth FXAA)'
  );
  galfus.multiverseCreateInvocation(INVOCATION_AA, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: {
      anchorX: 'right',
      anchorY: 'top',
      width: { vw: 50 },
      height: { vh: 100 }
    },
    filters: [],
    zIndex: 0,
    enabled: true
    // antiAliasing omitted: automatically inherits multiverse.setAntiAliasing(...)!
  });

  function updateViewports(): void {
    if (isSplitScreen) {
      galfus.multiverseSetInvocationViewport(INVOCATION_RAW, {
        anchorX: 'left',
        anchorY: 'top',
        width: { vw: 50 },
        height: { vh: 100 }
      });
      galfus.multiverseSetInvocationEnabled(INVOCATION_RAW, true);

      galfus.multiverseSetInvocationViewport(INVOCATION_AA, {
        anchorX: 'right',
        anchorY: 'top',
        width: { vw: 50 },
        height: { vh: 100 }
      });
      galfus.multiverseSetInvocationEnabled(INVOCATION_AA, true);
    } else {
      // Fullscreen view with active Global AA
      galfus.multiverseSetInvocationEnabled(INVOCATION_RAW, false);
      galfus.multiverseSetInvocationViewport(INVOCATION_AA, {
        anchorX: 'left',
        anchorY: 'top',
        width: { vw: 100 },
        height: { vh: 100 }
      });
      galfus.multiverseSetInvocationEnabled(INVOCATION_AA, true);
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(' CONTROLS:');
  console.log('   [F] / [SPACE] - Cycle Global Anti-Aliasing (FXAA <-> NONE)');
  console.log('   [S]           - Toggle Split-Screen vs Fullscreen Mode');
  console.log('   [R]           - Pause / Resume Rotation');
  console.log('   [ESC]         - Exit Demo');
  console.log('----------------------------------------------------------------\n');

  let frameCount = 0;
  let angle = 0.0;
  let isRotating = true;
  let lastTime = performance.now();
  let running = true;

  while (running) {
    const now = performance.now();
    const dt = Math.max(0.001, Math.min(0.1, (now - lastTime) / 1000));
    lastTime = now;

    // Pump events
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
            break;
          } else if (key === 'f' || key === 'space' || key === ' ') {
            currentGlobalAa = currentGlobalAa === 'fxaa' ? 'none' : 'fxaa';
            galfus.multiverseSetAntiAliasing(currentGlobalAa);
            const verified = galfus.multiverseGetAntiAliasing();
            console.log(`[MULTIVERSE] Global Anti-Aliasing set to: [${verified.toUpperCase()}]`);
          } else if (key === 's') {
            isSplitScreen = !isSplitScreen;
            updateViewports();
            console.log(
              `[MULTIVERSE] Viewport mode: ${isSplitScreen ? 'SPLIT (Left: None | Right: Global)' : 'FULLSCREEN'}`
            );
          } else if (key === 'r') {
            isRotating = !isRotating;
            console.log(`[ANIMATION] Rotation: ${isRotating ? 'ACTIVE' : 'PAUSED'}`);
          }
        }
      }
    }

    if (!running) break;

    // Rotate geometry to observe dynamic diagonal anti-aliasing
    if (isRotating) {
      angle += dt * 0.9;
      galfus.realm3dSetModelTransform(REALM_3D, MODEL_CUBE_1, {
        position: [-2.6, 1.3, 0.0],
        rotation: eulerToQuat(angle * 1.2, angle * 0.8, 0.0),
        scale: [1, 1, 1]
      });

      galfus.realm3dSetModelTransform(REALM_3D, MODEL_CUBE_2, {
        position: [0.0, 1.8, -0.8],
        rotation: eulerToQuat(angle * 0.5, -angle * 1.1, angle * 0.3),
        scale: [1.4, 1.4, 1.4]
      });

      galfus.realm3dSetModelTransform(REALM_3D, MODEL_CUBE_3, {
        position: [2.6, 1.3, 0.0],
        rotation: eulerToQuat(-angle * 0.7, angle * 1.3, angle * 0.5),
        scale: [1, 1, 1]
      });
    }

    galfus.multiverseDispatch(frameCount, dt);
    frameCount++;

    await new Promise((r) => setTimeout(r, 16));
  }

  console.log('\n==> Cleaning up Multiverse & Platform context...');
  galfus.multiverseDestroyInvocation(INVOCATION_RAW);
  galfus.multiverseDestroyInvocation(INVOCATION_AA);
  galfus.realmDestroy(REALM_3D);
  galfus.multiverseDestroyTarget(TARGET_WINDOW);
  galfus.platformShutdown();
  console.log('✔ Demo MV-4 completed successfully.');
}
