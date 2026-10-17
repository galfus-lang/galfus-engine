import { GalfusBun } from '../../sdk/bun/galfus.ts';
import type { InvocationFilter, ViewportRect } from '../../sdk/typescript/galfus.ts';
import { extractKey, eulerToQuat, quatFromLookAt } from './utils.ts';

// Target IDs
const TARGET_WINDOW = 1;
const TARGET_2D_RTT = 2;

// Realm IDs
const REALM_3D = 10;
const REALM_2D = 20;

// Multiverse Invocation IDs
const INVOCATION_2D_RTT = 100;
const INVOCATION_3D_MAIN = 101;
const INVOCATION_2D_MINIMAP = 102;

// Realm 3D Resource IDs
const CAM_3D_ID = 1;
const GEOM_CUBE_ID = 1;
const GEOM_PEDESTAL_ID = 2;
const MAT_CUBE_RTT_ID = 1;
const MAT_PEDESTAL_ID = 2;
const MODEL_CUBE_ID = 1;
const MODEL_PEDESTAL_ID = 2;
const LIGHT_3D_DIR_ID = 1;
const LIGHT_3D_POINT_ID = 2;

// Realm 2D Resource IDs
const CAM_2D_ID = 1;
const MAT_2D_BG_ID = 1;
const MAT_2D_CORE_ID = 2;
const MAT_2D_ORBIT_A_ID = 3;
const MAT_2D_ORBIT_B_ID = 4;
const MAT_2D_PARTICLE_ID = 5;

const SPRITE_2D_BG_ID = 1;
const SHAPE_2D_CORE_ID = 2;
const SHAPE_2D_ORBIT_A_ID = 3;
const SHAPE_2D_ORBIT_B_ID = 4;
const LIGHT_2D_POINT_ID = 1;
const EMITTER_2D_ID = 1;

