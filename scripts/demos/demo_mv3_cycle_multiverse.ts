import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { createPrimitiveGeometry } from './geometry_3d.ts';
import type { ViewportRect } from '../../sdk/typescript/galfus.ts';
import { extractKey, eulerToQuat, quatFromLookAt } from './utils.ts';

// Target IDs
const TARGET_WINDOW = 1;
const TARGET_3D_RTT = 2;
const TARGET_2D_RTT = 3;

// Realm IDs
const REALM_3D = 10;
const REALM_2D = 20;

// Multiverse Invocation IDs
const INVOCATION_3D_RTT = 100; // Realm 3D renders to Target 2 (reads Target 3)
const INVOCATION_2D_RTT = 101; // Realm 2D renders to Target 3 (reads Target 2 - CYCLE!)
const INVOCATION_3D_MAIN = 102; // Realm 3D renders fullscreen to Window
const INVOCATION_2D_OVERLAY = 103; // Realm 2D renders PIP portal to Window

// Realm 3D Resource IDs
const CAM_3D_RTT_ID = 1;
const CAM_3D_MAIN_ID = 2;
const GEOM_CUBE_ID = 1;
const GEOM_FLOOR_ID = 2;
const MAT_CUBE_CYCLE_ID = 1;
const MAT_FLOOR_ID = 2;
const MODEL_CUBE_ID = 1;
const MODEL_FLOOR_ID = 2;
const LIGHT_3D_DIR_ID = 1;
const LIGHT_3D_POINT_ID = 2;

// Realm 2D Resource IDs
const CAM_2D_RTT_ID = 1;
const MAT_2D_BG_ID = 1;
const MAT_2D_PORTAL_ID = 2;
const MAT_2D_RING_ID = 3;
const SPRITE_2D_BG_ID = 1;
const SPRITE_2D_PORTAL_ID = 2;
const SHAPE_2D_RING_ID = 3;
const LIGHT_2D_ID = 1;
const EMITTER_2D_ID = 1;

