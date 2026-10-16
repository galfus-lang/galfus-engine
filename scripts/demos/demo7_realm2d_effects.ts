import { GalfusBun, type Sprite2DDesc } from '../../sdk/bun/galfus.ts';

const TARGET_WINDOW = 1;
const REALM_2D = 30;
const INVOCATION_MAIN = 300;
const CAMERA_ID = 1;

// Material IDs
const MAT_FLOOR_ID = 1;
const MAT_PLASMA_ID = 2;
const MAT_HOLO_ID = 3;
const MAT_LAVA_ID = 4;
const MAT_CAUSTIC_ID = 5;
const MAT_BORDER_ID = 6;

// Entity IDs
const SPRITE_FLOOR_ID = 1;
const SPRITE_BORDER_TOP = 2;
const SPRITE_BORDER_BOTTOM = 3;
const SPRITE_BORDER_LEFT = 4;
const SPRITE_BORDER_RIGHT = 5;

// Effect Showcase Shapes / Sprites
const SHAPE_PLASMA_ID = 10;
const SPRITE_HOLO_ID = 11;
const SHAPE_LAVA_ID = 12;
const SPRITE_CAUSTIC_ID = 13;
const SHAPE_CENTER_ORB = 14;

// Dynamic Light IDs
const LIGHT_ORBIT_ID = 1;
const LIGHT_AMBIENT_ACCENT_ID = 2;

// --- WGSL 2D SURFACE EFFECT SNIPPETS ---

/** Effect 1: Swirling Concentric Plasma Vortex */
const PLASMA_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let uv_c = (in.uv - vec2<f32>(0.5)) * 2.0;
    let dist = length(uv_c);
    let angle = atan2(uv_c.y, uv_c.x);

    let speed = in.custom.v0.x;
    let freq = in.custom.v0.y;
    let swirl = in.custom.v0.z;

    let wave = sin(dist * freq - in.time * speed + angle * swirl);
    let ring = 0.5 + 0.5 * wave;
    let mask = smoothstep(1.0, 0.7, dist);

    let col_core = in.color.rgb;
    let col_energy = in.custom.v1.rgb;
    let final_rgb = mix(col_core, col_energy, ring);

    out.color = vec4<f32>(final_rgb, in.color.a * mask);
    out.emissive = vec4<f32>(col_energy * pow(ring, 2.5) * 2.2 * mask, 1.0);
    return out;
}
`;

/** Effect 2: Cyber Hologram & Scanlines with Glitch Distortion */
const HOLO_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let scan_speed = in.custom.v0.x;
    let scan_density = in.custom.v0.y;

    let scanline = 0.5 + 0.5 * sin(in.uv.y * scan_density + in.time * scan_speed);
    let grid_x = step(0.06, fract(in.uv.x * 14.0));
    let grid_y = step(0.06, fract(in.uv.y * 14.0));
    let grid = grid_x * grid_y;

    let jitter = sin(in.time * 30.0 + in.uv.y * 80.0) * 0.04;
    let holo_rgb = in.custom.v1.rgb + vec3<f32>(jitter);
    let alpha = in.color.a * (0.55 + 0.45 * scanline) * (0.7 + 0.3 * grid);

    out.color = vec4<f32>(mix(in.color.rgb, holo_rgb, 0.75), alpha);
    out.emissive = vec4<f32>(holo_rgb * scanline * 1.8, alpha);
    return out;
}
`;

