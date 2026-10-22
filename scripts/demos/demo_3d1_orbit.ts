import { GalfusBun } from '../../sdk/bun/galfus.ts';
import type { Transform3DDesc } from '../../sdk/typescript/galfus.ts';
import { extractKey, eulerToQuat, quatFromLookAt } from './utils.ts';
import {
  FRESNEL_SURFACE_SNIPPET,
  WORLD_WAVE_SURFACE_SNIPPET,
  HOLOGRAM_SURFACE_SNIPPET
} from './shaders_3d.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const INVOCATION_MAIN = 100;

const CAMERA_ID = 1;
const GEOM_CUBE_ID = 1;
const GEOM_PLANE_ID = 2;

const MAT_CUBE_FRESNEL_ID = 1;
const MAT_PLANE_ID = 2;
const MAT_CUBE_WAVE_ID = 3;
const MAT_CUBE_HOLO_ID = 4;

const MODEL_CUBE_FRESNEL_ID = 1;
const MODEL_PLANE_ID = 2;
const MODEL_CUBE_WAVE_ID = 3;
const MODEL_CUBE_HOLO_ID = 4;

const LIGHT_DIR_ID = 1;
const LIGHT_POINT_ID = 2;
const LIGHT_SPOT_ID = 3;

export async function runDemo3d1(): Promise<void> {
  console.log(
    '=== Galfus Engine - Demo 3D-1 (TypeScript / Bun): 3D Realm (Reverse-Z & Lighting) ===\n'
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
    title: 'Galfus Engine - Demo 3D-1 (TS): 3D Realm (Reverse-Z & Shadows)',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created successfully (Logical ID: ${windowId})`);

  console.log('==> Attaching window to Multiverse GPU presentation...');
  galfus.multiverseAttachWindow(windowId);
  console.log('✔ Multiverse Context attached to window');

  console.log('==> Declaring Window Target (#1)...');
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });
  console.log('✔ Window Target created');

  console.log(`==> Creating Realm3D (#${REALM_3D})...`);
  galfus.realm3dCreate(REALM_3D);
  console.log('✔ Realm3D registered');

  console.log('==> Setting up 3D Camera (#1) with Reverse-Z projection...');
  let camDistance = 7.0;
  let camAngle = 0.6;
  const camHeight = 3.2;

  const camPos: [number, number, number] = [
    Math.sin(camAngle) * camDistance,
    camHeight,
    Math.cos(camAngle) * camDistance
  ];

  // Camera looking directly at the center of the cube
  const camRot = quatFromLookAt(camPos, [0.0, 1.0, 0.0]);

  galfus.realm3dCreateCamera(
    REALM_3D,
    CAMERA_ID,
    {
      kind: 'perspective',
      fovY: 60.0,
      near: 0.1,
      far: 1000.0,
      cameraSlot: 1
    },
    {
      position: camPos,
      rotation: camRot,
      scale: [1, 1, 1]
    }
  );
  console.log('✔ Camera3D created');

  console.log('==> Creating Geometries (Cube #1, Plane #2)...');
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_CUBE_ID, {
    primitive: 'cube',
    size: 1.6
  });
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_PLANE_ID, {
    primitive: 'plane',
    size: 20.0
  });
  console.log('✔ Geometries created');

  console.log(
    '==> Creating Materials with Surface Shader Effects (Fresnel #1, Slate #2, Wave #3, Hologram #4)...'
  );
  // Material 1: Fresnel Rim Glow Pulse
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_FRESNEL_ID, {
    surfaceType: 'opaque',
    baseColor: [1.0, 0.45, 0.1, 1.0], // Vibrant Amber
    emissiveColor: [0.04, 0.02, 0.0, 1.0],
    metallic: 0.3,
    roughness: 0.25,
    reflectance: 0.6,
    shaderEffect: FRESNEL_SURFACE_SNIPPET,
    customParams: [
      [0.0, 0.9, 1.0, 1.0], // v0: Electric Cyan Rim Glow
      [3.0, 4.0, 0.0, 0.0], // v1: x = rim_power (3.0), y = pulse_speed (4.0)
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  });

  // Material 2: Slate Grey Floor (Standard Passthrough Surface)
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PLANE_ID, {
    surfaceType: 'opaque',
    baseColor: [0.18, 0.22, 0.28, 1.0], // Slate Grey
    emissiveColor: [0.0, 0.0, 0.0, 1.0],
    metallic: 0.05,
    roughness: 0.85,
    reflectance: 0.3
  });

  // Material 3: World-Position Wave Gradient
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_WAVE_ID, {
    surfaceType: 'opaque',
    baseColor: [0.1, 0.85, 0.4, 1.0],
    emissiveColor: [0.0, 0.0, 0.0, 1.0],
    metallic: 0.2,
    roughness: 0.3,
    reflectance: 0.5,
    shaderEffect: WORLD_WAVE_SURFACE_SNIPPET,
    customParams: [
      [0.1, 0.85, 0.4, 1.0], // v0: Emerald Green
      [3.5, 4.0, 0.0, 0.0], // v1: x = wave_speed (3.5), y = wave_frequency (4.0)
      [0.9, 0.15, 0.6, 1.0], // v2: Hot Magenta
      [0, 0, 0, 0]
    ]
  });

  // Material 4: Cyber Hologram Scanlines with Alpha Blending
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_HOLO_ID, {
    surfaceType: 'transparent',
    baseColor: [0.2, 0.6, 1.0, 0.8],
    emissiveColor: [0.1, 0.3, 0.8, 1.0],
    metallic: 0.8,
    roughness: 0.15,
    reflectance: 0.7,
    shaderEffect: HOLOGRAM_SURFACE_SNIPPET,
    customParams: [
      [0.2, 0.7, 1.0, 1.0], // v0: Neon Cyber Blue
      [22.0, 7.0, 0.0, 0.0], // v1: x = scanline_freq (22.0), y = scan_speed (7.0)
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  });
  console.log('✔ Materials created (with custom surface effects)');

  console.log('==> Instantiating Models (3 Custom Shader Cubes + Floor)...');
  const createCube = (
    id: number,
    matId: number,
    outlineCol: [number, number, number, number],
    pos: [number, number, number]
  ) => {
    galfus.realm3dCreateModel(
      REALM_3D,
      id,
      {
        geometryId: GEOM_CUBE_ID,
        materialId: matId,
        castShadow: true,
        receiveShadow: true,
        castOutline: true,
        outlineColor: outlineCol,
        active: true
      },
      { position: pos, rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
    );
  };

  createCube(MODEL_CUBE_FRESNEL_ID, MAT_CUBE_FRESNEL_ID, [0.0, 1.0, 0.85, 1.0], [0.0, 1.0, 0.0]);
  createCube(MODEL_CUBE_WAVE_ID, MAT_CUBE_WAVE_ID, [0.2, 1.0, 0.4, 1.0], [-2.8, 1.0, 0.0]);
  createCube(MODEL_CUBE_HOLO_ID, MAT_CUBE_HOLO_ID, [0.3, 0.6, 1.0, 1.0], [2.8, 1.0, 0.0]);

  // Setup Animation Transitions for the 3 Cubes via Transition API
  console.log('==> Configuring Animation Transitions for Cubes...');
  const qFresnelTarget = eulerToQuat(0.6, 3.14, 0.0);
  galfus.animationCreateTransition(
    1,
    { type: 'transform3D', value: [0.0, 0.95, 0.0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 2.2, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(1, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_CUBE_FRESNEL_ID
  });
  galfus.animationTransitionTo(1, {
    type: 'transform3D',
    value: [
      0.0,
      1.35,
      0.0,
      qFresnelTarget[0],
      qFresnelTarget[1],
      qFresnelTarget[2],
      qFresnelTarget[3],
      1,
      1,
      1
    ]
  });

  const qWaveTarget = eulerToQuat(0.5, -2.8, 0.3);
  galfus.animationCreateTransition(
    2,
    { type: 'transform3D', value: [-2.8, 0.95, 0.0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 2.5, delay: 0.2, easing: 'easeInOutCubic', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(2, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_CUBE_WAVE_ID
  });
  galfus.animationTransitionTo(2, {
    type: 'transform3D',
    value: [
      -2.8,
      1.35,
      0.0,
      qWaveTarget[0],
      qWaveTarget[1],
      qWaveTarget[2],
      qWaveTarget[3],
      1,
      1,
      1
    ]
  });

  const qHoloTarget = eulerToQuat(-0.8, 2.6, 0.0);
  galfus.animationCreateTransition(
    3,
    { type: 'transform3D', value: [2.8, 0.95, 0.0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 2.0, delay: 0.4, easing: 'easeInOutQuad', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(3, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_CUBE_HOLO_ID
  });
  galfus.animationTransitionTo(3, {
    type: 'transform3D',
    value: [2.8, 1.35, 0.0, qHoloTarget[0], qHoloTarget[1], qHoloTarget[2], qHoloTarget[3], 1, 1, 1]
  });

  // Floor Plane
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PLANE_ID,
    {
      geometryId: GEOM_PLANE_ID,
      materialId: MAT_PLANE_ID,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    {
      position: [0.0, 0.0, 0.0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  );
  console.log('✔ Models instantiated (3 surface effect cubes + floor)');

  console.log('==> Setting up Lights (Directional Sun #1, Point Light #2, Spot Light #3)...');
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_DIR_ID,
    {
      kind: 'directional',
      color: [1.0, 0.96, 0.88],
      intensity: 1.4,
      castShadow: true
    },
    {
      position: [8, 14, 8],
      rotation: quatFromLookAt([8, 14, 8], [0, 0, 0]),
      scale: [1, 1, 1]
    }
  );

  // Spot Light casting focused dynamic shadow
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_SPOT_ID,
    {
      kind: 'spot',
      color: [0.3, 0.8, 1.0], // Ice Blue Spotlight
      intensity: 4.5,
      range: 30.0,
      spotInnerAngleRad: 0.35, // ~20 degrees
      spotOuterAngleRad: 0.65, // ~37 degrees
      castShadow: true
    },
    {
      position: [-6, 9, -5],
      rotation: quatFromLookAt([-6, 9, -5], [0, 1.0, 0]),
      scale: [1, 1, 1]
    }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_POINT_ID,
    {
      kind: 'point',
      color: [1.0, 0.45, 0.2], // Warm accent
      intensity: 2.0,
      range: 12.0,
      castShadow: true
    },
    {
      position: [2.5, 2.0, 1.5],
      rotation: quatFromLookAt([2.5, 2.0, 1.5], [0, 1.0, 0]),
      scale: [1, 1, 1]
    }
  );
  console.log('✔ Lights created (All 3 lights cast dynamic shadows)');

  console.log('==> Configuring Environment (Atmosphere, Fog, Exposure, Skybox)...');
  let fogModeIdx = 1;
  const fogModes: ('none' | 'linear' | 'exponential')[] = ['none', 'linear', 'exponential'];
  let skyboxModeIdx = 1;
  const skyboxModes: ('none' | 'procedural')[] = ['none', 'procedural'];

  let filterIdx = 0;
  const availableFilters: (string | null)[] = [
    null,
    'vignette',
    'chromaticAberration',
    'filmGrain',
    'tonemapAces',
    'grayscale',
    'sepia',
    'edgeOutline',
    'posterize',
    'blur',
    'sharpen'
  ];

  let outlineEnabled = true;

  const applyEnvironment = () => {
    galfus.realm3dSetEnvironment(REALM_3D, {
      ambientColor: [0.06, 0.08, 0.12, 1.0],
      clearColor: [0.02, 0.03, 0.05, 1.0],
      fogColor: [0.04, 0.06, 0.1, 1.0],
      fogMode: fogModes[fogModeIdx] ?? 'linear',
      fogStart: 8.0,
      fogEnd: 40.0,
      fogDensity: 0.03,
      exposure: 1.0,
      skybox: {
        mode: skyboxModes[skyboxModeIdx] ?? 'procedural',
        skyColor: [0.15, 0.35, 0.75, 1.0],
        horizonColor: [0.65, 0.75, 0.9, 1.0],
        groundColor: [0.08, 0.08, 0.1, 1.0],
        sunDirection: [8, 14, 8, 0.0],
        sunColor: [1.0, 0.95, 0.85, 2.0],
        intensity: 1.0,
        sunSize: 0.03
      },
      outline: {
        enabled: outlineEnabled,
        width: 1.5,
        threshold: 0.2,
        strength: 1.0
      }
    });
  };

  applyEnvironment();
  console.log('✔ Environment configured with Procedural Skybox');

  console.log('==> Declaring Multiverse Invocation (#100)...');
  const updateInvocationFilters = () => {
    const current = availableFilters[filterIdx];
    const filters = current ? [current as any] : [];
    galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
      realmId: REALM_3D,
      targetId: TARGET_WINDOW,
      cameraSlot: 1,
      viewport: { width: { vw: 100 }, height: { vh: 100 } },
      clearColor: [0.02, 0.03, 0.05, 1.0],
      filters
    });
  };

  updateInvocationFilters();
  console.log('✔ Invocation created');

  console.log(`================================================================
 controls:
   [Left / Right Arrow]  : Manual Orbit Camera Around Cube
   [Up / Down Arrow]     : Adjust Camera Distance (Zoom)
   [O]                   : Toggle Camera Auto-Orbit
   [F]                   : Cycle Distance Fog Mode (None / Linear / Exp)
   [K]                   : Toggle Procedural Skybox (Procedural / None)
   [L]                   : Toggle Silhouette Outline (On / Off)
   [P]                   : Cycle Invocation Post-Processing Filters
   [Space]               : Toggle Cube Rotation Pause
   [R]                   : Reset Camera Position
   [Escape]              : Exit
================================================================\n`);

  let running = true;
  let frameCount = 0;
  let totalTime = 0;
  let cubeRotY = 0.0;
  let cubeRotX = 0.0;
  let rotating = true;
  let autoOrbit = true;
  let lastTime = performance.now();

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;
    totalTime += dt;
    frameCount++;

    // 1. Process Window Platform Events
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          console.log(`Window #${windowId} close requested.`);
          running = false;
          break;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        if (ev.state === 'pressed') {
          const key = extractKey(ev);

          if (key === 'escape') {
            console.log('Escape pressed. Exiting demo.');
            running = false;
            break;
          }

          if (key === ' ' || key === 'space') {
            rotating = !rotating;
            console.log(`[Input] Cube rotation ${rotating ? 'RESUMED' : 'PAUSED'}`);
          }

          if (key === 'o') {
            autoOrbit = !autoOrbit;
            console.log(`[Input] Camera auto-orbit ${autoOrbit ? 'ENABLED' : 'DISABLED'}`);
          }

          if (key === 'f') {
            fogModeIdx = (fogModeIdx + 1) % fogModes.length;
            applyEnvironment();
            console.log(`[Input] Fog mode set to: ${fogModes[fogModeIdx]!.toUpperCase()}`);
          }

          if (key === 'k') {
            skyboxModeIdx = (skyboxModeIdx + 1) % skyboxModes.length;
            applyEnvironment();
            console.log(`[Input] Skybox mode set to: ${skyboxModes[skyboxModeIdx]!.toUpperCase()}`);
          }

          if (key === 'l') {
            outlineEnabled = !outlineEnabled;
            applyEnvironment();
            console.log(`[Input] Silhouette Outline ${outlineEnabled ? 'ENABLED' : 'DISABLED'}`);
          }

          if (key === 'p') {
            filterIdx = (filterIdx + 1) % availableFilters.length;
            updateInvocationFilters();
            console.log(
              `[Input] Invocation Filter: ${(availableFilters[filterIdx] ?? 'NONE').toUpperCase()}`
            );
          }

          if (key === 'arrowleft') {
            camAngle -= 0.15;
          }

          if (key === 'arrowright') {
            camAngle += 0.15;
          }

          if (key === 'arrowup') {
            camDistance = Math.max(2.0, camDistance - 0.5);
          }

          if (key === 'arrowdown') {
            camDistance = Math.min(15.0, camDistance + 0.5);
          }

          if (key === 'r') {
            camAngle = 0.6;
            camDistance = 5.5;
            autoOrbit = true;
            console.log('[Input] Camera reset to default');
          }
        }
      }
    }

    if (!running) break;

    // 2. Advance Animations via Transition API
    if (rotating) {
      galfus.animationStep(dt);
    }

    // 3. Update Orbit Camera Transform
    if (autoOrbit) {
      camAngle += dt * 0.4;
    }
    const curCamPos: [number, number, number] = [
      Math.sin(camAngle) * camDistance,
      camHeight,
      Math.cos(camAngle) * camDistance
    ];
    const curCamRot = quatFromLookAt(curCamPos, [0.0, 1.0, 0.0]);

    galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, {
      position: curCamPos,
      rotation: curCamRot,
      scale: [1, 1, 1]
    });

    // 4. Animate Point Light in circular orbit
    const lightOrbitRadius = 3.0;
    const lightX = Math.cos(totalTime * 1.8) * lightOrbitRadius;
    const lightZ = Math.sin(totalTime * 1.8) * lightOrbitRadius;
    const pointPos: [number, number, number] = [
      lightX,
      2.5 + Math.sin(totalTime * 3.0) * 0.5,
      lightZ
    ];
    galfus.realm3dSetLightTransform(REALM_3D, LIGHT_POINT_ID, {
      position: pointPos,
      rotation: quatFromLookAt(pointPos, [0.0, 1.0, 0.0]),
      scale: [1, 1, 1]
    });

    // Animate Spot Light swaying smoothly and casting dynamic moving shadows
    const spotX = Math.sin(totalTime * 0.6) * 5.0 - 3.5;
    const spotZ = Math.cos(totalTime * 0.6) * 5.0 - 3.5;
    const spotPos: [number, number, number] = [spotX, 8.5, spotZ];
    galfus.realm3dSetLightTransform(REALM_3D, LIGHT_SPOT_ID, {
      position: spotPos,
      rotation: quatFromLookAt(spotPos, [0.0, 1.0, 0.0]),
      scale: [1, 1, 1]
    });

    // 5. Dispatch Multiverse Frame
    galfus.multiverseDispatch(frameCount, dt);

    // Sleep briefly to yield CPU
    await Bun.sleep(1);
  }

  console.log('==> Cleaning up...');
  galfus.platformShutdown();
  console.log('✔ Platform shutdown cleanly. Demo 3D-1 finished.');
}
