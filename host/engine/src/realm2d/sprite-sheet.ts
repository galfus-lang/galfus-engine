import { assertValidLogicalId } from '@galfus/transport-types';
import type { EntityId } from '../ecs/entity';
import type { Realm2D } from './realm';

/** Pixel-space rectangle in the source texture: [x, y, width, height]. */
export type SpriteFrameRect = readonly [number, number, number, number];
export type SpriteFrameKey = number | string;
export type SpriteUvRect = [number, number, number, number];

export interface SpriteSheetGrid {
  readonly columns: number;
  readonly rows: number;
  readonly frameSize: readonly [number, number];
  /** Offset from the upper-left texture corner, in pixels. */
  readonly margin?: readonly [number, number];
  /** Space between consecutive frames, in pixels. */
  readonly spacing?: readonly [number, number];
  /** Number of valid cells, in row-major order; defaults to all cells. */
  readonly frameCount?: number;
  readonly names?: Readonly<Record<string, number>>;
}

export interface SpriteSheetFrame {
  readonly name?: string;
  readonly rect: SpriteFrameRect;
}

export type SpriteSheetOptions = {
  /** Borrowed logical texture ID. Its lifetime remains the caller's responsibility. */
  readonly textureId: number;
  readonly textureSize: readonly [number, number];
} & (
  | { readonly grid: SpriteSheetGrid; readonly frames?: never }
  | {
      readonly frames: readonly SpriteSheetFrame[];
      readonly grid?: never;
    }
);

/** Minimal native or host-side SpritePanel target, without coupling engine to UI. */
export type SpritePanelUvTarget =
  { setSpriteUvRect(uvRect: SpriteUvRect): unknown } | { setUvRect(uvRect: SpriteUvRect): unknown };

function integer(value: number, label: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min)
    throw new RangeError(`${label} must be a safe integer greater than or equal to ${min}.`);
}

function validateRect(rect: SpriteFrameRect, width: number, height: number): void {
  if (!Array.isArray(rect) || rect.length !== 4)
    throw new TypeError('Frame rectangle must contain four numbers.');
  const [x, y, w, h] = rect;
  integer(x, 'Frame x', 0);
  integer(y, 'Frame y', 0);
  integer(w, 'Frame width', 1);
  integer(h, 'Frame height', 1);
  if (x + w > width || y + h > height) throw new RangeError('Frame is outside the texture.');
}

/** Immutable atlas metadata. A sheet never owns or disposes its texture. */
export class SpriteSheet {
  readonly textureId: number;
  readonly frameCount: number;
  readonly textureSize: readonly [number, number];
  private readonly rects: readonly SpriteFrameRect[];
  private readonly names: ReadonlyMap<string, number>;

