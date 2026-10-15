/**
 * Demo 4 - 3D Point Light Omnidirectional Shadows (6 Cube Faces) & Real-time SSAO
 *
 * Demonstrates:
 * 1. Omni-directional Point Light with 6-face shadow map casting 360° real-time Reverse-Z shadows.
 * 2. Screen-Space Ambient Occlusion (SSAO) with bilateral edge-preserving depth blur.
 * 3. Atmospheric procedural skybox with dynamic Y-axis rotation.
 * 4. Interactive camera orbit & real-time keyboard toggles for SSAO and Point Light movement.
 */

import { GalfusBun } from '../../sdk/bun/galfus.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const INVOCATION_MAIN = 100;

const CAMERA_ID = 1;
const MAT_GROUND = 101;
const MAT_PILLAR = 102;
const MAT_ORB = 103;

const GEOM_GROUND = 201;
const GEOM_PILLAR = 202;
const GEOM_ORB = 203;

const LIGHT_POINT = 301;
const LIGHT_SUN = 302;

function extractKey(input: any): string {
  if (input.logicalKey) {
    if (typeof input.logicalKey === 'string') {
      return input.logicalKey.toLowerCase();
    }
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

function quatFromLookAt(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number] = [0.0, 1.0, 0.0]
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

export async function runDemo4(): Promise<void> {
  console.log('=== Galfus Engine - Demo 4: Point Shadows & SSAO ===');
  console.log('Controls:');
  console.log('  [O]      : Toggle camera auto-orbit');
  console.log('  [S]      : Toggle SSAO on/off');
  console.log('  [1] / [2]: Decrease / Increase SSAO intensity');
  console.log('  [Space]  : Pause/Resume Point Light orbit');
  console.log('  [Escape] : Exit\n');

  const galfus = new GalfusBun();
  try {
    galfus.platformInit();
  } catch (err) {
    console.error('Failed to initialize platform:', err);
    process.exit(1);
  }

  const windowId = 1;
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Realm 3D - Point Shadows & SSAO',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });

  galfus.multiverseAttachWindow(windowId);
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });

  galfus.realm3dCreate(REALM_3D);

  let ssaoEnabled = true;
  let ssaoIntensity = 0.65;
  let ssaoRadius = 0.45;
  let lightOrbitPaused = false;
  let autoOrbit = true;

  const applyEnvironment = (rotation = 0.0) => {
    galfus.realm3dSetEnvironment(REALM_3D, {
      ambientColor: [0.08, 0.08, 0.1, 1.0],
      clearColor: [0.01, 0.01, 0.02, 1.0],
      exposure: 1.0,
      skybox: {
        mode: 'procedural',
        skyColor: [0.2, 0.35, 0.65, 1.0],
        horizonColor: [0.55, 0.65, 0.75, 1.0],
        groundColor: [0.05, 0.05, 0.08, 1.0],
        sunDirection: [0.6, 0.8, 0.3, 0.0],
        sunColor: [1.0, 0.95, 0.8, 2.0],
        intensity: 1.0,
        sunSize: 0.03,
        rotation
      },
      outline: {
        enabled: true,
        width: 1.2,
        threshold: 0.2,
        strength: 0.8
      },
      ssao: {
        enabled: ssaoEnabled,
        radius: ssaoRadius,
        bias: 0.025,
        power: 1.0,
        intensity: ssaoIntensity,
        blurRadius: 2
      }
    });
  };
  applyEnvironment();

  // Camera setup
  let camDistance = 14.0;
  let camAngle = 0.7;
  const camHeight = 6.0;

  const curCamPos: [number, number, number] = [
    Math.sin(camAngle) * camDistance,
    camHeight,
    Math.cos(camAngle) * camDistance
  ];
  const curCamRot = quatFromLookAt(curCamPos, [0.0, 1.5, 0.0]);

  galfus.realm3dCreateCamera(
    REALM_3D,
    CAMERA_ID,
    { kind: 'perspective', fovY: 55.0, near: 0.1, far: 500.0, cameraSlot: 1 },
    { position: curCamPos, rotation: curCamRot, scale: [1, 1, 1] }
  );

  // Materials
  galfus.realm3dCreateMaterial(REALM_3D, MAT_GROUND, {
    baseColor: [0.65, 0.68, 0.7, 1.0],
    metallic: 0.05,
    roughness: 0.6,
    reflectance: 0.3,
    surfaceType: 'opaque'
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PILLAR, {
    baseColor: [0.85, 0.45, 0.25, 1.0],
    metallic: 0.2,
    roughness: 0.4,
    reflectance: 0.4,
    surfaceType: 'opaque'
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_ORB, {
    baseColor: [1.0, 0.95, 0.6, 1.0],
    emissiveColor: [3.0, 2.5, 1.2, 1.0],
    metallic: 0.8,
    roughness: 0.1,
    reflectance: 0.5,
    surfaceType: 'opaque'
  });

  // Geometries
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_GROUND, { primitive: 'plane', size: 30.0 });
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_PILLAR, { primitive: 'cube', size: 1.5 });
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_ORB, { primitive: 'cube', size: 0.5 });

  // Ground Model
  galfus.realm3dCreateModel(
    REALM_3D,
    1,
    {
      geometryId: GEOM_GROUND,
      materialId: MAT_GROUND,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    { position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1] }
  );

  // Pillars in a circle casting dramatic omnidirectional shadows
  const NUM_PILLARS = 8;
  const PILLAR_RADIUS = 5.5;
  for (let i = 0; i < NUM_PILLARS; i++) {
    const angle = (i * 2.0 * Math.PI) / NUM_PILLARS;
    const px = Math.cos(angle) * PILLAR_RADIUS;
    const pz = Math.sin(angle) * PILLAR_RADIUS;
    const modelId = 10 + i;
    galfus.realm3dCreateModel(
      REALM_3D,
      modelId,
      {
        geometryId: GEOM_PILLAR,
        materialId: MAT_PILLAR,
        castShadow: true,
        receiveShadow: true,
        castOutline: true,
        outlineColor: [0.9, 0.6, 0.3, 1.0],
        active: true
      },
      { position: [px, 1.5, pz], scale: [1, 2.0, 1], rotation: [0, 0, 0, 1] }
    );
  }

  // Visual orb for point light
  const MODEL_ORB = 99;
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_ORB,
    {
      geometryId: GEOM_ORB,
      materialId: MAT_ORB,
      castShadow: false,
      receiveShadow: false,
      castOutline: true,
      active: true
    },
    { position: [0, 2.5, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1] }
  );

  // Omnidirectional Point Light with 6-face shadow map
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_POINT,
    {
      kind: 'point',
      color: [1.0, 0.85, 0.5],
      intensity: 3.5,
      range: 20.0,
      castShadow: true
    },
    { position: [0, 2.5, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1] }
  );

  // Secondary ambient directional fill
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_SUN,
    {
      kind: 'directional',
      color: [0.35, 0.45, 0.6],
      intensity: 0.5,
      castShadow: false
    },
    { position: [0, 20, 0], scale: [1, 1, 1], rotation: [0.4, 0.3, 0.1, 0.86] }
  );

  // Multiverse Invocation
  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { unit: 'normalized', x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
    clearColor: [0.01, 0.01, 0.02, 1.0]
  });

  // Event & Animation loop
  let running = true;
  let frameCount = 0;
  let totalTime = 0;
  let lastTime = performance.now();

  console.log('✔ Scene and Point Light initialized. Starting render loop...');

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;
    totalTime += dt;
    frameCount++;

    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if ('window' in ev) {
        const win = ev.window;
        if ('closeRequested' in win) {
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
            running = false;
            break;
          } else if (key === 's') {
            ssaoEnabled = !ssaoEnabled;
            console.log(`[Demo 4] SSAO toggled: ${ssaoEnabled ? 'ON' : 'OFF'}`);
            applyEnvironment(totalTime * 0.1);
          } else if (key === '1' || key === '-') {
            ssaoIntensity = Math.max(0.1, Number((ssaoIntensity - 0.1).toFixed(2)));
            console.log(`[Demo 4] SSAO Intensity: ${ssaoIntensity}`);
            applyEnvironment(totalTime * 0.1);
          } else if (key === '2' || key === '+' || key === '=') {
            ssaoIntensity = Math.min(2.5, Number((ssaoIntensity + 0.1).toFixed(2)));
            console.log(`[Demo 4] SSAO Intensity: ${ssaoIntensity}`);
            applyEnvironment(totalTime * 0.1);
          } else if (key === ' ' || key === 'space') {
            lightOrbitPaused = !lightOrbitPaused;
            console.log(`[Demo 4] Light orbit: ${lightOrbitPaused ? 'PAUSED' : 'ACTIVE'}`);
          } else if (key === 'o') {
            autoOrbit = !autoOrbit;
            console.log(`[Demo 4] Auto-orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
          }
        }
      }
    }

    if (autoOrbit) {
      camAngle += dt * 0.3;
    }
    const cPos: [number, number, number] = [
      Math.sin(camAngle) * camDistance,
      camHeight,
      Math.cos(camAngle) * camDistance
    ];
    galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, {
      position: cPos,
      rotation: quatFromLookAt(cPos, [0.0, 1.5, 0.0]),
      scale: [1, 1, 1]
    });

    if (!lightOrbitPaused) {
      const lx = Math.cos(totalTime * 1.5) * 3.5;
      const lz = Math.sin(totalTime * 1.5) * 3.5;
      const ly = 2.0 + Math.sin(totalTime * 2.5) * 0.6;
      const lightPos: [number, number, number] = [lx, ly, lz];

      galfus.realm3dSetLightTransform(REALM_3D, LIGHT_POINT, {
        position: lightPos,
        scale: [1, 1, 1],
        rotation: [0, 0, 0, 1]
      });
      galfus.realm3dSetModelTransform(REALM_3D, MODEL_ORB, {
        position: lightPos,
        scale: [1, 1, 1],
        rotation: [0, 0, 0, 1]
      });
    }

    applyEnvironment(totalTime * 0.05);

    galfus.multiverseDispatch(frameCount, dt);
    await Bun.sleep(1);
  }

  galfus.platformShutdown();
  console.log('Demo 4 completed cleanly.');
}