export async function runDemoMv2(): Promise<void> {
  console.log(`================================================================
   GALFUS ENGINE - DEMO MV2: FULLSCREEN 3D & 2D CORNER MINIMAP
   Background: Realm 3D Fullscreen (Rotating PBR Cube Textured with 2D)
   Overlay HUD: Realm 2D Minimap (Right Corner with Border Padding)
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
    title: 'Galfus Engine - Demo MV2: Fullscreen 3D & 2D Minimap (RTT Texture Reuse)',
    size: [winWidth, winHeight],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created (Logical ID: ${windowId})`);

  console.log('==> Attaching window to Multiverse GPU presentation...');
  galfus.multiverseAttachWindow(windowId);

  // 1. Target 1: Main Window
  console.log('==> Declaring Window Target (#1)...');
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });

  // 2. Target 2: Offscreen Texture Target (512x512) for Realm 2D RTT
  const RTT_SIZE = 512;
  console.log(`==> Declaring Offscreen RTT Target (#2) (${RTT_SIZE}x${RTT_SIZE})...`);
  galfus.multiverseCreateTarget(TARGET_2D_RTT, {
    kind: {
      type: 'texture',
      width: RTT_SIZE,
      height: RTT_SIZE,
      format: 'rgba8unorm'
    },
    size: [RTT_SIZE, RTT_SIZE]
  });

  // 3. Create Realm 3D and Realm 2D
  console.log(`==> Creating Realm3D (#${REALM_3D}) & Realm2D (#${REALM_2D})...`);
  galfus.realm3dCreate(REALM_3D);
  galfus.realm2dCreate(REALM_2D);

  // 4. Multiverse Inter-Target Binding: Realm 3D consumes TARGET_2D_RTT
  console.log('==> Binding TARGET_2D_RTT output texture to Realm 3D dependency graph...');
  galfus.multiverseBindTargetTexture({
    sourceTargetId: TARGET_2D_RTT,
    realmId: REALM_3D,
    slot: 'material_cube_albedo'
  });

  // -------------------------------------------------------------
  // Setup Realm 3D (Fullscreen Background Presentation)
  // -------------------------------------------------------------
  console.log('==> Configuring Realm 3D environment, camera, geometries and lights...');
  galfus.realm3dSetEnvironment(REALM_3D, {
    ambientColor: [0.08, 0.09, 0.13, 1.0],
    clearColor: [0.03, 0.04, 0.06, 1.0],
    fogMode: 'none',
    exposure: 1.15
  });

  // 3D Camera looking at the center
  const camPos: [number, number, number] = [0.0, 2.2, 4.2];
  const lookTarget: [number, number, number] = [0.0, 0.0, 0.0];
  galfus.realm3dCreateCamera(
    REALM_3D,
    CAM_3D_ID,
    {
      fovY: 45.0,
      near: 0.1,
      far: 100.0,
      cameraSlot: 1
    },
    {
      position: camPos,
      rotation: quatFromLookAt(camPos, lookTarget),
      scale: [1.0, 1.0, 1.0]
    }
  );

  // Cube Geometry & Pedestal Geometry
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_CUBE_ID, {
    primitive: 'cube',
    size: 1.8
  });
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_PEDESTAL_ID, {
    primitive: 'plane',
    size: 10.0
  });

  // Cube Material: Uses TARGET_2D_RTT in slot 0 (albedo) with LinearRepeat sampler!
  console.log('==> Creating Realm 3D Cube Material bound to TARGET_2D_RTT texture slot...');
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_RTT_ID, {
    surfaceType: 'opaque',
    textureSlots: [TARGET_2D_RTT],
    samplerIndex: 0, // LinearRepeat
    baseColor: [1.0, 1.0, 1.0, 1.0],
    roughness: 0.25,
    metallic: 0.1
  });

  // Dark circular floor under the cube
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PEDESTAL_ID, {
    surfaceType: 'opaque',
    baseColor: [0.15, 0.18, 0.24, 1.0],
    roughness: 0.7,
    metallic: 0.2
  });

  // Models
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_CUBE_ID,
    {
      geometryId: GEOM_CUBE_ID,
      materialId: MAT_CUBE_RTT_ID,
      castShadow: true,
      receiveShadow: true,
      active: true
    },
    {
      position: [0.0, 0.2, 0.0],
      rotation: [0.0, 0.0, 0.0, 1.0],
      scale: [1.0, 1.0, 1.0]
    }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PEDESTAL_ID,
    {
      geometryId: GEOM_PEDESTAL_ID,
      materialId: MAT_PEDESTAL_ID,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    {
      position: [0.0, -1.3, 0.0],
      rotation: [0.0, 0.0, 0.0, 1.0],
      scale: [1.0, 1.0, 1.0]
    }
  );

  // Lights
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_3D_DIR_ID,
    {
      kind: 'directional',
      color: [1.0, 0.96, 0.88],
      intensity: 2.5,
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
      color: [0.3, 0.8, 1.0],
      intensity: 4.0,
      range: 12.0,
      castShadow: false
    },
    {
      position: [2.5, 2.0, 1.5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  );

  // -------------------------------------------------------------
  // Setup Realm 2D (Interactive Canvas & Offscreen Producer)
  // -------------------------------------------------------------
  console.log('==> Setting up Realm 2D camera, sprites, shapes, and particles...');
  const WORLD_2D_HEIGHT = 16.0;
  galfus.realm2dCreateCamera(
    REALM_2D,
    CAM_2D_ID,
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

  // 2D Materials
  galfus.realm2dCreateMaterial(REALM_2D, MAT_2D_BG_ID, {
    surfaceType: 'opaque',
    baseColor: [0.06, 0.07, 0.11, 1.0]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_2D_CORE_ID, {
    surfaceType: 'opaque',
    baseColor: [0.95, 0.25, 0.45, 1.0]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_2D_ORBIT_A_ID, {
    surfaceType: 'opaque',
    baseColor: [0.15, 0.85, 0.95, 1.0]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_2D_ORBIT_B_ID, {
    surfaceType: 'opaque',
    baseColor: [1.0, 0.82, 0.2, 1.0]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_2D_PARTICLE_ID, {
    surfaceType: 'additive',
    baseColor: [1.0, 0.9, 0.5, 1.0]
  });

  // Background Sprite & Shapes
  galfus.realm2dCreateSprite(
    REALM_2D,
    SPRITE_2D_BG_ID,
    { dimensions: [24.0, 18.0], materialId: MAT_2D_BG_ID, castShadow: false, receiveShadow: false },
    { position: [0.0, 0.0], zLayer: -10 }
  );

  galfus.realm2dCreateShape(
    REALM_2D,
    SHAPE_2D_CORE_ID,
    {
      kind: 'rectangle',
      size: [3.2, 3.2],
      materialId: MAT_2D_CORE_ID,
      castShadow: false,
      receiveShadow: false
    },
    { position: [0.0, 0.0], rotation: 0.0, zLayer: 2 }
  );

  galfus.realm2dCreateShape(
    REALM_2D,
    SHAPE_2D_ORBIT_A_ID,
    {
      kind: 'circle',
      radius: 1.0,
      materialId: MAT_2D_ORBIT_A_ID,
      castShadow: false,
      receiveShadow: false
    },
    { position: [3.5, 0.0], rotation: 0.0, zLayer: 3 }
  );

  galfus.realm2dCreateShape(
    REALM_2D,
    SHAPE_2D_ORBIT_B_ID,
    {
      kind: 'rectangle',
      size: [1.6, 1.6],
      materialId: MAT_2D_ORBIT_B_ID,
      castShadow: false,
      receiveShadow: false
    },
    { position: [-3.5, 0.0], rotation: 0.0, zLayer: 3 }
  );

  // 2D Dynamic Point Light
  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_2D_POINT_ID,
    {
      color: [1.0, 0.9, 0.7],
      intensity: 2.2,
      range: 12.0,
      lightRadius: 0.2,
      castShadow: false,
      active: true
    },
    { position: [0.0, 0.0], zLayer: 5 }
  );

  // 2D Particle Emitter: Floating Mystic Spark Fountain
  galfus.realm2dCreateParticleEmitter(
    REALM_2D,
    EMITTER_2D_ID,
    {
      materialId: MAT_2D_PARTICLE_ID,
      maxParticles: 256,
      spawnRate: 45.0,
      lifetimeRange: [1.2, 2.5],
      speedRange: [1.5, 3.5],
      direction: [0.0, 1.0],
      spreadAngleRad: 1.2,
      startSizeRange: [0.25, 0.4],
      endSizeRange: [0.02, 0.08],
      startColor: [1.0, 0.7, 0.2, 1.0],
      endColor: [1.0, 0.1, 0.3, 0.0],
      emissionShape: { type: 'rectangle', extents: [2.0, 0.3] },
      zLayer: 6
    },
    { position: [0.0, -2.0], zLayer: 6 }
  );

  // -------------------------------------------------------------
  // Setup Multiverse Invocations
  // -------------------------------------------------------------
  console.log('==> Creating Invocations (DAG: RTT -> Fullscreen 3D + Corner Minimap 2D):');

  // Invocation 1: Realm 2D renders full-canvas to offscreen TARGET_2D_RTT (512x512)
  galfus.multiverseCreateInvocation(INVOCATION_2D_RTT, {
    realmId: REALM_2D,
    targetId: TARGET_2D_RTT,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    filters: [],
    zIndex: 0,
    enabled: true,
    clearColor: [0.06, 0.07, 0.11, 1.0]
  });
  console.log('    [Pass 1] RTT     (#100): Realm 2D -> TARGET_2D_RTT (512x512)');

  // Invocation 2: Realm 3D renders Fullscreen to Window
  galfus.multiverseCreateInvocation(INVOCATION_3D_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    filters: [],
    zIndex: 0,
    enabled: true,
    clearColor: [0.03, 0.04, 0.06, 1.0]
  });
  console.log('    [Pass 2] 3D Main (#101): Realm 3D -> Fullscreen Window (z: 0)');

  // Invocation 3: Realm 2D renders as Corner Minimap HUD overlay using CSS-like responsive anchored viewport
  let minimapBottom = false;
  const getMinimapViewport = (bottom: boolean): ViewportRect => ({
    anchorX: 'right',
    anchorY: bottom ? 'bottom' : 'top',
    offsetX: { px: -24 },
    offsetY: { px: bottom ? -24 : 24 },
    width: { vh: 28 },
    height: { vh: 28 }
  });

  galfus.multiverseCreateInvocation(INVOCATION_2D_MINIMAP, {
    realmId: REALM_2D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: getMinimapViewport(minimapBottom),
    filters: ['vignette'],
    zIndex: 10,
    enabled: true,
    clearColor: [0.06, 0.07, 0.11, 1.0]
  });
  console.log(
    '    [Pass 3] Minimap (#102): Realm 2D -> HUD Overlay (Right Corner with Padding, z: 10)'
  );

  // Resolve and inspect schedule order
  const schedule = galfus.multiverseResolve();
  console.log(`✔ Multiverse DAG resolved: ${schedule.targetBlocks.length} target blocks ordered:`);
  for (const block of schedule.targetBlocks) {
    console.log(`   Target #${block.targetId} with ${block.invocations.length} invocations`);
  }

  console.log(`
================================================================
Controls:
  [SPACE]  Pause / Resume Animations
  [C]      Cycle 3D Cube Material Color Tint
  [M]      Toggle Minimap Corner (Top-Right / Bottom-Right)
  [F]      Cycle Minimap Post-Processing Filter
  [ESC/Q]  Exit Demo
================================================================
`);

  let frameId = 0;
  let lastTime = performance.now();
  let paused = false;
  let totalTime = 0.0;
  let colorTintIdx = 0;
  let filterIdx = 0;

  const COLOR_TINTS: [string, [number, number, number, number]][] = [
    ['Neutral White (Natural RTT)', [1.0, 1.0, 1.0, 1.0]],
    ['Cyberpunk Cyan Tint', [0.4, 0.9, 1.0, 1.0]],
    ['Solar Gold Tint', [1.0, 0.85, 0.4, 1.0]],
    ['Neon Magenta Tint', [1.0, 0.35, 0.8, 1.0]]
  ];

  const MINIMAP_FILTERS: [string, InvocationFilter[]][] = [
    ['Vignette (HUD Radar)', ['vignette']],
    ['Edge Outline (Sci-Fi Sensor)', ['edgeOutline']],
    ['Film Grain (Security Cam)', ['filmGrain']],
    ['None (Raw Pixel Canvas)', []]
  ];

  let running = true;
  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;

    if (!paused) {
      totalTime += dt;

      // 1. Animate Realm 2D Entities
      const coreAngle = totalTime * 1.4;
      galfus.realm2dSetShapeTransform(REALM_2D, SHAPE_2D_CORE_ID, {
        position: [0.0, 0.0],
        rotation: coreAngle,
        scale: [1.0 + 0.12 * Math.sin(totalTime * 3.0), 1.0 + 0.12 * Math.cos(totalTime * 3.0)],
        zLayer: 2
      });

      const orbitRadA = totalTime * 1.8;
      const orbitDistA = 4.2 + 0.6 * Math.sin(totalTime * 2.5);
      galfus.realm2dSetShapeTransform(REALM_2D, SHAPE_2D_ORBIT_A_ID, {
        position: [Math.cos(orbitRadA) * orbitDistA, Math.sin(orbitRadA) * orbitDistA],
        rotation: totalTime * 2.5,
        scale: [0.8 + 0.2 * Math.cos(totalTime * 4.0), 0.8 + 0.2 * Math.cos(totalTime * 4.0)],
        zLayer: 3
      });

      const orbitRadB = totalTime * -1.2 + Math.PI;
      const orbitDistB = 4.8;
      galfus.realm2dSetShapeTransform(REALM_2D, SHAPE_2D_ORBIT_B_ID, {
        position: [Math.cos(orbitRadB) * orbitDistB, Math.sin(orbitRadB) * orbitDistB * 0.7],
        rotation: -totalTime * 3.0,
        scale: [1.0, 1.0],
        zLayer: 3
      });

      // Move 2D Light following Satellite A
      galfus.realm2dSetLightTransform(REALM_2D, LIGHT_2D_POINT_ID, {
        position: [Math.cos(orbitRadA) * orbitDistA, Math.sin(orbitRadA) * orbitDistA],
        zLayer: 5
      });

      // 2. Animate Realm 3D Cube Rotation (Roll, Pitch, Yaw)
      const pitch = totalTime * 0.75;
      const yaw = totalTime * 1.1;
      const roll = totalTime * 0.45;
      const cubeQuat = eulerToQuat(pitch, yaw, roll);
      galfus.realm3dSetModelTransform(REALM_3D, MODEL_CUBE_ID, {
        position: [0.0, 0.2 + 0.15 * Math.sin(totalTime * 2.0), 0.0],
        rotation: cubeQuat,
        scale: [1.0, 1.0, 1.0]
      });

      // Animate 3D Point Light Orbit
      const lightOrbit = totalTime * 1.5;
      galfus.realm3dSetLightTransform(REALM_3D, LIGHT_3D_POINT_ID, {
        position: [
          Math.cos(lightOrbit) * 3.2,
          2.0 + Math.sin(lightOrbit * 2.0) * 0.8,
          Math.sin(lightOrbit) * 3.2
        ],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1]
      });
    }

    // 3. Multiverse Dispatch Frame
    frameId++;
    galfus.multiverseDispatch(frameId, dt);

    // 4. Poll and Handle Platform Window Events
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if ('window' in ev) {
        const win = ev.window;
        if ('closeRequested' in win) {
          console.log(`Window #${windowId} close requested.`);
          running = false;
          break;
        } else if ('resized' in win) {
          galfus.multiverseUpdateWindowSize(windowId, win.resized.width, win.resized.height);
        }
      } else if ('keyboard' in ev && 'input' in ev.keyboard) {
        const input = ev.keyboard.input;
        if (input.state === 'pressed') {
          const key = extractKey(input);

          if (key === 'escape' || key === 'q') {
            console.log('Exiting demo...');
            running = false;
            break;
          }

          if (key === ' ' || key === 'space') {
            paused = !paused;
            console.log(`Playback: ${paused ? 'PAUSED' : 'RESUMED'}`);
          }

          if (key === 'c') {
            colorTintIdx = (colorTintIdx + 1) % COLOR_TINTS.length;
            const [tintName, tintColor] = COLOR_TINTS[colorTintIdx]!;
            galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_RTT_ID, {
              surfaceType: 'opaque',
              textureSlots: [TARGET_2D_RTT],
              samplerIndex: 0,
              baseColor: tintColor,
              roughness: 0.25,
              metallic: 0.1
            });
            console.log(`Cube Tint: ${tintName}`);
          }

          if (key === 'm') {
            minimapBottom = !minimapBottom;
            galfus.multiverseSetInvocationViewport(
              INVOCATION_2D_MINIMAP,
              getMinimapViewport(minimapBottom)
            );
            console.log(`Minimap Corner: ${minimapBottom ? 'BOTTOM-RIGHT' : 'TOP-RIGHT'}`);
          }

          if (key === 'f') {
            filterIdx = (filterIdx + 1) % MINIMAP_FILTERS.length;
            const [filterName, filterList] = MINIMAP_FILTERS[filterIdx]!;
            galfus.multiverseSetInvocationFilters(INVOCATION_2D_MINIMAP, filterList);
            console.log(`Minimap Post-Process Filter: ${filterName}`);
          }
        }
      }
    }

    await new Promise((r) => setTimeout(r, 16));
  }

  console.log('==> Cleaning up resources and shutting down...');
  galfus.platformShutdown();
  console.log('✔ Platform shutdown cleanly. Demo MV2 finished.');
}