  constructor(options: SpriteSheetOptions) {
    assertValidLogicalId(options.textureId, 'TextureId');
    if ((options.grid === undefined) === (options.frames === undefined))
      throw new TypeError('Provide either a grid or explicit frames.');
    if (!Array.isArray(options.textureSize) || options.textureSize.length !== 2)
      throw new TypeError('Texture size must contain width and height.');
    const [width, height] = options.textureSize;
    integer(width, 'Texture width', 1);
    integer(height, 'Texture height', 1);
    const names = new Map<string, number>();
    const addName = (name: string, index: number) => {
      if (typeof name !== 'string' || !name.trim())
        throw new TypeError('Frame name must not be empty.');
      if (names.has(name)) throw new Error(`Duplicate frame name: ${name}`);
      names.set(name, index);
    };
    let rects: SpriteFrameRect[];
    if (options.grid) {
      const grid = options.grid;
      integer(grid.columns, 'Grid columns', 1);
      integer(grid.rows, 'Grid rows', 1);
      if (!Array.isArray(grid.frameSize) || grid.frameSize.length !== 2)
        throw new TypeError('Frame size must contain width and height.');
      const [fw, fh] = grid.frameSize;
      const margin = grid.margin ?? [0, 0];
      const spacing = grid.spacing ?? [0, 0];
      if (
        !Array.isArray(margin) ||
        margin.length !== 2 ||
        !Array.isArray(spacing) ||
        spacing.length !== 2
      )
        throw new TypeError('Margin and spacing must each contain two values.');
      integer(fw, 'Frame width', 1);
      integer(fh, 'Frame height', 1);
      integer(margin[0], 'Horizontal margin', 0);
      integer(margin[1], 'Vertical margin', 0);
      integer(spacing[0], 'Horizontal spacing', 0);
      integer(spacing[1], 'Vertical spacing', 0);
      const cells = grid.columns * grid.rows;
      if (!Number.isSafeInteger(cells)) throw new RangeError('Grid is too large.');
      const count = grid.frameCount ?? cells;
      integer(count, 'Frame count', 1);
      if (count > cells) throw new RangeError('Frame count exceeds grid capacity.');
      // Limit metadata allocation and reject grids that cannot fit before expanding them.
      if (
        margin[0] + grid.columns * fw + (grid.columns - 1) * spacing[0] > width ||
        margin[1] + grid.rows * fh + (grid.rows - 1) * spacing[1] > height
      )
        throw new RangeError('Grid is outside the texture.');
      if (count > 65536) throw new RangeError('Sprite sheet exceeds 65536 frames.');
      rects = Array.from({ length: count }, (_, index) => [
        margin[0] + (index % grid.columns) * (fw + spacing[0]),
        margin[1] + Math.floor(index / grid.columns) * (fh + spacing[1]),
        fw,
        fh
      ]);
      for (const [name, index] of Object.entries(grid.names ?? {})) {
        integer(index, `Frame index for ${name}`, 0);
        if (index >= count) throw new RangeError(`Frame index for ${name} is out of range.`);
        addName(name, index);
      }
    } else {
      if (
        !Array.isArray(options.frames) ||
        options.frames.length === 0 ||
        options.frames.length > 65536
      )
        throw new RangeError('A sprite sheet requires 1 to 65536 frames.');
      rects = options.frames.map((frame, index): SpriteFrameRect => {
        validateRect(frame.rect, width, height);
        if (frame.name !== undefined) addName(frame.name, index);
        return [frame.rect[0], frame.rect[1], frame.rect[2], frame.rect[3]];
      });
    }
    this.textureId = options.textureId;
    this.textureSize = Object.freeze([width, height] as const);
    this.frameCount = rects.length;
    this.rects = rects;
    this.names = names;
    Object.freeze(this);
  }

  /** Returns normalized [u0, v0, u1, v1] coordinates for a named or numbered frame. */
  uvRect(frame: SpriteFrameKey): SpriteUvRect {
    const index = typeof frame === 'string' ? this.names.get(frame) : frame;
    if (
      index === undefined ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= this.frameCount
    )
      throw new RangeError(`Unknown sprite frame: ${String(frame)}`);
    const [x, y, width, height] = this.rects[index]!;
    return [
      x / this.textureSize[0],
      y / this.textureSize[1],
      (x + width) / this.textureSize[0],
      (y + height) / this.textureSize[1]
    ];
  }

  /** Updates a Sprite2D entity's UV. Its material must already reference this sheet's texture. */
  applyToSprite(
    realm: Pick<Realm2D, 'setSpriteUvRect'>,
    entityId: EntityId,
    frame: SpriteFrameKey
  ): void {
    realm.setSpriteUvRect(entityId, this.uvRect(frame));
  }

  /** Updates a SpritePanel's UV. The panel must already reference this sheet's texture. */
  applyToPanel(panel: SpritePanelUvTarget, frame: SpriteFrameKey): void {
    const uv = this.uvRect(frame);
    if ('setSpriteUvRect' in panel) panel.setSpriteUvRect(uv);
    else panel.setUvRect(uv);
  }
}
