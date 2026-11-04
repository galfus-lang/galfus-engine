import { isKey, type Light2DComponent, type Model2DComponent } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const CRYSTAL_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let wave = 0.5 + 0.5 * sin(in.time * in.custom.v0.x);
    out.color = vec4<f32>(mix(in.color.rgb, in.custom.v1.rgb, wave * 0.7), in.color.a);
    out.emissive = vec4<f32>(in.custom.v1.rgb * wave * in.custom.v0.y, 1.0);
    return out;
}
`;

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

export async function runDemo2d1(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames, size } = createDemoSession(
    'Galfus Host Demo: 2D-1 Polar Soft Shadows',
    options,
    [1024, 768]
  );

  try {
    const realm2d = runtime.createRealm2D();
    let windowSize: [number, number] = [size[0], size[1]];

    const WORLD_HEIGHT = 20.0;
    const camera = realm2d.createCamera(
      { orthoScale: WORLD_HEIGHT, near: -100, far: 100, cameraSlot: 1, active: true },
      { position: [0, 0] }
    );

    const matFloor = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.55, 0.58, 0.65, 1.0]
    });
    const matBorder = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.22, 0.25, 0.32, 1.0]
    });
    const matWall = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.15, 0.85, 0.75, 1.0]
    });
    const matCrate = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.92, 0.52, 0.18, 1.0]
    });
    const matCrystal = realm2d.createMaterial({
      surfaceType: 'transparent',
      baseColor: [0.2, 0.9, 0.3, 1.0],
      shaderEffect: CRYSTAL_SURFACE_SNIPPET,
      customParams: [
        [3.0, 1.5, 0.0, 0.0],
        [0.0, 1.0, 0.6, 1.0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ]
    });
    const matRoundPillar = realm2d.createMaterial({
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
    const matHexPillar = realm2d.createMaterial({
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
    const matOctPillar = realm2d.createMaterial({
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

    realm2d.createSprite(
      { dimensions: [32.0, 24.0], materialId: matFloor, castShadow: false, receiveShadow: true },
      { position: [0, 0], zLayer: -10 }
    );

    const BORDER_THICKNESS = 1.0;
    const HALF_W = 14.0;
    const HALF_H = 10.0;
    realm2d.createSprite(
      {
        dimensions: [HALF_W * 2 + BORDER_THICKNESS * 2, BORDER_THICKNESS],
        materialId: matBorder,
        castShadow: false,
        receiveShadow: true
      },
      { position: [0, HALF_H + BORDER_THICKNESS * 0.5], zLayer: 0 }
    );
    realm2d.createSprite(
      {
        dimensions: [HALF_W * 2 + BORDER_THICKNESS * 2, BORDER_THICKNESS],
        materialId: matBorder,
        castShadow: false,
        receiveShadow: true
      },
      { position: [0, -HALF_H - BORDER_THICKNESS * 0.5], zLayer: 0 }
    );
    realm2d.createSprite(
      {
        dimensions: [BORDER_THICKNESS, HALF_H * 2],
        materialId: matBorder,
        castShadow: false,
        receiveShadow: true
      },
      { position: [-HALF_W - BORDER_THICKNESS * 0.5, 0], zLayer: 0 }
    );
    realm2d.createSprite(
      {
        dimensions: [BORDER_THICKNESS, HALF_H * 2],
        materialId: matBorder,
        castShadow: false,
        receiveShadow: true
      },
      { position: [HALF_W + BORDER_THICKNESS * 0.5, 0], zLayer: 0 }
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

    realm2d.createShape(
      {
        kind: 'rectangle',
        size: [2.2, 2.2],
        materialId: matWall,
        castShadow: true,
        receiveShadow: true
      },
      { position: [-6.5, 4.0], zLayer: 1 }
    );
    realm2d.createShape(
      {
        kind: 'circle',
        radius: 1.3,
        segments: 32,
        materialId: matRoundPillar,
        castShadow: true,
        receiveShadow: true
      },
      { position: [6.5, 4.0], zLayer: 1 }
    );
    realm2d.createShape(
      {
        kind: 'polygon',
        vertices: hexVertices,
        materialId: matHexPillar,
        castShadow: true,
        receiveShadow: true
      },
      { position: [-6.5, -4.0], zLayer: 1 }
    );
    realm2d.createShape(
      {
        kind: 'polygon',
        vertices: octVertices,
        materialId: matOctPillar,
        castShadow: true,
        receiveShadow: true
      },
      { position: [6.5, -4.0], zLayer: 1 }
    );

    realm2d.createSprite(
      {
        dimensions: [2.0, 1.4],
        materialId: matCrate,
        castShadow: true,
        receiveShadow: true,
        heightRange: [2.0, 4.0]
      },
      { position: [-2.0, 1.5], rotation: 0.25, zLayer: 1 }
    );
    const crate2 = realm2d.createSprite(
      { dimensions: [1.6, 1.6], materialId: matCrate, castShadow: true, receiveShadow: true },
      { position: [3.5, -1.95], rotation: -0.45, zLayer: 1 }
    );
    const centerCrystal = realm2d.createShape(
      {
        kind: 'rectangle',
        size: [2.5, 2.5],
        materialId: matCrystal,
        castShadow: true,
        receiveShadow: true
      },
      { position: [0, 0], rotation: 0.785, zLayer: 2 }
    );

    realm2d.animateModel(
      crate2,
      { position: [3.5, -1.65], rotation: -0.35, scale: [1, 1] },
      { duration: 2.4, delay: 0, easing: 'easeInOutSine', loopMode: 'pingPong' },
      runtime.animation
    );
    realm2d.animateModel(
      centerCrystal,
      { position: [0, 0], rotation: 6.28318, scale: [1, 1] },
      { duration: 7.8, delay: 0, easing: 'linear', loopMode: 'loop' },
      runtime.animation
    );

    let playerPos: [number, number] = [0.0, -5.5];
    let playerZ = 3.0;
    let lightRadius = 0.45;
    let playerRange = 42.0;
    let ambientFactor = 0.15;
    let shadowsEnabled = true;

    const syncShadowConfig = () => {
      realm2d.setShadowConfig({
        ambient: ambientFactor,
        lightRadius,
        angularResolution: 1024,
        shadowContactOffset: 0.0
      });
    };
    syncShadowConfig();

    const playerLight = realm2d.createLight(
      {
        color: [1.0, 0.8, 0.5],
        intensity: 2.2,
        range: playerRange,
        lightRadius,
        castShadow: true,
        active: true
      },
      { position: playerPos, zLayer: Math.round(playerZ) }
    );
    const orbitLight = realm2d.createLight(
      {
        color: [0.1, 0.85, 1.0],
        intensity: 1.2,
        range: 32.0,
        lightRadius: 0.35,
        castShadow: true,
        active: true
      },
      { position: [-5.0, 0.0], zLayer: 2 }
    );
    realm2d.createLight(
      {
        color: [0.9, 0.2, 0.95],
        intensity: 1.0,
        range: 32.0,
        lightRadius: 0.4,
        castShadow: true,
        active: true
      },
      { position: [0.0, 6.0], zLayer: 3 }
    );

    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.06, 0.07, 0.09, 1.0]
    });

    const updatePlayerLight = () => {
      const lc = realm2d.world.getComponent<Light2DComponent>(playerLight, 'Light2D');
      if (lc) {
        lc.desc = {
          color: [1.0, 0.8, 0.5],
          intensity: 2.2,
          range: playerRange,
          lightRadius,
          castShadow: shadowsEnabled,
          active: true
        };
        lc.isDirty = true;
      }
      const mc = realm2d.world.getComponent<Model2DComponent>(playerLight, 'Model2D');
      if (mc) {
        mc.setPosition(playerPos[0], playerPos[1]);
        mc.zLayer = Math.round(playerZ);
      }
    };

    const keysDown = new Set<string>();
    let isMouseDown = false;
    let orbitAngle = 0;
    const camPos: [number, number] = [0, 0];

    runtime.on('window', (ev) => {
      if (ev.type === 'resized') windowSize = [ev.width, ev.height];
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input') {
        const key = ev.logicalKey.toLowerCase();
        if (ev.state === 'pressed') {
          keysDown.add(key);
          if (isKey(ev, 'space', ' ')) {
            shadowsEnabled = !shadowsEnabled;
            updatePlayerLight();
          } else if (isKey(ev, '1', '2')) {
            lightRadius = isKey(ev, '1')
              ? Math.max(0.05, lightRadius - 0.1)
              : Math.min(2.0, lightRadius + 0.1);
            syncShadowConfig();
            updatePlayerLight();
          } else if (isKey(ev, '3', '4')) {
            ambientFactor = isKey(ev, '3')
              ? Math.max(0.01, ambientFactor - 0.02)
              : Math.min(0.5, ambientFactor + 0.02);
            syncShadowConfig();
          } else if (isKey(ev, '5', '6')) {
            playerRange = isKey(ev, '5')
              ? Math.max(12.0, playerRange - 6.0)
              : Math.min(120.0, playerRange + 6.0);
            updatePlayerLight();
          } else if (isKey(ev, '7', '8')) {
            playerZ = isKey(ev, '7')
              ? Math.max(-2.0, playerZ - 1.0)
              : Math.min(10.0, playerZ + 1.0);
            updatePlayerLight();
          } else if (isKey(ev, 'r')) {
            playerPos = [0.0, -5.5];
            playerZ = 3.0;
            lightRadius = 0.45;
            playerRange = 42.0;
            ambientFactor = 0.15;
            shadowsEnabled = true;
            syncShadowConfig();
            updatePlayerLight();
          }
        } else {
          keysDown.delete(key);
        }
      }
    });

    runtime.on('pointer', (ev) => {
      if (ev.type === 'button') isMouseDown = ev.state === 'pressed';
      if (isMouseDown && (ev.type === 'button' || ev.type === 'move')) {
        const aspect = windowSize[0] / Math.max(1, windowSize[1]);
        playerPos[0] =
          ((ev.position[0] / windowSize[0]) * 2.0 - 1.0) * (WORLD_HEIGHT * 0.5 * aspect);
        playerPos[1] = (1.0 - (ev.position[1] / windowSize[1]) * 2.0) * (WORLD_HEIGHT * 0.5);
      }
    });

    runtime.on('tick', ({ dt }) => {
      const moveSpeed = 12.0 * dt;
      if (keysDown.has('w') || keysDown.has('arrowup'))
        playerPos[1] = Math.min(HALF_H - 1.0, playerPos[1] + moveSpeed);
      if (keysDown.has('s') || keysDown.has('arrowdown'))
        playerPos[1] = Math.max(-HALF_H + 1.0, playerPos[1] - moveSpeed);
      if (keysDown.has('a') || keysDown.has('arrowleft'))
        playerPos[0] = Math.max(-HALF_W + 1.0, playerPos[0] - moveSpeed);
      if (keysDown.has('d') || keysDown.has('arrowright'))
        playerPos[0] = Math.min(HALF_W - 1.0, playerPos[0] + moveSpeed);

      camPos[0] += (playerPos[0] * 0.08 - camPos[0]) * 3.0 * dt;
      camPos[1] += (playerPos[1] * 0.08 - camPos[1]) * 3.0 * dt;
      realm2d.world
        .getComponent<Model2DComponent>(camera.entityId, 'Model2D')
        ?.setPosition(camPos[0], camPos[1]);

      const playerModel = realm2d.world.getComponent<Model2DComponent>(playerLight, 'Model2D');
      if (playerModel) {
        playerModel.setPosition(playerPos[0], playerPos[1]);
        playerModel.zLayer = Math.round(playerZ);
      }

      orbitAngle += 1.2 * dt;
      realm2d.world
        .getComponent<Model2DComponent>(orbitLight, 'Model2D')
        ?.setPosition(Math.cos(orbitAngle) * 8.5, Math.sin(orbitAngle * 1.5) * 4.5);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemo2d1();
}
