import type { DescSpec, FunctionSpec } from './types';

export const realm2dTilemapDescriptors: DescSpec[] = [
  {
    kind: 'object',
    name: 'Tilemap2DDesc',
    doc: 'Chunked 2D tilemap layer configuration with optional greedy-merged colliders and shadow occluders.',
    fields: {
      width: { type: 'number', doc: 'Grid width in tiles.' },
      height: { type: 'number', doc: 'Grid height in tiles.' },
      tileSize: {
        type: { tuple: ['number', 'number'] },
        doc: 'World-space dimensions of a single tile [width, height].'
      },
      chunkSize: {
        type: 'number',
        optional: true,
        doc: 'Chunk edge size in tiles (clamped 8..64, default 32).'
      },
      atlasColumns: { type: 'number', doc: 'Number of tile columns in the atlas texture.' },
      atlasRows: { type: 'number', doc: 'Number of tile rows in the atlas texture.' },
      atlasSizePx: {
        type: { tuple: ['number', 'number'] },
        optional: true,
        doc: 'Optional atlas pixel dimensions [width, height] for half-texel UV inset.'
      },
      tilePaddingPx: {
        type: 'number',
        optional: true,
        doc: 'Optional inter-tile padding in pixels (requires atlasSizePx).'
      },
      materialId: { type: 'number', optional: true },
      zLayer: { type: 'number', optional: true },
      drawOrder: { type: 'number', optional: true },
      layerMask: { type: 'number', optional: true },
      castShadow: { type: 'boolean', optional: true },
      receiveShadow: { type: 'boolean', optional: true },
      shadowLayerMask: { type: 'number', optional: true },
      shadowHeight: { type: 'number', optional: true },
      heightRange: { type: { tuple: ['number', 'number'] }, optional: true },
      cullingMode: { type: { enum: ['auto', 'frustumOnly', 'alwaysRender'] }, optional: true },
      cullMargin: { type: 'number', optional: true },
      distanceRange: { type: { tuple: ['number', 'number'] }, optional: true },
      generateColliders: {
        type: 'boolean',
        optional: true,
        doc: 'Generate greedy-merged fixed Rapier 2D box colliders for solid tiles.'
      }
    }
  }
];

export const realm2dTilemapFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_realm_2d_create_tilemap',
    methodName: 'realm2dCreateTilemap',
    doc: 'Creates or replaces a chunked Tilemap2D in the 2D Realm.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'tilemapId', type: 'u32', doc: 'Logical ID of the Tilemap.' },
      { name: 'desc', type: { json: 'Tilemap2DDesc' }, doc: 'Tilemap configuration.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_tilemap_tile',
    methodName: 'realm2dSetTilemapTile',
    doc: 'Sets a single cell (x, y) in an existing Tilemap2D in O(1).',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'tilemapId', type: 'u32', doc: 'Logical ID of the Tilemap.' },
      { name: 'x', type: 'u32', doc: 'Tile X coordinate.' },
      { name: 'y', type: 'u32', doc: 'Tile Y coordinate.' },
      { name: 'tileId', type: 'u32', doc: '1-based atlas tile index (0 = empty).' },
      {
        name: 'flags',
        type: 'u32',
        doc: 'Bitflags (flipX=1, flipY=2, rot90=4, solid=8, blocksLight=16).'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_tilemap_tiles',
    methodName: 'realm2dSetTilemapTiles',
    doc: 'Bulk-updates a rectangular region of cells in an existing Tilemap2D from packed 4-byte TileCell2D bytes.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'tilemapId', type: 'u32', doc: 'Logical ID of the Tilemap.' },
      { name: 'x', type: 'u32', doc: 'Region origin X.' },
      { name: 'y', type: 'u32', doc: 'Region origin Y.' },
      { name: 'width', type: 'u32', doc: 'Region width in tiles.' },
      { name: 'height', type: 'u32', doc: 'Region height in tiles.' },
      { name: 'data', type: 'ptr', doc: 'Pointer to packed 4-byte TileCell2D array.' },
      { name: 'dataLen', type: 'u64', doc: 'Byte length of packed TileCell2D array.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_tilemap',
    methodName: 'realm2dDestroyTilemap',
    doc: 'Destroys an existing Tilemap2D and releases its chunks and generated colliders.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'tilemapId', type: 'u32', doc: 'Logical ID of the Tilemap.' }
    ],
    returnType: 'i32'
  }
];