/** Effect 3: Molten Lava / Procedural Dissolve with Burning Edges */
const LAVA_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let scale = in.custom.v0.x;
    let speed = in.custom.v0.y;

    let n = sin(in.uv.x * scale + in.time * speed) * cos(in.uv.y * scale + in.time * speed * 0.8);
    let pulse = 0.5 + 0.5 * sin(in.time * 2.0);
    let edge = smoothstep(-0.2, 0.3, n);
    let fire_rim = smoothstep(0.1, 0.25, n) * (1.0 - smoothstep(0.25, 0.45, n));

    let magma_base = in.color.rgb;
    let magma_fire = in.custom.v1.rgb;
    let rim_color = in.custom.v2.rgb;

    let blend = mix(magma_base, magma_fire, edge);
    let final_rgb = mix(blend, rim_color, fire_rim);

    out.color = vec4<f32>(final_rgb, in.color.a);
    out.emissive = vec4<f32>(rim_color * fire_rim * (2.5 + pulse), 1.0);
    return out;
}
`;

/** Effect 4: Translucent Caustics & Shimmering Waves */
const CAUSTIC_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let scale = in.custom.v0.x;
    let speed = in.custom.v0.y;
    let p = in.uv * scale;
    let t = in.time * speed;

    let c1 = sin(p.x + t) + sin(p.y + t * 0.9);
    let c2 = sin(p.x * 1.4 - t * 1.1) + cos(p.y * 1.2 + t * 0.7);
    let caustic = pow(0.5 + 0.5 * sin(c1 + c2), 3.0);

    let water_base = in.color.rgb;
    let highlight = in.custom.v1.rgb;
    let final_rgb = mix(water_base, highlight, caustic * 0.85);

    out.color = vec4<f32>(final_rgb, in.color.a);
    out.emissive = vec4<f32>(highlight * caustic * 1.6, 1.0);
    return out;
}
`;

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
  if (phys.startsWith('key') && phys.length === 4) return phys.slice(3);
  if (phys.startsWith('digit') && phys.length === 6) return phys.slice(5);
  return phys;
}

