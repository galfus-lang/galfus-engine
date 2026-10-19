import { GalfusBun } from '../../sdk/bun/galfus.ts';
import type { InstanceData3DDesc, Transform3DDesc } from '../../sdk/typescript/galfus.ts';
import { extractKey, eulerToQuat, quatFromLookAt } from './utils.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const INVOCATION_MAIN = 100;

const CAMERA_ID = 1;
const GEOM_GROUND_ID = 1;
const GEOM_CRYSTAL_ID = 2;
const GEOM_PILLAR_ID = 3;

const MAT_GROUND_ID = 1;
const MAT_CRYSTAL_ID = 2;
const MAT_PILLAR_ID = 3;

const MODEL_GROUND_ID = 1;
const MODEL_PILLAR_ID = 2;
const INSTANCED_CRYSTAL_ID = 10;

const LIGHT_DIR_ID = 1;
const LIGHT_POINT_ID = 2;

const INSTANCE_GRID_SIZE = 60; // 60 x 60 = 3,600 instances
const INSTANCE_SPACING = 0.8;

// Custom WGSL surface effect accessing in.instance_custom and in.instance_color
const INSTANCE_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
    var out: SurfaceOutput;
    
    // in.instance_custom.x: wind sway amplitude
    // in.instance_custom.y: wind frequency
    // in.instance_custom.z: crystal glow pulse speed
    // in.instance_custom.w: color phase
    let height_grad = clamp(in.uv.y, 0.0, 1.0);
    
    // Gradient from dark root to bright bioluminescent tip
    let tip_color = in.instance_color.rgb * 1.5;
    let base_color = in.instance_color.rgb * 0.3;
    let blended_color = mix(base_color, tip_color, height_grad);
    
    // Wind wave traveling across the field
    let wave = sin(in.time * in.instance_custom.y * 2.5 + in.world_pos.x * 0.25 + in.world_pos.z * 0.25);
    let wave_factor = clamp(wave * 0.5 + 0.5, 0.0, 1.0);
    
    // Pulsing tip emission with traveling wave modulation
    let pulse = sin(in.time * in.instance_custom.z + in.instance_custom.w) * 0.5 + 0.5;
    let emissive_glow = in.instance_emissive.rgb * (0.8 + wave_factor * 1.2 + pulse * 0.5) * height_grad;
    
    out.albedo = vec4<f32>(blended_color, in.instance_color.a);
    out.emissive = emissive_glow;
    out.roughness = in.roughness;
    out.metallic = in.metallic;
    out.normal = in.world_normal;
    return out;
}
`;

export async function runDemo3d8(): Promise<void> {
  console.log('=== Galfus Engine - Demo 3D-8: GPU Mesh Instancing & Wind Deformations ===\n');

  const galfus = new GalfusBun();

  console.log('==> Initializing Platform Context...');
  try {
    galfus.platformInit();
  } catch (err) {
    console.error('Failed to initialize platform context:', err);
    process.exit(1);
  }

  const windowId = 1;
  const width = 1280;
  const height = 720;

  console.log('==> Creating window...');
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 3D-8: GPU Mesh Instancing (Thousands of Instances, Wind & Glow)',
    size: [width, height],
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

  console.log('==> Registering Autonomous 3D Realm (ID: 10)...');
  galfus.realm3dCreate(REALM_3D);
  console.log(`✔ Realm3D #${REALM_3D} registered`);

  console.log('==> Setting up Environment & HDR Bloom...');
  galfus.realm3dSetEnvironment(REALM_3D, {
    clearColor: [0.02, 0.03, 0.05, 1.0],
    ambientColor: [0.08, 0.1, 0.15, 1.0],
    exposure: 1.2,
    skybox: {
      mode: 'procedural',
      skyColor: [0.05, 0.08, 0.15, 1.0],
      horizonColor: [0.1, 0.15, 0.25, 1.0],
      groundColor: [0.02, 0.03, 0.04, 1.0]
    },
    bloom: {
      enabled: true,
      threshold: 0.8,
      intensity: 0.6
    },
    ssao: {
      enabled: true,
      radius: 0.5,
      bias: 0.02,
      intensity: 1.2
    }
  });

  // Camera setup
  let camRadius = 24.0;
  let camTheta = 0.8;
  let camPhi = 0.45;
  const camTarget: [number, number, number] = [0.0, 1.5, 0.0];

  function computeCameraTransform(): Transform3DDesc {
    const eyeX = camTarget[0] + camRadius * Math.sin(camTheta) * Math.cos(camPhi);
    const eyeY = camTarget[1] + camRadius * Math.sin(camPhi);
    const eyeZ = camTarget[2] + camRadius * Math.cos(camTheta) * Math.cos(camPhi);

    const rot = quatFromLookAt([eyeX, eyeY, eyeZ], camTarget, [0.0, 1.0, 0.0]);
    return {
      position: [eyeX, eyeY, eyeZ],
      rotation: rot,
      scale: [1.0, 1.0, 1.0]
    };
  }

  galfus.realm3dCreateCamera(
    REALM_3D,
    CAMERA_ID,
    {
      kind: 'perspective',
      fovY: 55.0,
      near: 0.1,
      far: 500.0,
      cameraSlot: 1
    },
    computeCameraTransform()
  );

  // Directional Light & Shadow caster
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_DIR_ID,
    {
      kind: 'directional',
      color: [0.9, 0.95, 1.0],
      intensity: 1.8,
      castShadow: true
    },
    {
      position: [0.0, 20.0, 0.0],
      rotation: eulerToQuat(-0.8, 0.6, 0.0),
      scale: [1.0, 1.0, 1.0]
    }
  );

  // Floating point light in the center
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_POINT_ID,
    {
      kind: 'point',
      color: [0.2, 0.9, 1.0],
      intensity: 3.5,
      range: 16.0,
      castShadow: false
    },
    {
      position: [0.0, 3.5, 0.0],
      rotation: [0.0, 0.0, 0.0, 1.0],
      scale: [1.0, 1.0, 1.0]
    }
  );

  // Setup Animation Transition for Floating Point Light via Transition API
  console.log('==> Configuring Animation Transition for Floating Point Light...');
  galfus.animationCreateTransition(
    1,
    { type: 'transform3D', value: [-3.0, 1.5, -3.0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 3.5, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(1, {
    kind: 'light3DTransform',
    realmId: REALM_3D,
    lightId: LIGHT_POINT_ID
  });
  galfus.animationTransitionTo(1, {
    type: 'transform3D',
    value: [3.0, 4.5, 3.0, 0, 0, 0, 1, 1, 1, 1]
  });

  // Ground plane
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_GROUND_ID, {
    primitive: 'plane',
    size: 70.0
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_GROUND_ID, {
    surfaceType: 'opaque',
    baseColor: [0.08, 0.09, 0.12, 1.0],
    roughness: 0.8,
    metallic: 0.1,
    reflectance: 0.4
  });
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_GROUND_ID,
    {
      geometryId: GEOM_GROUND_ID,
      materialId: MAT_GROUND_ID,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    {
      position: [0.0, 0.0, 0.0],
      rotation: [0.0, 0.0, 0.0, 1.0],
      scale: [1.0, 1.0, 1.0]
    }
  );

  // Central Obelisk / Pillar
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_PILLAR_ID, {
    primitive: 'cylinder',
    radius: 0.6,
    size: 4.0
  });
  galfus.realm3dCreateMaterial(REALM_3D, MAT_PILLAR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.15, 0.16, 0.22, 1.0],
    emissiveColor: [0.1, 0.4, 0.8, 1.0],
    roughness: 0.2,
    metallic: 0.8
  });
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_PILLAR_ID,
    {
      geometryId: GEOM_PILLAR_ID,
      materialId: MAT_PILLAR_ID,
      castShadow: true,
      receiveShadow: true,
      active: true
    },
    {
      position: [0.0, 2.0, 0.0],
      rotation: [0.0, 0.0, 0.0, 1.0],
      scale: [1.0, 1.0, 1.0]
    }
  );

  // Instanced Blade / Crystal Geometry (slender pyramid)
  galfus.realm3dCreateGeometry(REALM_3D, GEOM_CRYSTAL_ID, {
    primitive: 'pyramid',
    size: 1.0
  });

  // Instanced Material with Custom WGSL Shader Effect
  galfus.realm3dCreateMaterial(REALM_3D, MAT_CRYSTAL_ID, {
    surfaceType: 'opaque',
    baseColor: [1.0, 1.0, 1.0, 1.0],
    roughness: 0.3,
    metallic: 0.2,
    reflectance: 0.6,
    shaderEffect: INSTANCE_SURFACE_SNIPPET
  });

  const totalInstances = INSTANCE_GRID_SIZE * INSTANCE_GRID_SIZE;
  console.log(`==> Creating Instanced Model with ${totalInstances.toLocaleString()} instances...`);

  galfus.realm3dCreateInstancedModel(REALM_3D, INSTANCED_CRYSTAL_ID, {
    geometryId: GEOM_CRYSTAL_ID,
    materialId: MAT_CRYSTAL_ID,
    capacity: totalInstances,
    castShadow: true,
    receiveShadow: true,
    active: true
  });

  // Generate instances: field of bioluminescent crystals / grass with wind parameters
  console.log(`==> Generating ${totalInstances.toLocaleString()} instances data...`);
  const instanceDataList: InstanceData3DDesc[] = [];
  const halfGrid = (INSTANCE_GRID_SIZE * INSTANCE_SPACING) / 2.0;

  for (let gz = 0; gz < INSTANCE_GRID_SIZE; gz++) {
    for (let gx = 0; gx < INSTANCE_GRID_SIZE; gx++) {
      const baseX = gx * INSTANCE_SPACING - halfGrid;
      const baseZ = gz * INSTANCE_SPACING - halfGrid;

      // Distance from center to keep a small clearing around the central pillar
      const distFromCenter = Math.hypot(baseX, baseZ);
      if (distFromCenter < 1.2) {
        continue;
      }

      // Add pseudo-random organic jitter
      const jitterX = Math.sin(gx * 12.9898 + gz * 78.233) * 0.5 * (INSTANCE_SPACING * 0.6);
      const jitterZ = Math.cos(gx * 39.346 + gz * 11.135) * 0.5 * (INSTANCE_SPACING * 0.6);
      const posX = baseX + jitterX;
      const posZ = baseZ + jitterZ;
      const posY = 0.0;

      // Varied height and slender scale
      const heightScale = 0.8 + Math.abs(Math.sin(gx * 0.3 + gz * 0.5)) * 1.6;
      const widthScale = 0.12 + Math.abs(Math.cos(gx * 0.7)) * 0.08;

      // Color variation across the field (cyan, emerald, gold, purple gradients)
      const colorBlend = (posX / halfGrid + 1.0) * 0.5;
      const r = 0.1 + Math.sin(colorBlend * Math.PI) * 0.3;
      const g = 0.4 + Math.sin(colorBlend * Math.PI * 1.5) * 0.5;
      const b = 0.6 + Math.cos(colorBlend * Math.PI) * 0.4;

      // Emissive glow tint
      const glowR = r * 1.8;
      const glowG = g * 1.8;
      const glowB = b * 1.8;

      // Custom parameters:
      // x: wind sway amplitude (0.25 to 0.7)
      // y: wind wave frequency (0.8 to 1.4)
      // z: pulse speed (1.5 to 3.0)
      // w: individual phase offset
      const windAmp = 0.35 + (gx % 5) * 0.08;
      const windFreq = 0.9 + (gz % 4) * 0.15;
      const pulseSpeed = 1.8 + Math.random() * 1.2;
      const phaseOffset = Math.random() * Math.PI * 2.0;

      // 4x4 matrix (column-major)
      // Scaling: [widthScale, heightScale, widthScale]
      // Rotation: slight random tilt around Y
      const rotY = Math.sin(gx * 5.0 + gz * 3.0) * Math.PI;
      const c = Math.cos(rotY) * widthScale;
      const s = Math.sin(rotY) * widthScale;

      const mat = [
        c,
        0.0,
        s,
        0.0,
        0.0,
        heightScale,
        0.0,
        0.0,
        -s,
        0.0,
        c,
        0.0,
        posX,
        posY,
        posZ,
        1.0
      ];

      instanceDataList.push({
        transform: mat,
        color: [r, g, b, 1.0],
        emissive: [glowR, glowG, glowB, 1.0],
        pbr: [0.1, 0.3, 0.5, 1.0],
        custom: [windAmp, windFreq, pulseSpeed, phaseOffset]
      });
    }
  }

  console.log(`✔ Generated ${instanceDataList.length.toLocaleString()} active instances`);
  galfus.realm3dSetInstancedModelData(REALM_3D, INSTANCED_CRYSTAL_ID, instanceDataList);
  console.log('✔ Uploaded instance data to GPU vertex buffer (1 draw call)!');

  // Multiverse Invocation
  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    clearColor: [0.02, 0.03, 0.05, 1.0]
  });

  console.log('\n===============================================================');
  console.log('  Controls:');
  console.log('    [Drag Mouse]        Orbit camera');
  console.log('    [Arrow Keys / WASD] Pan / orbit scene');
  console.log('    [+/- or Wheel]      Zoom camera');
  console.log('    [Space]             Toggle camera auto-orbit');
  console.log('    [ESC]               Exit demo');
  console.log('===============================================================\n');

  let autoOrbit = true;
  let lastTime = performance.now();
  let frameCount = 0;
  let fpsTimer = performance.now();
  let running = true;

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;
    frameCount++;

    if (now - fpsTimer >= 1000.0) {
      const fps = (frameCount * 1000.0) / (now - fpsTimer);
      galfus.windowSetTitle(
        windowId,
        `Galfus Engine - Demo 3D-8: Instancing (${instanceDataList.length.toLocaleString()} instances, 1 Draw Call) [${fps.toFixed(1)} FPS]`
      );
      frameCount = 0;
      fpsTimer = now;
    }

    if (autoOrbit) {
      camTheta += dt * 0.25;
      galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, computeCameraTransform());
    }

    // Animate floating light via Transition API
    galfus.animationStep(dt);

    // Process platform events
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          running = false;
          break;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input' && ev.state === 'pressed') {
        const key = extractKey(ev);
        if (key === 'escape' || key === 'q') {
          running = false;
          break;
        } else if (key === ' ' || key === 'space') {
          autoOrbit = !autoOrbit;
          console.log(`Auto-orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
        } else if (key === 'arrowleft' || key === 'a') {
          camTheta -= 0.1;
          galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, computeCameraTransform());
        } else if (key === 'arrowright' || key === 'd') {
          camTheta += 0.1;
          galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, computeCameraTransform());
        } else if (key === 'arrowup' || key === 'w') {
          camPhi = Math.min(camPhi + 0.08, 1.4);
          galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, computeCameraTransform());
        } else if (key === 'arrowdown' || key === 's') {
          camPhi = Math.max(camPhi - 0.08, 0.05);
          galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, computeCameraTransform());
        } else if (key === '=' || key === '+') {
          camRadius = Math.max(camRadius - 2.0, 4.0);
          galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, computeCameraTransform());
        } else if (key === '-' || key === '_') {
          camRadius = Math.min(camRadius + 2.0, 60.0);
          galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, computeCameraTransform());
        }
      }
    }

    galfus.multiverseDispatch(frameCount, dt);
    await Bun.sleep(1);
  }

  console.log('Exiting Demo 3D-8...');
  galfus.platformShutdown();
}
