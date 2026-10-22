import { GalfusBun, type Sprite2DDesc } from '../../sdk/bun/galfus.ts';
import { extractKey } from './utils.ts';

const TARGET_WINDOW = 1;
const REALM_2D = 20;
const INVOCATION_MAIN = 200;

const CAMERA_ID = 1;

// Material IDs
const MAT_FLOOR_ID = 1;
const MAT_WALL_ID = 2;
const MAT_CRATE_ID = 3;
const MAT_CRYSTAL_ID = 4;
const MAT_BORDER_ID = 5;
const MAT_ROUND_PILLAR_ID = 6;
const MAT_HEX_PILLAR_ID = 7;
const MAT_OCT_PILLAR_ID = 8;

// Entity IDs
const SPRITE_FLOOR_ID = 1;
const SPRITE_BORDER_TOP = 2;
const SPRITE_BORDER_BOTTOM = 3;
const SPRITE_BORDER_LEFT = 4;
const SPRITE_BORDER_RIGHT = 5;

// Obstacle Sprites / Shapes
const SHAPE_PILLAR_1 = 10;
const SHAPE_PILLAR_2 = 11;
const SHAPE_PILLAR_3 = 12;
const SHAPE_PILLAR_4 = 13;
const SHAPE_CENTER_CRYSTAL = 14;
const SHAPE_CRATE_1 = 15;
const SHAPE_CRATE_2 = 16;

// Light IDs
const LIGHT_PLAYER_ID = 1;
const LIGHT_ORBIT_CYAN_ID = 2;
const LIGHT_PULSE_MAGENTA_ID = 3;

/** Custom 2D Surface Effect: Pulsing Energy Crystal */
const CRYSTAL_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let wave = 0.5 + 0.5 * sin(in.time * in.custom.v0.x);
    out.color = vec4<f32>(mix(in.color.rgb, in.custom.v1.rgb, wave * 0.7), in.color.a);
    out.emissive = vec4<f32>(in.custom.v1.rgb * wave * in.custom.v0.y, 1.0);
    return out;
}
`;

/** Custom 2D Surface Effect: Procedural Regular N-gon / Rounded Shape */
const POLY_SURFACE_SNIPPET = `
fn sd_poly(p: vec2<f32>, r: f32, n: f32) -> f32 {
    if (n < 3.0) { return length(p) - r; }
    let an = 3.14159265 / n;
    let a = atan2(p.y, p.x);
    let bn = ((a % (2.0 * an)) + 2.0 * an) % (2.0 * an) - an;
    return length(p) * cos(bn) - r;
}
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let d = sd_poly((in.uv - vec2<f32>(0.5)) * 2.0, 0.82, in.custom.v0.x);
    if (d > 0.0) { discard; }
    let edge = smoothstep(-0.06, 0.0, d);
    let ring = smoothstep(-0.40, -0.38, d) * (1.0 - smoothstep(-0.32, -0.30, d));
    var col = mix(in.color.rgb, in.color.rgb * 0.45, edge);
    col = mix(col, vec3<f32>(1.0, 0.95, 0.8), ring * 0.65);
    out.color = vec4<f32>(col, in.color.a);
    out.emissive = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return out;
}
`;

export async function runDemo2d1(): Promise<void> {
  console.log(`================================================================
   GALFUS ENGINE - DEMO 2D-1: 2D REALM & POLAR SOFT SHADOWS
