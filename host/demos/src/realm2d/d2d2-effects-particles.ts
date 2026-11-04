import { isKey, type Model2DComponent } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import { createParticleAtlasTexture } from '../common/textures';

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

export async function runDemo2d2(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 2D-2 Material Shaders & Textured Particles',
    options,
    [1024, 768]
  );

  try {
    const realm2d = runtime.createRealm2D();

    const atlasData = createParticleAtlasTexture(64);
    const atlasTex = runtime.resources.createTexture(atlasData.pixels, {
      width: atlasData.width,
      height: atlasData.height,
      format: 'rgba8UnormSrgb'
    });

    const WORLD_HEIGHT = 18.0;
    const camera = realm2d.createCamera(
      { orthoScale: WORLD_HEIGHT, near: -100, far: 100, cameraSlot: 1, active: true },
      { position: [0, 0] }
    );

    const matFloor = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.12, 0.14, 0.18, 1.0]
    });
    const matBorder = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.22, 0.26, 0.35, 1.0]
    });
    const matPlasma = realm2d.createMaterial({
      surfaceType: 'transparent',
      baseColor: [0.1, 0.2, 0.85, 0.95],
      shaderEffect: PLASMA_SURFACE_SNIPPET,
      customParams: [
        [4.0, 10.0, 4.0, 0.0],
        [0.95, 0.2, 0.8, 1.0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ]
    });
    const matHolo = realm2d.createMaterial({
      surfaceType: 'transparent',
      baseColor: [0.05, 0.7, 0.85, 0.85],
      shaderEffect: HOLO_SURFACE_SNIPPET,
      customParams: [
        [8.0, 50.0, 0.0, 0.0],
        [0.1, 0.95, 0.85, 1.0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ]
    });
    const matLava = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.4, 0.08, 0.02, 1.0],
      shaderEffect: LAVA_SURFACE_SNIPPET,
      customParams: [
        [6.0, 2.5, 0.0, 0.0],
        [0.95, 0.35, 0.05, 1.0],
        [1.0, 0.85, 0.1, 1.0],
        [0, 0, 0, 0]
      ]
    });
    const matCaustic = realm2d.createMaterial({
      surfaceType: 'transparent',
      baseColor: [0.05, 0.35, 0.6, 0.8],
      shaderEffect: CAUSTIC_SURFACE_SNIPPET,
      customParams: [
        [8.0, 2.0, 0.0, 0.0],
        [0.4, 0.95, 0.9, 1.0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ]
    });
    const matSparksProcedural = realm2d.createMaterial({
      surfaceType: 'additive',
      baseColor: [1.0, 0.7, 0.2, 1.0]
    });
    const matSparksTextured = realm2d.createMaterial({
      surfaceType: 'additive',
      baseColor: [1.0, 1.0, 1.0, 1.0],
      textureId: atlasTex
    });

    realm2d.createSprite(
      { dimensions: [28.0, 20.0], materialId: matFloor, castShadow: false, receiveShadow: true },
      { position: [0, 0], zLayer: -10 }
    );

    const BORDER_W = 26.0;
    const BORDER_H = 18.0;
    const BORDER_THICK = 0.8;
    realm2d.createSprite(
      {
        dimensions: [BORDER_W + BORDER_THICK * 2, BORDER_THICK],
        materialId: matBorder,
        castShadow: true,
        receiveShadow: true
      },
      { position: [0, BORDER_H * 0.5 + BORDER_THICK * 0.5], zLayer: 0 }
    );
    realm2d.createSprite(
      {
        dimensions: [BORDER_W + BORDER_THICK * 2, BORDER_THICK],
        materialId: matBorder,
        castShadow: true,
        receiveShadow: true
      },
      { position: [0, -BORDER_H * 0.5 - BORDER_THICK * 0.5], zLayer: 0 }
    );
    realm2d.createSprite(
      {
        dimensions: [BORDER_THICK, BORDER_H],
        materialId: matBorder,
        castShadow: true,
        receiveShadow: true
      },
      { position: [-BORDER_W * 0.5 - BORDER_THICK * 0.5, 0], zLayer: 0 }
    );
    realm2d.createSprite(
      {
        dimensions: [BORDER_THICK, BORDER_H],
        materialId: matBorder,
        castShadow: true,
        receiveShadow: true
      },
      { position: [BORDER_W * 0.5 + BORDER_THICK * 0.5, 0], zLayer: 0 }
    );

    realm2d.createShape(
      { kind: 'circle', radius: 2.2, materialId: matPlasma, castShadow: true, receiveShadow: true },
      { position: [-6.0, 4.0], zLayer: 1 }
    );
    const holoSprite = realm2d.createSprite(
      { dimensions: [4.4, 3.6], materialId: matHolo, castShadow: true, receiveShadow: true },
      { position: [6.0, 4.0], zLayer: 1 }
    );
    const lavaShape = realm2d.createShape(
      {
        kind: 'rectangle',
        size: [4.0, 3.6],
        materialId: matLava,
        castShadow: true,
        receiveShadow: true
      },
      { position: [-6.0, -4.0], rotation: 0.15, zLayer: 1 }
    );
    realm2d.createSprite(
      { dimensions: [4.4, 3.8], materialId: matCaustic, castShadow: true, receiveShadow: true },
      { position: [6.0, -4.0], zLayer: 1 }
    );
    const centerOrb = realm2d.createShape(
      {
        kind: 'rectangle',
        size: [2.8, 2.8],
        materialId: matPlasma,
        castShadow: true,
        receiveShadow: true
      },
      { position: [0, 0], rotation: 0.785, zLayer: 2 }
    );

    const emitterLava = realm2d.createParticleEmitter(
      {
        materialId: matSparksProcedural,
        maxParticles: 350,
        spawnRate: 40.0,
        lifetimeRange: [1.0, 2.2],
        speedRange: [1.2, 3.2],
        direction: [0.0, 1.0],
        spreadAngleRad: 0.9,
        gravity: [0.0, 0.6],
        drag: 0.15,
        startSizeRange: [0.2, 0.35],
        endSizeRange: [0.02, 0.08],
        startColor: [1.0, 0.85, 0.3, 1.0],
        endColor: [1.0, 0.15, 0.0, 0.0],
        emissionShape: { type: 'rectangle', extents: [3.2, 0.4] },
        zLayer: 5
      },
      { position: [-6.0, -2.4], zLayer: 5 }
    );

    const emitterPlasma = realm2d.createParticleEmitter(
      {
        materialId: matSparksTextured,
        maxParticles: 250,
        spawnRate: 35.0,
        lifetimeRange: [1.2, 2.6],
        speedRange: [1.0, 2.8],
        direction: [1.0, 0.0],
        spreadAngleRad: 6.28,
        drag: 0.35,
        startSizeRange: [0.35, 0.65],
        endSizeRange: [0.08, 0.18],
        startColor: [0.95, 0.3, 1.0, 1.0],
        endColor: [0.1, 0.8, 1.0, 0.0],
        uvRect: [0.0, 0.0, 0.5, 0.5],
        emissionShape: { type: 'circle', radius: 1.0 },
        zLayer: 5
      },
      { position: [-6.0, 4.0], zLayer: 5 }
    );

    const emitterCaustic = realm2d.createParticleEmitter(
      {
        materialId: matSparksTextured,
        maxParticles: 200,
        spawnRate: 28.0,
        lifetimeRange: [1.0, 2.2],
        speedRange: [0.6, 1.8],
        direction: [0.0, 1.0],
        spreadAngleRad: 1.6,
        drag: 0.25,
        startSizeRange: [0.28, 0.5],
        endSizeRange: [0.06, 0.14],
        startColor: [0.3, 1.0, 0.9, 1.0],
        endColor: [0.1, 0.4, 1.0, 0.0],
        uvRect: [0.5, 0.0, 1.0, 0.5],
        emissionShape: { type: 'rectangle', extents: [3.2, 1.2] },
        zLayer: 5
      },
      { position: [6.0, -4.0], zLayer: 5 }
    );

    realm2d.setShadowConfig({ ambient: 0.2, lightRadius: 0.45, angularResolution: 1024 });

    const orbitLight = realm2d.createLight(
      {
        color: [1.0, 0.95, 0.8],
        intensity: 2.5,
        range: 38.0,
        lightRadius: 0.4,
        castShadow: true,
        active: true
      },
      { position: [0, 3.0], zLayer: 3 }
    );
    realm2d.createLight(
      {
        color: [0.7, 0.3, 0.9],
        intensity: 1.2,
        range: 20.0,
        lightRadius: 0.5,
        castShadow: false,
        active: true
      },
      { position: [0, 0], zLayer: 2 }
    );

    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.06, 0.07, 0.09, 1.0]
    });

    let paused = false;
    let crystalRot = 0.785;
    let rotSpeed = 0.8;
    let orbitAngle = 0;
    let camPos: [number, number] = [0, 0];
    const keysDown = new Set<string>();

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input') {
        const key = ev.logicalKey.toLowerCase();
        if (ev.state === 'pressed') {
          keysDown.add(key);
          if (isKey(ev, 'space', ' ')) paused = !paused;
          else if (isKey(ev, 'p')) {
            realm2d.particleEmitterBurst(emitterLava, 60);
            realm2d.particleEmitterBurst(emitterPlasma, 60);
            realm2d.particleEmitterBurst(emitterCaustic, 60);
          } else if (isKey(ev, '1')) rotSpeed = Math.max(0.1, rotSpeed - 0.2);
          else if (isKey(ev, '2')) rotSpeed = Math.min(3.0, rotSpeed + 0.2);
          else if (isKey(ev, 'r')) {
            camPos = [0, 0];
            rotSpeed = 0.8;
            paused = false;
          }
        } else {
          keysDown.delete(key);
        }
      }
    });

    runtime.on('tick', ({ dt }) => {
      const camSpeed = 10.0 * dt;
      if (keysDown.has('w') || keysDown.has('arrowup')) camPos[1] += camSpeed;
      if (keysDown.has('s') || keysDown.has('arrowdown')) camPos[1] -= camSpeed;
      if (keysDown.has('a') || keysDown.has('arrowleft')) camPos[0] -= camSpeed;
      if (keysDown.has('d') || keysDown.has('arrowright')) camPos[0] += camSpeed;

      realm2d.world
        .getComponent<Model2DComponent>(camera.entityId, 'Model2D')
        ?.setPosition(camPos[0], camPos[1]);

      if (!paused) {
        orbitAngle += 1.1 * dt;
        crystalRot += rotSpeed * dt;

        realm2d.world
          .getComponent<Model2DComponent>(orbitLight, 'Model2D')
          ?.setPosition(Math.cos(orbitAngle) * 7.5, Math.sin(orbitAngle * 1.3) * 5.0);
        realm2d.world.getComponent<Model2DComponent>(centerOrb, 'Model2D')?.setRotation(crystalRot);
        realm2d.world
          .getComponent<Model2DComponent>(holoSprite, 'Model2D')
          ?.setPosition(6.0, 4.0 + Math.sin(orbitAngle * 1.8) * 0.12);
        realm2d.world
          .getComponent<Model2DComponent>(lavaShape, 'Model2D')
          ?.setRotation(0.15 + Math.sin(orbitAngle * 0.9) * 0.06);
      }
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemo2d2();
}
