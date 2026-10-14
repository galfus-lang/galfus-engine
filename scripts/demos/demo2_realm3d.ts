import { GalfusBun } from '../../sdk/bun/galfus.ts';
import type { Transform3DDesc } from '../../sdk/typescript/galfus.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const INVOCATION_MAIN = 100;

const CAMERA_ID = 1;
const GEOM_CUBE_ID = 1;
const GEOM_PLANE_ID = 2;
const MAT_CUBE_ID = 1;
const MAT_PLANE_ID = 2;
const MODEL_CUBE_ID = 1;
const MODEL_PLANE_ID = 2;
const LIGHT_DIR_ID = 1;
const LIGHT_POINT_ID = 2;
const LIGHT_SPOT_ID = 3;

function extractKey(input: { physicalKey: string; logicalKey: any }): string {
  if (typeof input.logicalKey === 'object' && input.logicalKey !== null) {
    if ('character' in input.logicalKey && typeof input.logicalKey.character === 'string') {
      return input.logicalKey.character.toLowerCase();
    }
    if ('named' in input.logicalKey && typeof input.logicalKey.named === 'string') {
      return input.logicalKey.named.toLowerCase();
    }
  }
  const phys = input.physicalKey.toLowerCase();
  if (phys.startsWith('key') && phys.length === 4) {
    return phys.slice(3);
  }
  if (phys.startsWith('digit') && phys.length === 6) {
    return phys.slice(5);
  }
  return phys;
}

/** Euler angle (pitch around X, yaw around Y, roll around Z in radians) to quaternion [x, y, z, w] */
function eulerToQuat(pitch: number, yaw: number, roll: number): [number, number, number, number] {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);

  return [
    sp * cy * cr - cp * sy * sr,
    cp * sy * cr + sp * cy * sr,
    cp * cy * sr - sp * sy * cr,
    cp * cy * cr + sp * sy * sr
  ];
}

/** Computes a look-at rotation quaternion pointing from eye to target */
function quatFromLookAt(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number] = [0, 1, 0]
): [number, number, number, number] {
  let fx = target[0] - eye[0];
  let fy = target[1] - eye[1];
  let fz = target[2] - eye[2];
  const fLen = Math.hypot(fx, fy, fz);
  if (fLen < 1e-6) return [0, 0, 0, 1];
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  let sx = fy * up[2] - fz * up[1];
  let sy = fz * up[0] - fx * up[2];
  let sz = fx * up[1] - fy * up[0];
  let sLen = Math.hypot(sx, sy, sz);
  if (sLen < 1e-6) {
    sx = fy * 1.0;
    sy = 0;
    sz = -fx * 1.0;
    sLen = Math.hypot(sx, sy, sz);
  }
  sx /= sLen;
  sy /= sLen;
  sz /= sLen;

  const ux = sy * fz - sz * fy;
  const uy = sz * fx - sx * fz;
  const uz = sx * fy - sy * fx;

  const m00 = sx,
    m10 = sy,
    m20 = sz;
  const m01 = ux,
    m11 = uy,
    m21 = uz;
  const m02 = -fx,
    m12 = -fy,
    m22 = -fz;

  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
}

