/**
 * Realm 2D Demo 2D-4: Chunked Tilemap2D (128x128), Greedy Colliders, Polar Shadows & Live Painting
 *
 * Showcases the native chunked `Tilemap2D` system (`128x128 = 16,384` tiles in `32x32` chunks):
 * - Procedural 4x2 tileset atlas with half-texel inset (`atlasSizePx`) for zero seam bleeding.
 * - Greedy-merged Rapier 2D colliders (`TILE_FLAG.SOLID`) for smooth player collision.
 * - Greedy-merged 2D polar soft shadow occluders (`TILE_FLAG.BLOCKS_LIGHT`) with a player torch.
 * - Real-time O(1) tile editing (`[B]` toggles a wall block in front of the player).
 * - Optional Debug Observer split-screen (`[C]` toggles zoomed-out `cullCameraSlot: 0` chunk culling view).
 *
 * Controls:
 * - [W/A/S/D] or [Arrows]: Move physics player across the 128x128 dungeon
 * - [B]: Place / remove a solid shadow-casting brick tile right in front of the player
 * - [C]: Toggle split-screen Debug Observer (`cullCameraSlot: 0` chunk culling visualizer)
 * - [Esc] / [Q]: Exit
 */
import {
  attachPhysics2D,
  getKey,
  isKey,
  type Light2DComponent,
  type Model2DComponent,
  packTileCells,
  TILE_FLAG
} from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

/** Builds a procedural 4x2 tileset atlas (256x128 RGBA8, 64x64 per tile). */
function createTilesetAtlas(): { pixels: Uint8Array; width: number; height: number } {
  const cell = 64;
  const cols = 4;
  const rows = 2;
  const width = cell * cols;
  const height = cell * rows;
  const pixels = new Uint8Array(width * height * 4);

  const palette: [number, number, number][] = [
    [54, 72, 62], // 1: Mossy stone floor
    [66, 72, 84], // 2: Slate floor
    [136, 78, 64], // 3: Brick wall (solid + blocks light)
    [98, 108, 122], // 4: Pillar stone (solid + blocks light)
    [152, 114, 62], // 5: Wooden crate (solid + blocks light)
    [42, 92, 148], // 6: Deep water
    [194, 152, 54], // 7: Gold inlaid tile
    [82, 124, 74] // 8: Courtyard grass
  ];

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const tileIdx = ty * cols + tx;
      const [br, bg, bb] = palette[tileIdx]!;
      const isWall = tileIdx === 2 || tileIdx === 3 || tileIdx === 4;
      for (let py = 0; py < cell; py++) {
        for (let px = 0; px < cell; px++) {
          const border = px < 3 || py < 3 || px >= cell - 3 || py >= cell - 3;
          const brickMortar =
            tileIdx === 2 && (py % 16 < 2 || (px + (Math.floor(py / 16) % 2) * 16) % 32 < 2);
          const noise = Math.sin(px * 0.7 + py * 1.1 + tileIdx * 3.0) * 8;
          let mul = border ? (isWall ? 0.65 : 0.88) : 1.0;
          if (brickMortar) mul = 0.45;
          const gx = tx * cell + px;
          const gy = ty * cell + py;
          const off = (gy * width + gx) * 4;
          pixels[off] = Math.min(255, Math.max(0, Math.round(br * mul + noise)));
          pixels[off + 1] = Math.min(255, Math.max(0, Math.round(bg * mul + noise)));
          pixels[off + 2] = Math.min(255, Math.max(0, Math.round(bb * mul + noise)));
          pixels[off + 3] = 255;
        }
      }
    }
  }
  return { pixels, width, height };
}