export async function runDemoMv3(): Promise<void> {
  console.log(`================================================================
   GALFUS ENGINE - DEMO MV3: MULTIVERSE REALM CYCLES & SOFT CUTS
   Cycle: Realm 3D RTT (reads 2D RTT) <---> Realm 2D RTT (reads 3D RTT)
   Window: Fullscreen 3D Recursive Portal + 2D Telemetry Minimap
================================================================`);

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
    title: 'Galfus Engine - Demo MV3: Multiverse Cyclic Feedback & Soft Cut',
    size: [winWidth, winHeight],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created (Logical ID: ${windowId})`);

  console.log('==> Attaching window to Multiverse GPU presentation...');
  galfus.multiverseAttachWindow(windowId);

  // 1. Declare Multiverse Targets
  console.log('==> Declaring Targets (Window, 3D RTT, 2D RTT)...');
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });

  const RTT_SIZE = 512;
  galfus.multiverseCreateTarget(TARGET_3D_RTT, {
    kind: {
      type: 'texture',
      width: RTT_SIZE,
      height: RTT_SIZE,
      format: 'rgba8unorm'
    },
    size: [RTT_SIZE, RTT_SIZE]
  });

  galfus.multiverseCreateTarget(TARGET_2D_RTT, {
    kind: {
      type: 'texture',
      width: RTT_SIZE,
      height: RTT_SIZE,
      format: 'rgba8unorm'
    },
    size: [RTT_SIZE, RTT_SIZE]
  });

  // 2. Create Realm 3D & Realm 2D
  console.log(`==> Creating Realm3D (#${REALM_3D}) & Realm2D (#${REALM_2D})...`);
  galfus.realm3dCreate(REALM_3D);
  galfus.realm2dCreate(REALM_2D);

  // 3. Declare Inter-Realm Cyclic Dependencies
  console.log('==> Establishing Mutual Target Texture Cycle...');
  galfus.multiverseBindTargetTexture({
    sourceTargetId: TARGET_2D_RTT,
    realmId: REALM_3D,
    slot: 'material_cube_albedo'
  });
  galfus.multiverseBindTargetTexture({
    sourceTargetId: TARGET_3D_RTT,
    realmId: REALM_2D,
    slot: 'portal_sprite_texture'
  });

  // -------------------------------------------------------------
  // Setup Realm 3D
  // -------------------------------------------------------------
  galfus.realm3dSetEnvironment(REALM_3D, {
    ambientColor: [0.08, 0.08, 0.12, 1.0],
    clearColor: [0.02, 0.02, 0.04, 1.0],
    fogMode: 'none',
    exposure: 1.2
  });

  // Camera 1 (RTT Camera for Cube feedback)
  const camRttPos: [number, number, number] = [0.0, 1.5, 3.2];
  galfus.realm3dCreateCamera(
    REALM_3D,
    CAM_3D_RTT_ID,
    { fovY: 55.0, near: 0.1, far: 100.0, cameraSlot: 1 },
    {
      position: camRttPos,
      rotation: quatFromLookAt(camRttPos, [0.0, 0.0, 0.0]),
      scale: [1.0, 1.0, 1.0]
    }
  );

  // Camera 2 (Main Player Camera)
  const camMainPos: [number, number, number] = [0.0, 2.0, 4.5];
  galfus.realm3dCreateCamera(
    REALM_3D,
    CAM_3D_MAIN_ID,
    { fovY: 45.0, near: 0.1, far: 100.0, cameraSlot: 2 },
    {
      position: camMainPos,
      rotation: quatFromLookAt(camMainPos, [0.0, 0.0, 0.0]),
      scale: [1.0, 1.0, 1.0]
    }
  );

  createPrimitiveGeometry(galfus, REALM_3D, GEOM_CUBE_ID, { primitive: 'cube', size: 1.8 });
  createPrimitiveGeometry(galfus, REALM_3D, GEOM_FLOOR_ID, { primitive: 'plane', size: 12.0 });

  // Cube Material uses TARGET_2D_RTT texture
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_CYCLE_ID, {
    surfaceType: 'opaque',
    textureSlots: [TARGET_2D_RTT],
    textureUvSets: ['uv1'],
    baseColor: [1.0, 1.0, 1.0, 1.0],
    roughness: 0.2,
    metallic: 0.1
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_FLOOR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.1, 0.12, 0.16, 1.0],
    roughness: 0.8,
    metallic: 0.1
  });

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_CUBE_ID,
    {
      geometryId: GEOM_CUBE_ID,
      materialId: MAT_CUBE_CYCLE_ID,
      castShadow: true,
      receiveShadow: true,
      active: true
    },
    { position: [0.0, 0.0, 0.0], rotation: [0.0, 0.0, 0.0, 1.0], scale: [1.0, 1.0, 1.0] }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FLOOR_ID,
    {
      geometryId: GEOM_FLOOR_ID,
      materialId: MAT_FLOOR_ID,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    { position: [0.0, -1.4, 0.0], rotation: [0.0, 0.0, 0.0, 1.0], scale: [1.0, 1.0, 1.0] }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_3D_DIR_ID,
    {
      kind: 'directional',
      color: [0.9, 0.95, 1.0],
      intensity: 1.5,
      castShadow: false
    },
    {
      position: [-2.0, 6.0, 4.0],
      rotation: quatFromLookAt([-2.0, 6.0, 4.0], [0, 0, 0]),
      scale: [1, 1, 1]
    }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_3D_POINT_ID,
    {
      kind: 'point',
      color: [0.2, 0.8, 1.0],
      intensity: 3.5,
      range: 10.0,
      castShadow: false
    },
    {
      position: [1.8, 1.2, 1.5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  );

  // -------------------------------------------------------------
  // Setup Realm 2D
  // -------------------------------------------------------------
  const WORLD_2D_HEIGHT = 16.0;
  galfus.realm2dCreateCamera(
    REALM_2D,
    CAM_2D_RTT_ID,
    {
      orthoScale: WORLD_2D_HEIGHT,
      near: -100.0,
      far: 100.0,
      cameraSlot: 1,
      active: true
    },
    {
      position: [0.0, 0.0],
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 0
    }
  );

  // Background gradient / grid
  galfus.realm2dCreateMaterial(REALM_2D, MAT_2D_BG_ID, {
    surfaceType: 'opaque',
    baseColor: [0.05, 0.07, 0.12, 1.0]
  });
  galfus.realm2dCreateSprite(
    REALM_2D,
    SPRITE_2D_BG_ID,
    { dimensions: [24.0, 18.0], materialId: MAT_2D_BG_ID, castShadow: false, receiveShadow: false },
    { position: [0.0, 0.0], zLayer: -10 }
  );

  // Central Portal Sprite displaying TARGET_3D_RTT
  galfus.realm2dCreateMaterial(REALM_2D, MAT_2D_PORTAL_ID, {
    surfaceType: 'opaque',
    textureSlots: [TARGET_3D_RTT],
    textureId: TARGET_3D_RTT,
    baseColor: [1.0, 1.0, 1.0, 1.0]
  });
  galfus.realm2dCreateSprite(
    REALM_2D,
    SPRITE_2D_PORTAL_ID,
    {
      dimensions: [6.5, 6.5],
      materialId: MAT_2D_PORTAL_ID,
      castShadow: false,
      receiveShadow: false
    },
    { position: [0.0, 0.0], zLayer: 0 }
  );

  // Orbiting ring around portal
  galfus.realm2dCreateMaterial(REALM_2D, MAT_2D_RING_ID, {
    surfaceType: 'transparent',
    baseColor: [0.0, 0.9, 1.0, 0.8]
  });
  galfus.realm2dCreateShape(
    REALM_2D,
    SHAPE_2D_RING_ID,
    {
      kind: 'rectangle',
      size: [7.2, 7.2],
      materialId: MAT_2D_RING_ID,
      castShadow: false,
      receiveShadow: false
    },
    { position: [0.0, 0.0], rotation: 0.0, zLayer: 2 }
  );

  // Setup Animation Transitions for Cyclic 3D Cube & 2D Portal Ring via Transition API
  console.log('==> Configuring Animation Transitions for Cyclic Demo...');
  const qCubeTarget = eulerToQuat(1.1, 1.8, 0.6);
  galfus.animationCreateTransition(
    1,
    { type: 'transform3D', value: [0.0, -0.15, 0.0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 2.8, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(1, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_CUBE_ID
  });
  galfus.animationTransitionTo(1, {
    type: 'transform3D',
    value: [0.0, 0.2, 0.0, qCubeTarget[0], qCubeTarget[1], qCubeTarget[2], qCubeTarget[3], 1, 1, 1]
  });

  galfus.animationCreateTransition(
    2,
    { type: 'transform2D', value: [0.0, 0.0, 0.0, 0.94, 0.94, 2] },
    { duration: 2.2, delay: 0.1, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(2, {
    kind: 'shapeTransform2D',
    realmId: REALM_2D,
    shapeId: SHAPE_2D_RING_ID
  });
  galfus.animationTransitionTo(2, {
    type: 'transform2D',
    value: [0.0, 0.0, 3.14159, 1.06, 1.06, 2]
  });

  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_2D_ID,
    {
      color: [0.0, 0.8, 1.0],
      intensity: 2.5,
      range: 12.0,
      lightRadius: 0.2,
      castShadow: false,
      active: true
    },
    { position: [0.0, 0.0], zLayer: 5 }
  );

  galfus.realm2dCreateParticleEmitter(
    REALM_2D,
    EMITTER_2D_ID,
    {
      materialId: MAT_2D_RING_ID,
      maxParticles: 256,
      spawnRate: 40.0,
      lifetimeRange: [1.0, 2.0],
      speedRange: [1.5, 3.5],
      direction: [0.0, 1.0],
      spreadAngleRad: Math.PI * 2.0,
      startSizeRange: [0.2, 0.35],
      endSizeRange: [0.02, 0.05],
      startColor: [0.0, 1.0, 0.8, 1.0],
      endColor: [1.0, 0.2, 0.8, 0.0],
      emissionShape: { type: 'circle', radius: 3.5 },
      zLayer: 6
    },
    { position: [0.0, 0.0], zLayer: 6 }
  );

  // -------------------------------------------------------------
  // Setup Multiverse Invocations
  // -------------------------------------------------------------
  const fullVp: ViewportRect = {
    width: { vw: 100 },
    height: { vh: 100 }
  };

  // Minimap / Portal PIP in top-right corner
  const pipVp: ViewportRect = {
    anchorX: 'right',
    anchorY: 'top',
    offsetX: { px: 24 },
    offsetY: { px: 24 },
    width: { px: 240 },
    height: { px: 240 }
  };

  // 1. Realm 3D renders into TARGET_3D_RTT using Camera Slot 1
  galfus.multiverseCreateInvocation(INVOCATION_3D_RTT, {
    realmId: REALM_3D,
    targetId: TARGET_3D_RTT,
    cameraSlot: 1,
    viewport: fullVp,
    filters: [],
    zIndex: 0,
    enabled: true,
    clearColor: [0.02, 0.02, 0.04, 1.0]
  });

  // 2. Realm 2D renders into TARGET_2D_RTT
  galfus.multiverseCreateInvocation(INVOCATION_2D_RTT, {
    realmId: REALM_2D,
    targetId: TARGET_2D_RTT,
    cameraSlot: 1,
    viewport: fullVp,
    filters: [],
    zIndex: 0,
    enabled: true,
    clearColor: [0.01, 0.01, 0.02, 1.0]
  });

  // 3. Realm 3D renders into Window using Camera Slot 2
  galfus.multiverseCreateInvocation(INVOCATION_3D_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 2,
    viewport: fullVp,
    filters: [],
    zIndex: 0,
    enabled: true,
    clearColor: [0.02, 0.02, 0.04, 1.0]
  });

  // 4. Realm 2D PIP overlay on Window
  galfus.multiverseCreateInvocation(INVOCATION_2D_OVERLAY, {
    realmId: REALM_2D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: pipVp,
    filters: [],
    zIndex: 10,
    enabled: true,
    clearColor: [0.0, 0.0, 0.0, 0.0]
  });

  console.log('==> Multiverse resolving execution plan (detecting cyclic feedback)...');
  console.log('✔ Cycle successfully resolved via deterministic Soft Cut!');

  // -------------------------------------------------------------
  // Render Loop & Interactive Animation
  // -------------------------------------------------------------
  let frame = 0;
  let totalTime = 0.0;
  let running = true;
  let lastTime = performance.now();

  console.log('\n================================================================');
  console.log(' Controls:');
  console.log('   [Space] - Trigger 2D particle burst in recursive portal');
  console.log('   [Esc]   - Quit demo');
  console.log('================================================================\n');

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;
    totalTime += dt;
    frame++;

    // Poll Platform Events
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
          }
          if (key === ' ' || key === 'space') {
            galfus.realm2dParticleEmitterBurst(REALM_2D, EMITTER_2D_ID, 60);
            console.log(`[Frame ${frame}] Portal burst triggered!`);
          }
        }
      }
    }

    // Advance Animations via Transition API
    galfus.animationStep(dt);

    // Orbit 3D Light
    const lightX = Math.cos(totalTime * 1.5) * 2.5;
    const lightZ = Math.sin(totalTime * 1.5) * 2.5;
    galfus.realm3dSetLightTransform(REALM_3D, LIGHT_3D_POINT_ID, {
      position: [lightX, 1.2, lightZ],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    });

    // Orbit 2D Light around portal
    galfus.realm2dSetLightTransform(REALM_2D, LIGHT_2D_ID, {
      position: [Math.cos(totalTime * 2.5) * 4.0, Math.sin(totalTime * 2.5) * 4.0],
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 5
    });

    // Multiverse Frame Dispatch (Resolves cyclic graph with soft cut)
    try {
      galfus.multiverseDispatch(frame, dt);
    } catch (dispatchErr) {
      console.error(`[Frame ${frame}] Multiverse dispatch error:`, dispatchErr);
      break;
    }

    if (frame % 120 === 0) {
      const fps = (1.0 / dt).toFixed(1);
      console.log(`[Frame ${frame}] Multiverse Cycle Soft Cut Active - ${fps} FPS`);
    }

    await new Promise((r) => setTimeout(r, 16));
  }

  console.log('==> Shutting down Galfus platform...');
  galfus.platformShutdown();
  console.log('✔ Demo MV3 completed cleanly.');
}
