import type { GalfusEngine, Tilemap2DDesc, Transform2DDesc } from '@galfus/transport-types';

/** Bitflags for `TileCell2D` entries. */
export const TILE_FLAG = {
  FLIP_X: 1 << 0,
  FLIP_Y: 1 << 1,
  ROT_90: 1 << 2,
  SOLID: 1 << 3,
  BLOCKS_LIGHT: 1 << 4
} as const;

export interface TileCellInput {
  tileId: number;
  flags?: number;
  variant?: number;
}

/** Packs an array of `{ tileId, flags, variant }` cells into the compact 4-byte wire format. */
export function packTileCells(cells: readonly TileCellInput[]): Uint8Array {
  const bytes = new Uint8Array(cells.length * 4);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const id = c.tileId & 0xffff;
    const off = i * 4;
    bytes[off] = id & 0xff;
    bytes[off + 1] = (id >> 8) & 0xff;
    bytes[off + 2] = (c.flags ?? 0) & 0xff;
    bytes[off + 3] = (c.variant ?? 0) & 0xff;
  }
  return bytes;
}

/** Handle for mutating or destroying a chunked `Tilemap2D` resource. */
export interface Tilemap2DHandle {
  readonly tilemapId: number;
  setTile(x: number, y: number, tileId: number, flags?: number): void;
  setTiles(
    x: number,
    y: number,
    width: number,
    height: number,
    cells: Uint8Array | readonly TileCellInput[]
  ): void;
  destroy(): void;
}

export function createTilemap2DHandle(
  getEngine: () => GalfusEngine | null,
  realmId: number,
  tilemapId: number,
  desc: Tilemap2DDesc,
  transform?: Partial<Transform2DDesc>
): Tilemap2DHandle {
  const tf: Transform2DDesc = {
    position: transform?.position ?? [0, 0],
    rotation: transform?.rotation ?? 0,
    scale: transform?.scale ?? [1, 1],
    zLayer: transform?.zLayer ?? desc.zLayer ?? 0,
    drawOrder: transform?.drawOrder ?? desc.drawOrder ?? 0
  };
  getEngine()?.realm2dCreateTilemap(realmId, tilemapId, desc, tf);
  return {
    tilemapId,
    setTile(x: number, y: number, tileId: number, flags = 0): void {
      getEngine()?.realm2dSetTilemapTile(realmId, tilemapId, x, y, tileId, flags);
    },
    setTiles(
      x: number,
      y: number,
      width: number,
      height: number,
      cells: Uint8Array | readonly TileCellInput[]
    ): void {
      const bytes = cells instanceof Uint8Array ? cells : packTileCells(cells);
      getEngine()?.realm2dSetTilemapTiles(
        realmId,
        tilemapId,
        x,
        y,
        width,
        height,
        bytes,
        bytes.byteLength
      );
    },
    destroy(): void {
      getEngine()?.realm2dDestroyTilemap(realmId, tilemapId);
    }
  };
}
