/**
 * Demo 3D-3 - 3D Point Light Omnidirectional Shadows (6 Cube Faces) & Real-time SSAO
 *
 * Demonstrates:
 * 1. Omni-directional Point Light with 6-face shadow map casting 360° real-time Reverse-Z shadows.
 * 2. Screen-Space Ambient Occlusion (SSAO) with bilateral edge-preserving depth blur.
 * 3. Atmospheric procedural skybox with dynamic Y-axis rotation.
 * 4. Interactive camera orbit & real-time keyboard toggles for SSAO and Point Light movement.
 */

import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { extractKey, quatFromLookAt } from './utils.ts';

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
const AO_TEXTURE_ID = 401;

function createOcclusionTexture(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1) - 0.5;
      const v = y / (size - 1) - 0.5;
      const radial = Math.min(Math.sqrt(u * u + v * v) * 1.8, 1.0);
      const value = Math.round((0.32 + radial * 0.68) * 255);
      const offset = (y * size + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

export async function runDemo3d3(): Promise<void> {
  console.log('=== Galfus Engine - Demo 3D-3: Point Shadows & SSAO ===');
  console.log('Controls:');
  console.log('  [O]      : Toggle camera auto-orbit');
  console.log('  [S]      : Toggle SSAO on/off');
  console.log('  [1] / [2]: Decrease / Increase SSAO intensity');
  console.log('  [3] / [4]: Decrease / Increase material occlusion texture strength');
  console.log('  [Space]  : Pause/Resume Point Light zigzag path');
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
    title: 'Galfus Realm 3D - Demo 3D-3: Point Shadows & SSAO',
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
  let materialOcclusionStrength = 0.7;
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

  const occlusionTexture = createOcclusionTexture(64);
  galfus.resourceCreateTexture(
    AO_TEXTURE_ID,
    {
      label: 'Demo 3D-3 Material Occlusion Texture',
      width: 64,
      height: 64,
      format: 'rgba8Unorm',
      usages: { copyDst: true, textureBinding: true }
    },
    occlusionTexture,
    occlusionTexture.byteLength
  );

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

  // Materials: ground and pillars use the same per-material occlusion texture.
  const applyMaterialOcclusion = () => {
    galfus.realm3dCreateMaterial(REALM_3D, MAT_GROUND, {
      baseColor: [0.65, 0.68, 0.7, 1.0],
      metallic: 0.05,
      roughness: 0.6,
      reflectance: 0.3,
      occlusionTextureId: AO_TEXTURE_ID,
      occlusionStrength: materialOcclusionStrength,
      surfaceType: 'opaque'
    });
    galfus.realm3dCreateMaterial(REALM_3D, MAT_PILLAR, {
      baseColor: [0.85, 0.45, 0.25, 1.0],
      metallic: 0.2,
      roughness: 0.4,
      reflectance: 0.4,
      occlusionTextureId: AO_TEXTURE_ID,
      occlusionStrength: materialOcclusionStrength,
      surfaceType: 'opaque'
    });
  };
  applyMaterialOcclusion();
  galfus.realm3dCreateMaterial(REALM_3D, MAT_ORB, {
    baseColor: [1.0, 0.95, 0.6, 1.0],
    emissiveColor: [3.0, 2.5, 1.2, 1.0],
    metallic: 0.8,
    roughness: 0.1,
    reflectance: 0.5,
    surfaceType: 'opaque'
  });

  // Geometries
  galfus.realm3dCreatePlane(REALM_3D, GEOM_GROUND, 30.0, 30.0);
  galfus.realm3dCreateCube(REALM_3D, GEOM_PILLAR, 1.5);
  galfus.realm3dCreateCube(REALM_3D, GEOM_ORB, 0.5);

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

  // Setup Animation PathFollow for Light Orb & Point Light (Zigzag Slalom around Pillars)
  console.log('==> Configuring Looping SVG-like PathFollow for Light Orb & Point Light...');

  const NUM_WAYPOINTS = 16;
  const pathCommands: any[] = [];
  for (let k = 0; k < NUM_WAYPOINTS; k++) {
    const angle = (k * 2.0 * Math.PI) / NUM_WAYPOINTS;
    let r = 5.3;
    if (k % 2 === 0) {
      const pillarIdx = (k / 2) % NUM_PILLARS;
      r = pillarIdx % 2 === 0 ? 3.0 : 7.6;
    }
    const x = Number((Math.cos(angle) * r).toFixed(3));
    const z = Number((Math.sin(angle) * r).toFixed(3));
    const y = Number((2.1 + 0.8 * Math.sin(angle * 2.0)).toFixed(3));
    if (k === 0) {
      pathCommands.push({ type: 'moveTo', to: [x, y, z] });
    } else {
      pathCommands.push({ type: 'smoothTo', to: [x, y, z] });
    }
  }
  pathCommands.push({ type: 'close' });

  const PATH_ORB = 1;
  const PATH_LIGHT = 2;
  const PATH_DURATION = 14.0;

  galfus.animationCreatePathFollow(PATH_ORB, pathCommands, {
    duration: PATH_DURATION,
    delay: 0.0,
    easing: 'linear',
    loopMode: 'loop'
  });
  galfus.animationBindPathFollowTarget(PATH_ORB, {
    kind: 'modelTransform3D',
    realmId: REALM_3D,
    modelId: MODEL_ORB
  });

  galfus.animationCreatePathFollow(PATH_LIGHT, pathCommands, {
    duration: PATH_DURATION,
    delay: 0.0,
    easing: 'linear',
    loopMode: 'loop'
  });
  galfus.animationBindPathFollowTarget(PATH_LIGHT, {
    kind: 'light3DTransform',
    realmId: REALM_3D,
    lightId: LIGHT_POINT
  });

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
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
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
          if (key === 'escape') {
            running = false;
            break;
          } else if (key === 's') {
            ssaoEnabled = !ssaoEnabled;
            console.log(`[Demo 3D-3] SSAO toggled: ${ssaoEnabled ? 'ON' : 'OFF'}`);
            applyEnvironment(totalTime * 0.1);
          } else if (key === '1' || key === '-') {
            ssaoIntensity = Math.max(0.1, Number((ssaoIntensity - 0.1).toFixed(2)));
            console.log(`[Demo 3D-3] SSAO Intensity: ${ssaoIntensity}`);
            applyEnvironment(totalTime * 0.1);
          } else if (key === '2' || key === '+' || key === '=') {
            ssaoIntensity = Math.min(2.5, Number((ssaoIntensity + 0.1).toFixed(2)));
            console.log(`[Demo 3D-3] SSAO Intensity: ${ssaoIntensity}`);
            applyEnvironment(totalTime * 0.1);
          } else if (key === '3') {
            materialOcclusionStrength = Math.max(
              0,
              Number((materialOcclusionStrength - 0.1).toFixed(2))
            );
            console.log(`[Demo 3D-3] Material Occlusion Strength: ${materialOcclusionStrength}`);
            applyMaterialOcclusion();
          } else if (key === '4') {
            materialOcclusionStrength = Math.min(
              1,
              Number((materialOcclusionStrength + 0.1).toFixed(2))
            );
            console.log(`[Demo 3D-3] Material Occlusion Strength: ${materialOcclusionStrength}`);
            applyMaterialOcclusion();
          } else if (key === ' ' || key === 'space') {
            lightOrbitPaused = !lightOrbitPaused;
            console.log(`[Demo 3D-3] Light zigzag path: ${lightOrbitPaused ? 'PAUSED' : 'ACTIVE'}`);
          } else if (key === 'o') {
            autoOrbit = !autoOrbit;
            console.log(`[Demo 3D-3] Auto-orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
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
      galfus.animationStep(dt);
    }

    applyEnvironment(totalTime * 0.05);

    galfus.multiverseDispatch(frameCount, dt);
    await Bun.sleep(1);
  }

  galfus.platformShutdown();
  console.log('Demo 3D-3 completed cleanly.');
}