export async function runDemo7(): Promise<void> {
  console.log('================================================================');
  console.log('   GALFUS ENGINE - DEMO 7: 2D REALM MATERIAL SHADER EFFECTS');
  console.log('================================================================');
  console.log('Initializing Platform & Multiverse Subsystems...');

  const galfus = new GalfusBun();
  galfus.platformInit();

  const windowId = 1;
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 7: 2D Realm Material Shader Effects',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created (Logical ID: ${windowId})`);

  galfus.multiverseAttachWindow(windowId);
  galfus.multiverseCreateTarget(TARGET_WINDOW, { kind: { type: 'window', windowId } });

  console.log(`==> Creating Realm2D (#${REALM_2D})...`);
  galfus.realm2dCreate(REALM_2D);

  console.log('==> Setting up 2D Camera (#1) with Reverse-Z...');
  const WORLD_HEIGHT = 18.0;
  galfus.realm2dCreateCamera(
    REALM_2D,
    CAMERA_ID,
    { orthoScale: WORLD_HEIGHT, near: -100.0, far: 100.0, cameraSlot: 1, active: true },
    { position: [0.0, 0.0], rotation: 0.0, scale: [1.0, 1.0], zLayer: 0 }
  );

  console.log('==> Creating Materials with Custom 2D Shader Effects...');

  // 1. Dark Brushed Industrial Background
  galfus.realm2dCreateMaterial(REALM_2D, MAT_FLOOR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.12, 0.14, 0.18, 1.0]
  });

  // 2. Borders Material
  galfus.realm2dCreateMaterial(REALM_2D, MAT_BORDER_ID, {
    surfaceType: 'opaque',
    baseColor: [0.22, 0.26, 0.35, 1.0]
  });

  // 3. Effect 1: Concentric Swirling Plasma Vortex (Custom Effect)
  galfus.realm2dCreateMaterial(REALM_2D, MAT_PLASMA_ID, {
    surfaceType: 'transparent',
    baseColor: [0.1, 0.2, 0.85, 0.95],
    shaderEffect: PLASMA_SURFACE_SNIPPET,
    customParams: [
      [4.0, 10.0, 4.0, 0.0], // v0: speed=4.0, freq=10.0, swirl=4.0
      [0.95, 0.2, 0.8, 1.0], // v1: Electric Magenta/Pink energy
      [0.0, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.0]
    ]
  });

  // 4. Effect 2: Cyber Hologram with Scanlines (Custom Effect)
  galfus.realm2dCreateMaterial(REALM_2D, MAT_HOLO_ID, {
    surfaceType: 'transparent',
    baseColor: [0.05, 0.7, 0.85, 0.85],
    shaderEffect: HOLO_SURFACE_SNIPPET,
    customParams: [
      [8.0, 50.0, 0.0, 0.0], // v0: scan_speed=8.0, scan_density=50.0
      [0.1, 0.95, 0.85, 1.0], // v1: Bright Cyan Hologram
      [0.0, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.0]
    ]
  });

  // 5. Effect 3: Molten Lava / Burning Edges (Custom Effect)
  galfus.realm2dCreateMaterial(REALM_2D, MAT_LAVA_ID, {
    surfaceType: 'opaque',
    baseColor: [0.4, 0.08, 0.02, 1.0],
    shaderEffect: LAVA_SURFACE_SNIPPET,
    customParams: [
      [6.0, 2.5, 0.0, 0.0], // v0: scale=6.0, speed=2.5
      [0.95, 0.35, 0.05, 1.0], // v1: Intense Molten Orange
      [1.0, 0.85, 0.1, 1.0], // v2: Incandescent Yellow Burn Rim
      [0.0, 0.0, 0.0, 0.0]
    ]
  });

  // 6. Effect 4: Translucent Caustics (Custom Effect)
  galfus.realm2dCreateMaterial(REALM_2D, MAT_CAUSTIC_ID, {
    surfaceType: 'transparent',
    baseColor: [0.05, 0.35, 0.6, 0.8],
    shaderEffect: CAUSTIC_SURFACE_SNIPPET,
    customParams: [
      [8.0, 2.0, 0.0, 0.0], // v0: scale=8.0, speed=2.0
      [0.4, 0.95, 0.9, 1.0], // v1: Shimmering Turquoise Highlights
      [0.0, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.0]
    ]
  });

  console.log('==> Creating Arena & Showcase Elements...');

  // Background Floor Sprite
  galfus.realm2dCreateSprite(
    REALM_2D,
    SPRITE_FLOOR_ID,
    { dimensions: [28.0, 20.0], materialId: MAT_FLOOR_ID, castShadow: false, receiveShadow: true },
    { position: [0.0, 0.0], zLayer: -10 }
  );

  // Border Walls
  const BORDER_W = 26.0;
  const BORDER_H = 18.0;
  const BORDER_THICK = 0.8;
  const bH: Sprite2DDesc = {
    dimensions: [BORDER_W + BORDER_THICK * 2, BORDER_THICK],
    materialId: MAT_BORDER_ID,
    castShadow: true,
    receiveShadow: true
  };
  const bV: Sprite2DDesc = {
    dimensions: [BORDER_THICK, BORDER_H],
    materialId: MAT_BORDER_ID,
    castShadow: true,
    receiveShadow: true
  };

  galfus.realm2dCreateSprite(REALM_2D, SPRITE_BORDER_TOP, bH, {
    position: [0.0, BORDER_H * 0.5 + BORDER_THICK * 0.5],
    zLayer: 0
  });
  galfus.realm2dCreateSprite(REALM_2D, SPRITE_BORDER_BOTTOM, bH, {
    position: [0.0, -BORDER_H * 0.5 - BORDER_THICK * 0.5],
    zLayer: 0
  });
  galfus.realm2dCreateSprite(REALM_2D, SPRITE_BORDER_LEFT, bV, {
    position: [-BORDER_W * 0.5 - BORDER_THICK * 0.5, 0.0],
    zLayer: 0
  });
  galfus.realm2dCreateSprite(REALM_2D, SPRITE_BORDER_RIGHT, bV, {
    position: [BORDER_W * 0.5 + BORDER_THICK * 0.5, 0.0],
    zLayer: 0
  });

  // Showcase Item 1: Top-Left - Swirling Concentric Plasma (Shape Circle)
  galfus.realm2dCreateShape(
    REALM_2D,
    SHAPE_PLASMA_ID,
    {
      kind: 'circle',
      radius: 2.2,
      materialId: MAT_PLASMA_ID,
      castShadow: true,
      receiveShadow: true
    },
    { position: [-6.0, 4.0], zLayer: 1 }
  );

  // Showcase Item 2: Top-Right - Cyber Hologram Terminal (Sprite Rectangle)
  galfus.realm2dCreateSprite(
    REALM_2D,
    SPRITE_HOLO_ID,
    { dimensions: [4.4, 3.6], materialId: MAT_HOLO_ID, castShadow: true, receiveShadow: true },
    { position: [6.0, 4.0], zLayer: 1 }
  );

  // Showcase Item 3: Bottom-Left - Molten Lava Core (Shape Rectangle)
  galfus.realm2dCreateShape(
    REALM_2D,
    SHAPE_LAVA_ID,
    {
      kind: 'rectangle',
      size: [4.0, 3.6],
      materialId: MAT_LAVA_ID,
      castShadow: true,
      receiveShadow: true
    },
    { position: [-6.0, -4.0], rotation: 0.15, zLayer: 1 }
  );

  // Showcase Item 4: Bottom-Right - Translucent Caustic Pool (Sprite Rounded/Rectangle)
  galfus.realm2dCreateSprite(
    REALM_2D,
    SPRITE_CAUSTIC_ID,
    { dimensions: [4.4, 3.8], materialId: MAT_CAUSTIC_ID, castShadow: true, receiveShadow: true },
    { position: [6.0, -4.0], zLayer: 1 }
  );

  // Center Feature: Rotating Hybrid Plasma Crystal (Shape)
  galfus.realm2dCreateShape(
    REALM_2D,
    SHAPE_CENTER_ORB,
    {
      kind: 'rectangle',
      size: [2.8, 2.8],
      materialId: MAT_PLASMA_ID,
      castShadow: true,
      receiveShadow: true
    },
    { position: [0.0, 0.0], rotation: 0.785, zLayer: 2 }
  );

  console.log('==> Configuring 2D Lights & Shadows...');
  galfus.realm2dSetShadowConfig(REALM_2D, {
    ambient: 0.2,
    lightRadius: 0.45,
    angularResolution: 1024
  });

  // Light 1: Orbiting Bright White-Gold Light
  let orbitAngle = 0.0;
  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_ORBIT_ID,
    {
      color: [1.0, 0.95, 0.8],
      intensity: 2.5,
      range: 38.0,
      lightRadius: 0.4,
      castShadow: true,
      active: true
    },
    { position: [0.0, 3.0], zLayer: 3 }
  );

  // Light 2: Center Violet Accent Light
  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_AMBIENT_ACCENT_ID,
    {
      color: [0.7, 0.3, 0.9],
      intensity: 1.2,
      range: 20.0,
      lightRadius: 0.5,
      castShadow: false,
      active: true
    },
    { position: [0.0, 0.0], zLayer: 2 }
  );

  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_2D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    clearColor: [0.06, 0.07, 0.09, 1.0],
    viewport: { unit: 'normalized', x: 0.0, y: 0.0, width: 1.0, height: 1.0 }
  });

  console.log('\n================================================================');
  console.log('CONTROLS:');
  console.log('  [W][A][S][D] / Arrows : Pan Camera across the gallery');
  console.log('  [SPACE]               : Pause / Resume Orbit Animation');
  console.log('  [1] / [2]             : Decrease / Increase Plasma Rotation Speed');
  console.log('  [R]                   : Reset Camera & Parameters');
  console.log('  [ESC]                 : Quit demo');
  console.log('================================================================\n');

  let running = true;
  let frameCount = 0;
  let paused = false;
  let crystalRot = 0.785;
  let rotSpeed = 0.8;
  let camPos: [number, number] = [0.0, 0.0];
  let windowSize: [number, number] = [1024, 768];

  const keysDown = new Set<string>();
  let lastTime = performance.now();

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;

    // Pump window and input events
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if ('window' in ev) {
        const win = ev.window;
        if ('closeRequested' in win) {
          running = false;
          break;
        } else if ('resized' in win) {
          windowSize = [win.resized.width, win.resized.height];
          galfus.multiverseUpdateWindowSize(windowId, win.resized.width, win.resized.height);
        }
      } else if ('keyboard' in ev && 'input' in ev.keyboard) {
        const input = ev.keyboard.input;
        const key = extractKey(input);
        if (input.state === 'pressed') {
          keysDown.add(key);

          if (key === 'escape') {
            running = false;
            break;
          }
          if (key === 'space') {
            paused = !paused;
            console.log(`[Animation] ${paused ? 'PAUSED' : 'RESUMED'}`);
          }
          if (key === '1') {
            rotSpeed = Math.max(0.1, rotSpeed - 0.2);
            console.log(`[Speed] Rotation speed: ${rotSpeed.toFixed(2)}`);
          }
          if (key === '2') {
            rotSpeed = Math.min(3.0, rotSpeed + 0.2);
            console.log(`[Speed] Rotation speed: ${rotSpeed.toFixed(2)}`);
          }
          if (key === 'r') {
            camPos = [0.0, 0.0];
            rotSpeed = 0.8;
            paused = false;
            console.log('[Reset] Restored default view.');
          }
        } else if (input.state === 'released') {
          keysDown.delete(key);
        }
      }
    }

    // Camera panning
    const camSpeed = 10.0 * dt;
    if (keysDown.has('w') || keysDown.has('arrowup')) camPos[1] += camSpeed;
    if (keysDown.has('s') || keysDown.has('arrowdown')) camPos[1] -= camSpeed;
    if (keysDown.has('a') || keysDown.has('arrowleft')) camPos[0] -= camSpeed;
    if (keysDown.has('d') || keysDown.has('arrowright')) camPos[0] += camSpeed;

    // Update Camera Transform with parity method
    galfus.realm2dSetCameraTransform(REALM_2D, CAMERA_ID, {
      position: camPos,
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 0
    });

    if (!paused) {
      orbitAngle += 1.1 * dt;
      crystalRot += rotSpeed * dt;

      // Animate Orbiting Light with parity method
      const lx = Math.cos(orbitAngle) * 7.5;
      const ly = Math.sin(orbitAngle * 1.3) * 5.0;
      galfus.realm2dSetLightTransform(REALM_2D, LIGHT_ORBIT_ID, {
        position: [lx, ly],
        zLayer: 3
      });

      // Animate Center Crystal with parity method
      galfus.realm2dSetShapeTransform(REALM_2D, SHAPE_CENTER_ORB, {
        position: [0.0, 0.0],
        rotation: crystalRot,
        zLayer: 2
      });

      // Subtle float on Holo Terminal with parity method
      const holoBob = Math.sin(orbitAngle * 1.8) * 0.12;
      galfus.realm2dSetSpriteTransform(REALM_2D, SPRITE_HOLO_ID, {
        position: [6.0, 4.0 + holoBob],
        rotation: 0.0,
        zLayer: 1
      });

      // Subtle breath on Molten Lava shape
      const lavaWobble = Math.sin(orbitAngle * 0.9) * 0.06;
      galfus.realm2dSetShapeTransform(REALM_2D, SHAPE_LAVA_ID, {
        position: [-6.0, -4.0],
        rotation: 0.15 + lavaWobble,
        zLayer: 1
      });
    }

    // Render frame
    galfus.multiverseDispatch(frameCount, dt);
    frameCount++;

    await Bun.sleep(16);
  }

  console.log('==> Shutting down Demo 7...');
  galfus.multiverseDestroyInvocation(INVOCATION_MAIN);
  galfus.realm2dDestroy(REALM_2D);
  galfus.windowClose(windowId);
  galfus.platformShutdown();
  console.log('✔ Cleanup complete. Goodbye!');
}