================================================================
Initializing Platform & Multiverse Subsystems...`);

  const galfus = new GalfusBun();
  galfus.platformInit();

  const windowId = 1;
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 2D-1: 2D Realm & Dynamic Soft Shadows',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created (Logical ID: ${windowId})`);

  galfus.multiverseAttachWindow(windowId);
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });

  console.log(`==> Creating Realm2D (#${REALM_2D})...`);
  galfus.realm2dCreate(REALM_2D);

  console.log('==> Setting up 2D Camera (#1) with Reverse-Z orthographic projection...');
  const WORLD_HEIGHT = 20.0;
  galfus.realm2dCreateCamera(
    REALM_2D,
    CAMERA_ID,
    {
      orthoScale: WORLD_HEIGHT,
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

  console.log('==> Creating Materials (Floor, Walls, Crates, Glowing Crystal)...');
  // Materials (Floor, Walls, Crates, Glowing Crystal)
  galfus.realm2dCreateMaterial(REALM_2D, MAT_FLOOR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.55, 0.58, 0.65, 1.0]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_BORDER_ID, {
    surfaceType: 'opaque',
    baseColor: [0.22, 0.25, 0.32, 1.0]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_WALL_ID, {
    surfaceType: 'opaque',
    baseColor: [0.15, 0.85, 0.75, 1.0]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_CRATE_ID, {
    surfaceType: 'opaque',
    baseColor: [0.92, 0.52, 0.18, 1.0]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_CRYSTAL_ID, {
    surfaceType: 'transparent',
    baseColor: [0.2, 0.9, 0.3, 1.0],
    shaderEffect: CRYSTAL_SURFACE_SNIPPET,
    customParams: [
      [3.0, 1.5, 0.0, 0.0],
      [0.0, 1.0, 0.6, 1.0],
      [0.0, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.0]
    ]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_ROUND_PILLAR_ID, {
    surfaceType: 'transparent',
    baseColor: [0.15, 0.85, 0.75, 1.0],
    shaderEffect: POLY_SURFACE_SNIPPET,
    customParams: [
      [0.0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_HEX_PILLAR_ID, {
    surfaceType: 'transparent',
    baseColor: [0.85, 0.7, 0.2, 1.0],
    shaderEffect: POLY_SURFACE_SNIPPET,
    customParams: [
      [6.0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  });
  galfus.realm2dCreateMaterial(REALM_2D, MAT_OCT_PILLAR_ID, {
    surfaceType: 'transparent',
    baseColor: [0.25, 0.75, 0.95, 1.0],
    shaderEffect: POLY_SURFACE_SNIPPET,
    customParams: [
      [8.0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]
  });

  console.log('==> Creating Scene Geometry & Shadow Occluders...');
  galfus.realm2dCreateSprite(
    REALM_2D,
    SPRITE_FLOOR_ID,
    {
      dimensions: [32.0, 24.0],
      materialId: MAT_FLOOR_ID,
      castShadow: false,
      receiveShadow: true
    },
    { position: [0.0, 0.0], zLayer: -10 }
  );

  // 2. Arena Borders
  const BORDER_THICKNESS = 1.0;
  const HALF_W = 14.0;
  const HALF_H = 10.0;
  const borderH: Sprite2DDesc = {
    dimensions: [HALF_W * 2 + BORDER_THICKNESS * 2, BORDER_THICKNESS],
    materialId: MAT_BORDER_ID,
    castShadow: false,
    receiveShadow: true
  };
  const borderV: Sprite2DDesc = {
    dimensions: [BORDER_THICKNESS, HALF_H * 2],
    materialId: MAT_BORDER_ID,
    castShadow: false,
    receiveShadow: true
  };

  const addBorder = (id: number, desc: Sprite2DDesc, pos: [number, number]) =>
    galfus.realm2dCreateSprite(REALM_2D, id, desc, { position: pos, zLayer: 0 });
  addBorder(SPRITE_BORDER_TOP, borderH, [0.0, HALF_H + BORDER_THICKNESS * 0.5]);
  addBorder(SPRITE_BORDER_BOTTOM, borderH, [0.0, -HALF_H - BORDER_THICKNESS * 0.5]);
  addBorder(SPRITE_BORDER_LEFT, borderV, [-HALF_W - BORDER_THICKNESS * 0.5, 0.0]);
  addBorder(SPRITE_BORDER_RIGHT, borderV, [HALF_W + BORDER_THICKNESS * 0.5, 0.0]);

  // 3. Central Obstacles / Pillars casting polar soft shadows
  const PILLAR_SIZE: [number, number] = [2.2, 2.2];
  const addPillar = (id: number, mat: number, kind: string, extra: any, pos: [number, number]) =>
    galfus.realm2dCreateShape(
      REALM_2D,
      id,
      { kind, materialId: mat, castShadow: true, receiveShadow: true, ...extra },
      { position: pos, zLayer: 1 }
    );

  const hexR = 1.35;
  const hexVertices: [number, number][] = [
    [hexR, 0.0],
    [hexR * 0.5, hexR * 0.866],
    [-hexR * 0.5, hexR * 0.866],
    [-hexR, 0.0],
    [-hexR * 0.5, -hexR * 0.866],
    [hexR * 0.5, -hexR * 0.866]
  ];

  const octR = 1.35;
  const octVertices: [number, number][] = [
    [octR, octR * 0.414],
    [octR * 0.414, octR],
    [-octR * 0.414, octR],
    [-octR, octR * 0.414],
    [-octR, -octR * 0.414],
    [-octR * 0.414, -octR],
    [octR * 0.414, -octR],
    [octR, -octR * 0.414]
  ];

  // 1: Rectangle (Square, 4 vertices), 2: Circle, 3: Hexagon (6 vertices), 4: Octagon (8 vertices)
  addPillar(SHAPE_PILLAR_1, MAT_WALL_ID, 'rectangle', { size: PILLAR_SIZE }, [-6.5, 4.0]);
  addPillar(
    SHAPE_PILLAR_2,
    MAT_ROUND_PILLAR_ID,
    'circle',
    { radius: 1.3, segments: 32 },
    [6.5, 4.0]
  );
  addPillar(SHAPE_PILLAR_3, MAT_HEX_PILLAR_ID, 'polygon', { vertices: hexVertices }, [-6.5, -4.0]);
  addPillar(SHAPE_PILLAR_4, MAT_OCT_PILLAR_ID, 'polygon', { vertices: octVertices }, [6.5, -4.0]);

  // Industrial Crates (with 2.5D height band on Crate 1)
  galfus.realm2dCreateSprite(
    REALM_2D,
    SHAPE_CRATE_1,
    {
      dimensions: [2.0, 1.4],
      materialId: MAT_CRATE_ID,
      castShadow: true,
      receiveShadow: true,
      heightRange: [2.0, 4.0] // 2.5D height band: occludes light only when light Z in [2.0, 4.0]
    },
    { position: [-2.0, 1.5], rotation: 0.25, zLayer: 1 }
  );

  galfus.realm2dCreateSprite(
    REALM_2D,
    SHAPE_CRATE_2,
    {
      dimensions: [1.6, 1.6],
      materialId: MAT_CRATE_ID,
      castShadow: true,
      receiveShadow: true
    },
    { position: [3.5, -1.8], rotation: -0.4, zLayer: 1 }
  );

  // Central Rotating Energy Crystal (Shape)
  galfus.realm2dCreateShape(
    REALM_2D,
    SHAPE_CENTER_CRYSTAL,
    {
      kind: 'rectangle',
      size: [2.5, 2.5],
      materialId: MAT_CRYSTAL_ID,
      castShadow: true,
      receiveShadow: true
    },
    { position: [0.0, 0.0], rotation: 0.785, zLayer: 2 }
  );

  // Setup Animation Transitions for Crate 2 and Central Crystal via Transition API
  console.log('==> Configuring Animation Transitions for 2D Crate & Crystal...');
  galfus.animationCreateTransition(
    1,
    { type: 'transform2D', value: [3.5, -1.95, -0.45, 1, 1, 1] },
    { duration: 2.4, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(1, {
    kind: 'spriteTransform2D',
    realmId: REALM_2D,
    spriteId: SHAPE_CRATE_2
  });
  galfus.animationTransitionTo(1, {
    type: 'transform2D',
    value: [3.5, -1.65, -0.35, 1, 1, 1]
  });

  galfus.animationCreateTransition(
    2,
    { type: 'transform2D', value: [0.0, 0.0, 0.0, 1, 1, 2] },
    { duration: 7.8, delay: 0.0, easing: 'linear', loopMode: 'loop' }
  );
  galfus.animationBindTarget(2, {
    kind: 'shapeTransform2D',
    realmId: REALM_2D,
    shapeId: SHAPE_CENTER_CRYSTAL
  });
  galfus.animationTransitionTo(2, {
    type: 'transform2D',
    value: [0.0, 0.0, 6.28318, 1, 1, 2]
  });

  console.log('==> Configuring 2D Dynamic Point Lights & Soft Shadows...');
  let playerPos: [number, number] = [0.0, -5.5];
  let playerZ = 3.0; // Initial elevation Z (inside Crate 1's [2.0, 4.0] range)
  let lightRadius = 0.45; // Initial emitter disk radius for penumbra
  let playerRange = 42.0; // Infinite/deep shadow reach across the entire arena
  let ambientFactor = 0.15;
  let shadowsEnabled = true;

  galfus.realm2dSetShadowConfig(REALM_2D, {
    ambient: ambientFactor,
    lightRadius: lightRadius,
    angularResolution: 1024,
    shadowContactOffset: 0.0
  });

  // Light 1: Player Torch / Plasma Orb (Warm Amber Glow, primary shadow caster)
  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_PLAYER_ID,
    {
      color: [1.0, 0.8, 0.5], // Warm Amber
      intensity: 2.2,
      range: playerRange,
      lightRadius: lightRadius,
      castShadow: true,
      active: true
    },
    { position: playerPos, zLayer: Math.round(playerZ) }
  );

  // Light 2: Orbiting Electric Cyan Accent
  let orbitAngle = 0.0;
  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_ORBIT_CYAN_ID,
    {
      color: [0.1, 0.85, 1.0], // Neon Cyan
      intensity: 1.2,
      range: 32.0,
      lightRadius: 0.35,
      castShadow: true,
      active: true
    },
    { position: [-5.0, 0.0], zLayer: 2 }
  );

  // Light 3: Pulsing Violet Accent
  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_PULSE_MAGENTA_ID,
    {
      color: [0.9, 0.2, 0.95], // Electric Magenta
      intensity: 1.0,
      range: 32.0,
      lightRadius: 0.4,
      castShadow: true,
      active: true
    },
    { position: [0.0, 6.0], zLayer: 3 }
  );

  console.log('==> Creating Multiverse Invocation...');
  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_2D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    clearColor: [0.06, 0.07, 0.09, 1.0], // Deep space navy clear
    viewport: { width: { vw: 100 }, height: { vh: 100 } }
  });

  console.log('✔ Multiverse schedule configured');
  console.log(`\n================================================================
CONTROLS:
  [W][A][S][D] / Arrows : Move main amber light around the arena
  Mouse Click & Drag    : Move light directly to cursor
  [1] / [2]             : Decrease / Increase light emitter radius (soft penumbra)
  [3] / [4]             : Decrease / Increase ambient illumination
  [5] / [6]             : Decrease / Increase shadow depth reach (light range)
  [7] / [8]             : Decrease / Increase light elevation Z (Crate 1 is at Z: 2.0..4.0)
  [SPACE]               : Toggle dynamic shadows ON/OFF
  [R]                   : Reset player position & parameters
  [ESC]                 : Quit demo
================================================================\n`);

  const syncShadowConfig = () => {
    galfus.realm2dSetShadowConfig(REALM_2D, {
      ambient: ambientFactor,
      lightRadius,
      angularResolution: 1024
    });
  };

  const updatePlayerLight = () => {
    galfus.realm2dCreateLight(
      REALM_2D,
      LIGHT_PLAYER_ID,
      {
        color: [1.0, 0.8, 0.5],
        intensity: 2.2,
        range: playerRange,
        lightRadius,
        castShadow: shadowsEnabled,
        active: true
      },
      { position: playerPos, zLayer: Math.round(playerZ) }
    );
  };

  let running = true;
  let frameCount = 0;
  let crystalRot = 0.0;
  let isMouseDown = false;
  let windowSize: [number, number] = [1024, 768];
  let camPos: [number, number] = [0.0, 0.0];

  const keysDown = new Set<string>();
  let lastTime = performance.now();

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;

    // Pump window and input events
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          running = false;
          break;
        } else if (ev.type === 'resized') {
          windowSize = [ev.width, ev.height];
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        const key = extractKey(ev);
        if (ev.state === 'pressed') {
          keysDown.add(key);

          if (key === 'escape') {
            running = false;
            break;
          }
          if (key === 'space') {
            shadowsEnabled = !shadowsEnabled;
            updatePlayerLight();
            console.log(`[Shadows] Player shadows: ${shadowsEnabled ? 'ENABLED' : 'DISABLED'}`);
          }
          if (key === '1' || key === '2') {
            lightRadius =
              key === '1' ? Math.max(0.05, lightRadius - 0.1) : Math.min(2.0, lightRadius + 0.1);
            syncShadowConfig();
            updatePlayerLight();
            console.log(`[Soft Shadows] Emitter Radius: ${lightRadius.toFixed(2)}`);
          }
          if (key === '3' || key === '4') {
            ambientFactor =
              key === '3'
                ? Math.max(0.01, ambientFactor - 0.02)
                : Math.min(0.5, ambientFactor + 0.02);
            syncShadowConfig();
            console.log(`[Ambient] Ambient Light: ${ambientFactor.toFixed(2)}`);
          }
          if (key === '5' || key === '6') {
            playerRange =
              key === '5' ? Math.max(12.0, playerRange - 6.0) : Math.min(120.0, playerRange + 6.0);
            updatePlayerLight();
            console.log(`[Shadow Reach] Light Range: ${playerRange.toFixed(1)}`);
          }
          if (key === '7' || key === '8') {
            playerZ =
              key === '7'
                ? Math.max(-2.0, +(playerZ - 1.0).toFixed(1))
                : Math.min(10.0, +(playerZ + 1.0).toFixed(1));
            updatePlayerLight();
            const crateStatus =
              playerZ < 2.0
                ? 'UNDERNEATH (No shadow & Crate unlit)'
                : playerZ <= 4.0
                  ? 'COLLIDES (Shadow cast & Crate illuminated)'
                  : 'OVERHEAD (No shadow & Crate illuminated from above)';
            console.log(
              `[Light Z] Elevation: ${playerZ.toFixed(1)} -> Crate 1 (Z: 2.0..4.0): ${crateStatus}`
            );
          }
          if (key === 'r') {
            playerPos = [0.0, -5.5];
            playerZ = 3.0;
            lightRadius = 0.45;
            playerRange = 42.0;
            ambientFactor = 0.15;
            shadowsEnabled = true;
            syncShadowConfig();
            updatePlayerLight();
            console.log('[Reset] Restored initial positions and parameters.');
          }
        } else if (ev.state === 'released') {
          keysDown.delete(key);
        }
      } else if (ev.kind === 'pointer') {
        if (ev.type === 'button') isMouseDown = ev.state === 'pressed';
        if (isMouseDown && (ev.type === 'button' || ev.type === 'move')) {
          const pos = ev.position;
          const aspect = windowSize[0] / Math.max(1, windowSize[1]);
          playerPos[0] = ((pos[0] / windowSize[0]) * 2.0 - 1.0) * (WORLD_HEIGHT * 0.5 * aspect);
          playerPos[1] = (1.0 - (pos[1] / windowSize[1]) * 2.0) * (WORLD_HEIGHT * 0.5);
        }
      }
    }

    // Keyboard player movement
    const moveSpeed = 12.0 * dt;
    if (keysDown.has('w') || keysDown.has('arrowup'))
      playerPos[1] = Math.min(HALF_H - 1.0, playerPos[1] + moveSpeed);
    if (keysDown.has('s') || keysDown.has('arrowdown'))
      playerPos[1] = Math.max(-HALF_H + 1.0, playerPos[1] - moveSpeed);
    if (keysDown.has('a') || keysDown.has('arrowleft'))
      playerPos[0] = Math.max(-HALF_W + 1.0, playerPos[0] - moveSpeed);
    if (keysDown.has('d') || keysDown.has('arrowright'))
      playerPos[0] = Math.min(HALF_W - 1.0, playerPos[0] + moveSpeed);

    // Smooth camera tracking with realm2dSetCameraTransform
    camPos[0] += (playerPos[0] * 0.08 - camPos[0]) * 3.0 * dt;
    camPos[1] += (playerPos[1] * 0.08 - camPos[1]) * 3.0 * dt;
    galfus.realm2dSetCameraTransform(REALM_2D, CAMERA_ID, {
      position: camPos,
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 0
    });

    // Update player light transform with realm2dSetLightTransform
    galfus.realm2dSetLightTransform(REALM_2D, LIGHT_PLAYER_ID, {
      position: playerPos,
      zLayer: Math.round(playerZ)
    });

    // Animate orbiting cyan light transform
    orbitAngle += 1.2 * dt;
    const orbitX = Math.cos(orbitAngle) * 8.5;
    const orbitY = Math.sin(orbitAngle * 1.5) * 4.5;
    galfus.realm2dSetLightTransform(REALM_2D, LIGHT_ORBIT_CYAN_ID, {
      position: [orbitX, orbitY],
      zLayer: 2
    });

    // Advance 2D Animations via Transition API
    galfus.animationStep(dt);

    // Render frame through multiverse dispatch
    galfus.multiverseDispatch(frameCount, dt);
    frameCount++;

    // Yield small time for smooth frame pacing (~60 FPS)
    await Bun.sleep(16);
  }

  console.log('==> Shutting down Demo 2D-1...');
  galfus.multiverseDestroyInvocation(INVOCATION_MAIN);
  galfus.realm2dDestroy(REALM_2D);
  galfus.windowClose(windowId);
  galfus.platformShutdown();
  console.log('✔ Cleanup complete. Goodbye!');
}
