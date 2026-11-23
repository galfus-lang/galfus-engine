/**
 * Realm 3D Demo 3D-13: Forward PBR Decals, Occluded Projectors & UV-Space Baked Tattoos
 *
 * Controls:
 * - [T] Stamp a new permanent UV-space tattoo onto the rotating hero sphere
 * - [C] Clear the hero sphere's tattoo texture back to clean ceramic
 * - [O] Toggle projector depth occlusion on the perspective wall projector
 * - [Space] Pause / resume animation
 * - [Esc] / [Q] Exit
 */
import { isKey, type Model3DComponent, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import { createCheckerTexture, createParticleAtlasTexture } from '../common/textures';

const LAYER_WALL = 0b0001;
const LAYER_OCCLUDER = 0b0010;
const LAYER_HERO = 0b0100;

function createSolidRgba(size: number, rgba: [number, number, number, number]): Uint8Array {
  const buf = new Uint8Array(size * size * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = rgba[0];
    buf[i + 1] = rgba[1];
    buf[i + 2] = rgba[2];
    buf[i + 3] = rgba[3];
  }
  return buf;
}

export async function runDemo3d13(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Demo 3D-13: Forward PBR Decals, Occluded Projectors & UV Tattoos',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    const camPos: [number, number, number] = [0, 3.0, 9.2];
    const camTarget: [number, number, number] = [0, 1.8, -0.5];
    const camera = realm3d.createCamera(
      { fovY: 48, near: 0.1, far: 120, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.14, 0.16, 0.22, 0.35],
      exposure: 1.15,
      skybox: {
        mode: 'procedural',
        skyColor: [0.04, 0.07, 0.16, 1],
        horizonColor: [0.2, 0.32, 0.56, 1],
        groundColor: [0.05, 0.05, 0.07, 1],
        sunDirection: [0.35, 0.85, 0.4, 0],
        sunColor: [1, 0.95, 0.88, 2.4],
        intensity: 1
      }
    });

    const sunPos: [number, number, number] = [6, 11, 8];
    realm3d.createLight(
      { kind: 'directional', color: [1, 0.95, 0.88], intensity: 1, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );
    realm3d.createLight(
      { kind: 'point', color: [0.35, 0.75, 1.0], intensity: 10, range: 16, castShadow: false },
      { position: [-4.5, 3.2, 3.0] }
    );

    // Procedural textures for decals, projector gobo, and writable UV tattoo canvas
    const atlas = createParticleAtlasTexture(64);
    const decalTexId = runtime.resources.createTexture(atlas.pixels, {
      label: 'Decal Atlas',
      width: atlas.width,
      height: atlas.height,
      format: 'rgba8UnormSrgb'
    });
    const checker = createCheckerTexture(128, [255, 220, 90, 255], [40, 140, 255, 255], 16);
    const goboTexId = runtime.resources.createTexture(checker.pixels, {
      label: 'Projector Gobo',
      width: checker.width,
      height: checker.height,
      format: 'rgba8UnormSrgb'
    });
    const tattooTexId = runtime.resources.createTexture(
      createSolidRgba(256, [235, 215, 198, 255]),
      {
        label: 'Hero UV Tattoo Canvas',
        width: 256,
        height: 256,
        format: 'rgba8UnormSrgb'
      }
    );

    const wallMat = realm3d.createMaterial({
      baseColor: [0.76, 0.78, 0.82, 1],
      metallic: 0.05,
      roughness: 0.75
    }).materialId;
    const occluderMat = realm3d.createMaterial({
      baseColor: [0.22, 0.25, 0.32, 1],
      metallic: 0.7,
      roughness: 0.3
    }).materialId;
    const heroMat = realm3d.createMaterial({
      baseColor: [1, 1, 1, 1],
      albedoTextureId: tattooTexId,
      metallic: 0.15,
      roughness: 0.38
    }).materialId;

    const floorGeo = realm3d.createGeometry({ kind: 'plane', width: 18, depth: 14 }).geometryId;
    const wallGeo = realm3d.createGeometry({ kind: 'cube', size: 1 }).geometryId;
    const heroGeo = realm3d.createGeometry({
      kind: 'sphere',
      radius: 1.25,
      rings: 24,
      sectors: 32
    }).geometryId;

    // Floor & Back Wall (LAYER_WALL)
    realm3d.createModel(
      { geometryId: floorGeo, materialId: wallMat, layerMask: LAYER_WALL },
      { position: [0, 0, 0] }
    );
    realm3d.createModel(
      { geometryId: wallGeo, materialId: wallMat, layerMask: LAYER_WALL },
      { position: [0, 3.0, -4.0], scale: [14, 6, 0.3] }
    );

    // Oscillating Occluder Pillar (blocks perspective projector on the right)
    const occluderEnt = realm3d.createModel(
      { geometryId: wallGeo, materialId: occluderMat, layerMask: LAYER_OCCLUDER },
      { position: [3.2, 2.4, -1.2], scale: [0.9, 2.8, 0.5] }
    );

    // Rotating Hero Sphere (left-center, receives permanent UV-space baked tattoos!)
    const heroEnt = realm3d.createModel(
      { geometryId: heroGeo, materialId: heroMat, layerMask: LAYER_HERO },
      { position: [-2.6, 1.9, 0.4] }
    );
    const heroModelId = realm3d.world.getComponent<Model3DComponent>(heroEnt, 'Model3D')!.modelId;

    realm3d.flush();

    // Phase 3A: Forward PBR Orthographic Decal on floor (receives PBR lighting & shadows)
    const floorDecalPos: [number, number, number] = [0.2, 0.6, 1.8];
    const floorDecalRot = utils3D.quatFromLookAt(floorDecalPos, [0.2, 0.0, 1.8]);
    realm3d.createProjector(
      1,
      {
        kind: 'orthographic',
        blendMode: 'alpha',
        textureId: decalTexId,
        uvRect: [0, 0, 0.5, 0.5],
        color: [1.0, 0.25, 0.35, 0.95],
        size: [2.4, 2.4, 2.0],
        roughnessOverride: 0.2,
        layerMask: LAYER_WALL
      },
      { position: floorDecalPos, rotation: floorDecalRot, scale: [1, 1, 1] }
    );

    // Phase 3B: Occluded Perspective Texture Projector aimed at the right side of the back wall
    let occlusionEnabled = true;
    const wallProjPos: [number, number, number] = [3.2, 2.5, 2.8];
    const wallProjTf = {
      position: wallProjPos,
      rotation: utils3D.quatFromLookAt(wallProjPos, [3.2, 2.4, -4.0]),
      scale: [1, 1, 1] as [number, number, number]
    };
    const updateWallProjector = () => {
      realm3d.createProjector(
        2,
        {
          kind: 'perspective',
          blendMode: 'alpha',
          textureId: goboTexId,
          color: [1, 1, 1, 0.9],
          fovY: (42 * Math.PI) / 180,
          aspect: 1.25,
          near: 0.3,
          far: 12.0,
          layerMask: LAYER_WALL,
          occlusionMask: LAYER_OCCLUDER | LAYER_WALL,
          castOcclusion: occlusionEnabled
        },
        wallProjTf
      );
    };
    updateWallProjector();

    // Phase 4: UV-Space Tattoo Baking helper (stamps directly onto hero sphere's current pose!)
    const tattooColors: [number, number, number, number][] = [
      [0.95, 0.18, 0.32, 0.95],
      [0.12, 0.45, 0.95, 0.95],
      [0.12, 0.78, 0.45, 0.95],
      [0.85, 0.35, 0.95, 0.95]
    ];
    const atlasRects: [number, number, number, number][] = [
      [0, 0, 0.5, 0.5],
      [0.5, 0, 1, 0.5],
      [0, 0.5, 0.5, 1],
      [0.5, 0.5, 1, 1]
    ];
    let stampIndex = 0;
    const stampTattoo = (clear = false) => {
      const i = stampIndex++ % tattooColors.length;
      const stampPos: [number, number, number] = [-2.6, 1.9 + ((i % 2) * 0.45 - 0.22), 2.2];
      realm3d.bakeUvDecal(
        {
          modelId: heroModelId,
          targetTextureId: tattooTexId,
          decalTextureId: clear ? undefined : decalTexId,
          kind: 'orthographic',
          blendMode: 'alpha',
          color: clear ? [0, 0, 0, 0] : tattooColors[i]!,
          uvRect: atlasRects[i]!,
          size: [0.95, 0.95, 3.0],
          angleFade: 0.3,
          useSkinnedPose: true,
          clearTarget: clear,
          clearColor: [235 / 255, 215 / 255, 198 / 255, 1]
        },
        {
          position: stampPos,
          rotation: utils3D.quatFromLookAt(stampPos, [-2.6, 1.9, 0.4]),
          scale: [1, 1, 1]
        }
      );
    };

    runtime.multiverse.createInvocation({
      targetId,
      realmId: realm3d.realmId,
      cameraSlot: 1,
      clearColor: [0.03, 0.04, 0.06, 1]
    });

    let elapsed = 0;
    let paused = false;
    let nextAutoStamp = 0.25;
    let autoStampCount = 0;

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed' || ev.repeat) return;
      if (isKey(ev, 'Space')) paused = !paused;
      if (isKey(ev, 'KeyT')) stampTattoo(false);
      if (isKey(ev, 'KeyC')) stampTattoo(true);
      if (isKey(ev, 'KeyO')) {
        occlusionEnabled = !occlusionEnabled;
        updateWallProjector();
      }
    });

    runtime.on('tick', ({ dt }) => {
      if (!paused) elapsed += dt;

      // Rotate hero sphere so baked UV tattoos visibly travel with the mesh surface
      const half = elapsed * 0.425;
      realm3d.world
        .getComponent<Model3DComponent>(heroEnt, 'Model3D')
        ?.setRotation(0, Math.sin(half), 0, Math.cos(half));

      // Stamp 4 initial tattoos around the sphere automatically during the first few seconds
      if (autoStampCount < 4 && elapsed >= nextAutoStamp) {
        stampTattoo(false);
        autoStampCount++;
        nextAutoStamp += 1.6;
      }

      // Oscillate the occluder pillar across the perspective projector beam
      realm3d.world
        .getComponent<Model3DComponent>(occluderEnt, 'Model3D')
        ?.setPosition(3.2 + Math.sin(elapsed * 1.4) * 1.4, 2.4, -1.2);

      // Gently sweep the floor decal
      const fx = 0.2 + Math.sin(elapsed * 0.9) * 0.6;
      realm3d.setProjectorTransform(1, {
        position: [fx, 0.6, 1.8],
        rotation: floorDecalRot,
        scale: [1, 1, 1]
      });
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['Escape', 'KeyQ'] });
  } finally {
    runtime.dispose();
  }
}
