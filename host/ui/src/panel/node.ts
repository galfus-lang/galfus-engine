import type { InteractiveListener } from '@galfus/engine';
import type { UiQuad2DDesc, UiText2DDesc } from '@galfus/transport-types';
import { parseBorderRadius, parseBorderWidth, parseColorToRgba } from '../layout/quad';
import type { UiRect, UiSizeConstraints } from '../layout/types';

export interface UiHitTarget {
  readonly id: string;
  readonly type?: string;
}

/** Bridge implemented by `UiRoot` to coordinate layout updates and user interactions. */
export interface UiHost {
  allocateId(prefix: string): string;
  markStructureDirty(): void;
  markLayoutDirty(): void;
  listen(elementId: string): InteractiveListener;
  hasListeners?(key: string): boolean;
}

/** Base contract for any node participating in a Panel layout tree. */
export interface UiNode {
  readonly id: string;
  readonly constraints: UiSizeConstraints;
  readonly rect: UiRect;
  parent?: UiNode;
  attachHost(host: UiHost | undefined): void;
  setParentBounds?(bounds: UiRect | undefined): void;
  bindInteractions(host: UiHost): void;
  applyRect(rect: UiRect, host?: UiHost): void;
  hitTest?(x: number, y: number): UiHitTarget | undefined;
  hitTestScroll?(x: number, y: number): UiHitTarget | undefined;
  compileUi(
    outQuads: UiQuad2DDesc[],
    outTexts: UiText2DDesc[],
    clipRect?: [number, number, number, number]
  ): void;
}

export interface UiContentOptions extends UiSizeConstraints {
  readonly id?: string;
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly text?: string;
  readonly label?: string;
  readonly textColor?: string;
  readonly fontSize?: number;
  readonly fontWeight?: string;
  readonly textureId?: number;
  readonly imageRendering?: 'auto' | 'pixelated';
  readonly preserveAspectRatio?: string;
}

/** Leaf visual item managed by a parent `Panel` layout, compiled directly to `Model2DUI` quads and texts. */
export class UiContentNode implements UiNode {
  readonly id: string;
  readonly constraints: UiSizeConstraints;
  parent?: UiNode;
  private _rect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  private _host: UiHost | undefined;
  private _text: string | undefined;
  private _fill: string | undefined;
  private _stroke: string | undefined;
  private _strokeWidth = 1;
  private _radius = 0;
  private _textColor = '#f0f7ff';
  private _fontSize = 13;
  private _textureId: number | undefined;
  private _imageRendering: 'auto' | 'pixelated' = 'auto';

  constructor(options: UiContentOptions = {}) {
    this.id = options.id ?? `item-${Math.random().toString(36).slice(2, 8)}`;
    this.constraints = { ...options };
    this._text = options.text ?? options.label;
    this._fill = options.fill;
    this._stroke = options.stroke;
    this._strokeWidth = options.strokeWidth ?? 1;
    this._radius = options.radius ?? 0;
    this._textColor = options.textColor ?? '#f0f7ff';
    this._fontSize = options.fontSize ?? 13;
    this._textureId = options.textureId;
    this._imageRendering = options.imageRendering ?? 'auto';
  }

  get rect(): UiRect {
    return this._rect;
  }

  get text(): string | undefined {
    return this._text;
  }

  get textureId(): number | undefined {
    return this._textureId;
  }

  setText(text: string): void {
    this._text = text;
    this._host?.markStructureDirty();
  }

  setLabel(label: string): void {
    this.setText(label);
  }

  setFill(fill: string): void {
    this._fill = fill;
    this._host?.markStructureDirty();
  }

  setStroke(stroke: string): void {
    this._stroke = stroke;
    this._host?.markStructureDirty();
  }

  setTextureId(textureId: number): void {
    this._textureId = textureId;
    this._host?.markStructureDirty();
  }

  attachHost(host: UiHost | undefined): void {
    this._host = host;
  }

  bindInteractions(_host: UiHost): void {}

  compileUi(
    outQuads: UiQuad2DDesc[],
    outTexts: UiText2DDesc[],
    clipRect?: [number, number, number, number]
  ): void {
    const { x, y, width, height } = this._rect;
    if (this._fill || this._stroke) {
      outQuads.push({
        rect: [x, y, width, height],
        backgroundColor: parseColorToRgba(this._fill, [0, 0, 0, 0]),
        borderColor: parseColorToRgba(this._stroke, [0, 0, 0, 0]),
        borderWidth: parseBorderWidth(this._strokeWidth),
        borderRadius: parseBorderRadius(this._radius),
        clipRect
      });
    }
    if (this._textureId !== undefined) {
      outQuads.push({
        rect: [x, y, width, height],
        textureId: this._textureId,
        samplerIndex: this._imageRendering === 'pixelated' ? 3 : 1,
        clipRect
      });
    }
    if (this._text !== undefined) {
      outTexts.push({
        position: [x + 10, y + Math.max(0, (height - this._fontSize) * 0.5)],
        fontSize: this._fontSize,
        color: parseColorToRgba(this._textColor, [0.88, 0.94, 1.0, 1]),
        text: this._text,
        clipRect
      });
    }
  }

  applyRect(rect: UiRect, _host?: UiHost): void {
    this._rect = rect;
  }

  hitTest(x: number, y: number): UiHitTarget | undefined {
    if (
      x >= this._rect.x &&
      x <= this._rect.x + this._rect.width &&
      y >= this._rect.y &&
      y <= this._rect.y + this._rect.height
    ) {
      return { id: this.id, type: 'content' };
    }
    return undefined;
  }
}
