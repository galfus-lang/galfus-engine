import {
  parseBorderColor,
  parseBorderRadius,
  parseBorderWidth,
  parseColorToRgba
} from '../layout/quad';
import type { UiColor } from '../layout/types';
import type { UiQuad2DDesc, UiText2DDesc } from '@galfus/transport-types';

import { _registerSpritePanelFactory, nextUiId, Panel, type PanelOptions } from './panel';

export type SpriteFit = 'cover' | 'contain' | 'stretch' | 'nineSlice';
export type SpriteSampler = 'linear' | 'nearest' | 'repeat' | 'clamp';

export interface SpritePanelOptions extends PanelOptions {
  readonly textureId?: number;
  readonly uvRect?: [number, number, number, number];
  readonly sampler?: SpriteSampler;
  readonly fit?: SpriteFit;
  readonly slice?: [number, number, number, number];
  readonly tintColor?: UiColor;
}

/**
 * Visual panel rendering an image or sprite atlas quad with configurable UV rect, sampler,
 * 9-slice borders, and tint color.
 */
export class SpritePanel extends Panel {
  private _textureId: number | undefined;
  private _uvRect: [number, number, number, number] = [0, 0, 1, 1];
  private _sampler: SpriteSampler = 'linear';
  private _fit: SpriteFit = 'stretch';
  private _slice?: [number, number, number, number];
  private _tintColor?: UiColor;

  constructor(options: SpritePanelOptions = {}) {
    super({
      ...options,
      style: {
        fill: [0, 0, 0, 0],
        strokeWidth: 0,
        ...options.style
      },
      id: options.id ?? nextUiId('sprite')
    });
    this._textureId = options.textureId;
    if (options.uvRect) this._uvRect = [...options.uvRect];
    if (options.sampler) this._sampler = options.sampler;
    if (options.fit) this._fit = options.fit;
    if (options.slice) this._slice = [...options.slice];
    this._tintColor = options.tintColor;
  }

  get textureId(): number | undefined {
    return this._textureId;
  }

  setTextureId(id: number | undefined): this {
    this._textureId = id;
    this._host?.markStructureDirty();
    return this;
  }

  get uvRect(): [number, number, number, number] {
    return this._uvRect;
  }

  setUvRect(rect: [number, number, number, number]): this {
    this._uvRect = [...rect];
    this._host?.markStructureDirty();
    return this;
  }

  setUv(rect: [number, number, number, number]): this {
    return this.setUvRect(rect);
  }

  get sampler(): SpriteSampler {
    return this._sampler;
  }

  setSampler(sampler: SpriteSampler): this {
    this._sampler = sampler;
    this._host?.markStructureDirty();
    return this;
  }

  get fit(): SpriteFit {
    return this._fit;
  }

  setFit(fit: SpriteFit): this {
    this._fit = fit;
    this._host?.markLayoutDirty();
    return this;
  }

  get slice(): [number, number, number, number] | undefined {
    return this._slice;
  }

  setSlice(slice: [number, number, number, number] | undefined): this {
    this._slice = slice ? [...slice] : undefined;
    this._host?.markStructureDirty();
    return this;
  }

  get tintColor(): UiColor | undefined {
    return this._tintColor;
  }

  setTintColor(color: UiColor | undefined): this {
    this._tintColor = color;
    this._host?.markStructureDirty();
    return this;
  }

  private samplerToIndex(): number {
    switch (this._sampler) {
      case 'linear':
        return 1; // LinearClamp
      case 'nearest':
        return 3; // NearestClamp
      case 'repeat':
        return 0; // LinearRepeat
      case 'clamp':
        return 1;
      default:
        return 0;
    }
  }

  override compileUi(
    outQuads: UiQuad2DDesc[],
    outTexts: UiText2DDesc[],
    clipRect?: [number, number, number, number]
  ): void {
    const { x, y, width, height } = this._rect;
    const samplerIdx = this.samplerToIndex();
    const tint = parseColorToRgba(this._tintColor, [1, 1, 1, 1]);
    const bg = parseColorToRgba(this._style.fill, [0, 0, 0, 0]);
    const borderCol = parseBorderColor(this._style.stroke);
    const borderW = parseBorderWidth(this._style.strokeWidth);
    const radii = parseBorderRadius(this._style.radius);

    if (this._fit === 'nineSlice' && this._slice && this._textureId !== undefined) {
      // 9-slice quad decomposition
      const [top, right, bottom, left] = this._slice;
      const [u0, v0, u1, v1] = this._uvRect;
      const uvW = u1 - u0;
      const uvH = v1 - v0;
      const uLeft = u0 + (left / Math.max(1, width)) * uvW;
      const uRight = u1 - (right / Math.max(1, width)) * uvW;
      const vTop = v0 + (top / Math.max(1, height)) * uvH;
      const vBottom = v1 - (bottom / Math.max(1, height)) * uvH;

      const colX = [x, x + left, x + width - right, x + width];
      const rowY = [y, y + top, y + height - bottom, y + height];
      const colU = [u0, uLeft, uRight, u1];
      const rowV = [v0, vTop, vBottom, v1];

      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const qx = colX[c]!;
          const qy = rowY[r]!;
          const qw = colX[c + 1]! - qx;
          const qh = rowY[r + 1]! - qy;
          if (qw <= 0 || qh <= 0) continue;
          outQuads.push({
            rect: [qx, qy, qw, qh],
            textureId: this._textureId,
            uvRect: [colU[c]!, rowV[r]!, colU[c + 1]!, rowV[r + 1]!],
            samplerIndex: samplerIdx,
            tintColor: tint,
            backgroundColor: bg,
            borderColor: borderCol,
            borderWidth: borderW,
            borderRadius: radii,
            clipRect
          });
        }
      }
    } else {
      outQuads.push({
        rect: [x, y, width, height],
        textureId: this._textureId,
        uvRect: this._uvRect,
        samplerIndex: samplerIdx,
        tintColor: tint,
        backgroundColor: bg,
        borderColor: borderCol,
        borderWidth: borderW,
        borderRadius: radii,
        clipRect
      });
    }

    this.compileChildrenUi(outQuads, outTexts, clipRect);
  }
}

_registerSpritePanelFactory((opts) => new SpritePanel(opts));