export async function runDemo2d4(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 2D-4 Chunked Tilemap2D (128x128), Greedy Colliders & Polar Shadows',
    options,
    [1280, 720]
  );

  try {
    const realm2d = runtime.createRealm2D();
    const physics = await attachPhysics2D(runtime, realm2d, { gravity: [0, 0] });
    realm2d.setShadowConfig({ angularResolution: 512 });

    const atlas = createTilesetAtlas();
    const atlasTexId = runtime.resources.createTexture(atlas.pixels, {
      label: 'tilemap-2d4-atlas',
      width: atlas.width,
      height: atlas.height,
      format: 'rgba8UnormSrgb'
    });
    const tilemapMat = realm2d.createMaterial({
      surfaceType: 'opaque',
      textureId: atlasTexId,
      baseColor: [1, 1, 1, 1]
    });

    const mapW = 128;
    const mapH = 128;
    const tilemap = realm2d.createTilemap(
      {
        width: mapW,
        height: mapH,
        tileSize: [1.0, 1.0],
        chunkSize: 32,
        atlasColumns: 4,
        atlasRows: 2,
        atlasSizePx: [atlas.width, atlas.height],
        materialId: tilemapMat,
        zLayer: 0,
        castShadow: true,
        receiveShadow: true,
        generateColliders: true
      },
      { position: [0, 0] }
    );

    // Populate 128x128 procedural dungeon rooms + pillars + borders
    const wallFlags = TILE_FLAG.SOLID | TILE_FLAG.BLOCKS_LIGHT;
    const grid = new Array<{ tileId: number; flags: number }>(mapW * mapH);
    const isWallGrid = new Uint8Array(mapW * mapH);
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const idx = y * mapW + x;
        const border = x === 0 || y === 0 || x === mapW - 1 || y === mapH - 1;
        const roomWall =
          (x % 16 === 0 && y % 16 > 3 && y % 16 < 13) ||
          (y % 16 === 0 && x % 16 > 3 && x % 16 < 13);
        const pillar = x % 8 === 4 && y % 8 === 4 && (x !== 64 || y !== 64);
        const spawnClear = Math.abs(x - 64) <= 2 && Math.abs(y - 64) <= 2;

        if (!spawnClear && (border || roomWall)) {
          grid[idx] = { tileId: 3, flags: wallFlags };
          isWallGrid[idx] = 1;
        } else if (!spawnClear && pillar) {
          grid[idx] = { tileId: 4, flags: wallFlags };
          isWallGrid[idx] = 1;
        } else {
          const floorId = (x + y) % 7 === 0 ? 7 : (x + y) % 2 === 0 ? 1 : 2;
          grid[idx] = { tileId: floorId, flags: 0 };
        }
      }
    }
    tilemap.setTiles(0, 0, mapW, mapH, packTileCells(grid));

    // Dynamic physics player + warm torch light
    const playerMat = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.25, 0.92, 0.98, 1.0]
    });
    const player = realm2d.createShape(
      {
        kind: 'circle',
        radius: 0.36,
        materialId: playerMat,
        castShadow: false,
        receiveShadow: false
      },
      { position: [64.5, 64.5], zLayer: 3 }
    );
    realm2d.addCollider(player, { type: 'circle', radius: 0.36 });
    physics.addRigidBody(player, {
      type: 'dynamic',
      linearDamping: 8.0,
      lockRotations: true
    });

    const torch = realm2d.createLight(
      {
        color: [1.0, 0.84, 0.58],
        intensity: 2.6,
        range: 14.0,
        lightRadius: 0.35,
        castShadow: true,
        active: true
      },
      { position: [64.5, 64.5] }
    );

    const mainCam = realm2d.createCamera(
      { orthoScale: 16, near: -100, far: 100, cameraSlot: 0, active: true },
      { position: [64.5, 64.5] }
    );
    const debugCam = realm2d.createCamera(
      { orthoScale: 72, near: -100, far: 100, cameraSlot: 1, active: true, cullCameraSlot: 0 },
      { position: [64.5, 64.5] }
    );

    const mainInv = runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 0,
      viewport: { anchorX: 'left', anchorY: 'top', width: { vw: 100 }, height: { vh: 100 } },
      filters: [],
      zIndex: 0,
      enabled: true
    });
    const debugInv = runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { anchorX: 'right', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      filters: [],
      zIndex: 1,
      enabled: false
    });

    const held = new Set<string>();
    let facing: [number, number] = [1, 0];
    let splitDebug = false;

    const playerModel = realm2d.world.getComponent<Model2DComponent>(player, 'Model2D');
    const mainCamModel = realm2d.world.getComponent<Model2DComponent>(mainCam.entityId, 'Model2D');
    const debugCamModel = realm2d.world.getComponent<Model2DComponent>(
      debugCam.entityId,
      'Model2D'
    );
    const torchModel = realm2d.world.getComponent<Model2DComponent>(torch, 'Model2D');
    const torchLight = realm2d.world.getComponent<Light2DComponent>(torch, 'Light2D');

    runtime.on('keyboard', (e) => {
      if (e.type !== 'input') return;
      const key = getKey(e);
      if (e.state === 'pressed') {
        held.add(key);
        if (isKey(e, 'c')) {
          splitDebug = !splitDebug;
          runtime.multiverse.updateInvocation(mainInv, {
            viewport: {
              anchorX: 'left',
              anchorY: 'top',
              width: { vw: splitDebug ? 50 : 100 },
              height: { vh: 100 }
            }
          });
          runtime.multiverse.updateInvocation(debugInv, { enabled: splitDebug });
          console.log(`[2D-4] Debug Observer split-screen: ${splitDebug ? 'ON' : 'OFF'}`);
        } else if (isKey(e, 'b') && playerModel) {
          const px = playerModel.localMatrix[4] ?? 64.5;
          const py = playerModel.localMatrix[5] ?? 64.5;
          const tx = Math.max(1, Math.min(mapW - 2, Math.floor(px + facing[0] * 1.2)));
          const ty = Math.max(1, Math.min(mapH - 2, Math.floor(py + facing[1] * 1.2)));
          const idx = ty * mapW + tx;
          if (isWallGrid[idx]) {
            isWallGrid[idx] = 0;
            tilemap.setTile(tx, ty, 1, 0);
          } else {
            isWallGrid[idx] = 1;
            tilemap.setTile(tx, ty, 5, wallFlags);
          }
        }
      } else if (e.state === 'released') {
        held.delete(key);
      }
    });

    runtime.on('tick', () => {
      let mx = 0;
      let my = 0;
      if (held.has('a') || held.has('arrowleft')) mx -= 1;
      if (held.has('d') || held.has('arrowright')) mx += 1;
      if (held.has('w') || held.has('arrowup')) my += 1;
      if (held.has('s') || held.has('arrowdown')) my -= 1;

      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        mx /= len;
        my /= len;
        facing = [mx, my];
        physics.setLinearVelocity(player, [mx * 7.5, my * 7.5]);
      }

      const px = playerModel?.localMatrix[4] ?? 64.5;
      const py = playerModel?.localMatrix[5] ?? 64.5;
      mainCamModel?.setPosition(px, py);
      debugCamModel?.setPosition(px, py);
      torchModel?.setPosition(px, py);
      if (torchLight) torchLight.isDirty = true;
    });

    console.log(
      '[2D-4] 128x128 Chunked Tilemap2D | [WASD/Arrows] Move | [B] Place/Remove Crate Wall | [C] Toggle Chunk-Culling Debug View | [Esc/Q] Exit'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['Escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