export async function runDemo2(): Promise<void> {
  console.log(
    '=== Galfus Engine - Demo 2 (TypeScript / Bun): 3D Realm (Reverse-Z & Lighting) ===\n'
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
    title: 'Galfus Engine - Demo 2 (TS): 3D Realm (Reverse-Z & Shadows)',
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
  let camDistance = 5.5;
  let camAngle = 0.6;
  const camHeight = 2.8;

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

  console.log('==> Creating Materials (PBR Amber Cube #1, Slate Floor #2)...');
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CUBE_ID, {
    surfaceType: 'opaque',
    baseColor: [1.0, 0.55, 0.1, 1.0], // Vibrant Orange/Amber
    emissiveColor: [0.05, 0.02, 0.0, 1.0],
    metallic: 0.25,
    roughness: 0.35,
    reflectance: 0.6
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_PLANE_ID, {
    surfaceType: 'opaque',
    baseColor: [0.18, 0.22, 0.28, 1.0], // Slate Grey
    emissiveColor: [0.0, 0.0, 0.0, 1.0],
    metallic: 0.05,
    roughness: 0.85,
    reflectance: 0.3
  });
  console.log('✔ Materials created');

  console.log('==> Instantiating Models (Cube #1, Floor #2)...');
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_CUBE_ID,
    {
      geometryId: GEOM_CUBE_ID,
      materialId: MAT_CUBE_ID,
      castShadow: true,
      receiveShadow: true,
      active: true
    },
    {
      position: [0.0, 1.0, 0.0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  );

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
  console.log('✔ Models instantiated');

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
      innerAngle: 0.35, // ~20 degrees
      outerAngle: 0.65, // ~37 degrees
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
      castShadow: false
    },
    {
      position: [2.5, 2.0, 1.5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  );
  console.log('✔ Lights created (Sun & Spot cast shadows)');

  console.log('==> Configuring Environment (Atmosphere, Fog, Exposure)...');
  let fogModeIdx = 1;
  const fogModes: ('none' | 'linear' | 'exponential')[] = ['none', 'linear', 'exponential'];

  galfus.realm3dSetEnvironment(REALM_3D, {
    ambientColor: [0.06, 0.08, 0.12, 1.0],
    clearColor: [0.02, 0.03, 0.05, 1.0],
    fogColor: [0.04, 0.06, 0.1, 1.0],
    fogMode: fogModes[fogModeIdx] ?? 'linear',
    fogStart: 8.0,
    fogEnd: 40.0,
    fogDensity: 0.03,
    exposure: 1.0
  });
  console.log('✔ Environment configured');

  console.log('==> Declaring Multiverse Invocation (#100)...');
  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { unit: 'normalized', x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
    clearColor: [0.02, 0.03, 0.05, 1.0]
  });
  console.log('✔ Invocation created');

  console.log('\n================================================================');
  console.log(' controls:');
  console.log('   [Left / Right Arrow]  : Manual Orbit Camera Around Cube');
  console.log('   [Up / Down Arrow]     : Adjust Camera Distance (Zoom)');
  console.log('   [O]                   : Toggle Camera Auto-Orbit');
  console.log('   [F]                   : Cycle Distance Fog Mode (None / Linear / Exp)');
  console.log('   [Space]               : Toggle Cube Rotation Pause');
  console.log('   [R]                   : Reset Camera Position');
  console.log('   [Escape]              : Exit');
  console.log('================================================================\n');

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
            const mode = fogModes[fogModeIdx]!;
            galfus.realm3dSetEnvironment(REALM_3D, {
              ambientColor: [0.06, 0.08, 0.12, 1.0],
              clearColor: [0.02, 0.03, 0.05, 1.0],
              fogColor: [0.04, 0.06, 0.1, 1.0],
              fogMode: mode,
              fogStart: 8.0,
              fogEnd: 40.0,
              fogDensity: 0.03,
              exposure: 1.0
            });
            console.log(`[Input] Fog mode set to: ${mode.toUpperCase()}`);
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

    // 2. Animate Cube Transform
    if (rotating) {
      cubeRotY += dt * 1.5;
      cubeRotX += dt * 0.8;
      const cubeQuat = eulerToQuat(cubeRotX, cubeRotY, 0.0);
      galfus.realm3dSetModelTransform(REALM_3D, MODEL_CUBE_ID, {
        position: [0.0, 1.1 + Math.sin(totalTime * 2.0) * 0.15, 0.0],
        rotation: cubeQuat,
        scale: [1, 1, 1]
      });
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
    galfus.realm3dSetLightTransform(REALM_3D, LIGHT_POINT_ID, {
      position: [lightX, 2.5 + Math.sin(totalTime * 3.0) * 0.5, lightZ],
      rotation: [0, 0, 0, 1],
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
  console.log('✔ Platform shutdown cleanly. Demo 2 finished.');
}
