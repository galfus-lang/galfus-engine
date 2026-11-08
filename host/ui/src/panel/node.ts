import type { InteractiveListener } from '@galfus/engine';
import type { UiRect, UiSizeConstraints } from '../layout/types';

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function fmtNum(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

/** Internal bridge implemented by `UiRoot` to coordinate SVG generation and attribute updates. */
export interface UiHost {
  allocateId(prefix: string): string;
  markStructureDirty(): void;
  markLayoutDirty(): void;
  setAttr(elementId: string, name: string, value: string): void;
  setText(elementId: string, value: string): void;
  listen(elementId: string): InteractiveListener;
}

/** Base contract for any node participating in a Panel layout tree. */
export interface UiNode {
  readonly id: string;
  readonly constraints: UiSizeConstraints;
  readonly rect: UiRect;
  attachHost(host: UiHost | undefined): void;
  setParentBounds?(bounds: UiRect | undefined): void;
  collectDefs(defs: string[]): void;
  renderSvg(): string;
  bindInteractions(host: UiHost): void;
  applyRect(rect: UiRect, host?: UiHost): void;
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

/** Leaf visual item (card, label, or `<image textureId>`) managed by a parent `Panel` layout. */
export class UiContentNode implements UiNode {
  readonly id: string;
  readonly constraints: UiSizeConstraints;
  private _rect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  private _host: UiHost | undefined;
  private _text: string | undefined;
  private _fill: string | undefined;
  private _stroke: string | undefined;
  private readonly _strokeWidth: number;
  private readonly _radius: number;
  private readonly _textColor: string;
  private readonly _fontSize: number;
  private readonly _fontWeight: string;
  private _textureId: number | undefined;
  private readonly _imageRendering: 'auto' | 'pixelated';
  private readonly _preserveAspectRatio: string;

  constructor(id: string, options: UiContentOptions = {}) {
    this.id = id;
    this.constraints = {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      minWidth: options.minWidth,
      maxWidth: options.maxWidth,
      minHeight: options.minHeight,
      maxHeight: options.maxHeight,
      flex: options.flex
    };
    this._text = options.text ?? options.label;
    this._fill = options.fill;
    this._stroke = options.stroke;
    this._strokeWidth = options.strokeWidth ?? 1;
    this._radius = options.radius ?? 6;
    this._textColor = options.textColor ?? '#e2f1ff';
    this._fontSize = options.fontSize ?? 13;
    this._fontWeight = options.fontWeight ?? 'normal';
    this._textureId = options.textureId;
    this._imageRendering = options.imageRendering ?? 'auto';
    this._preserveAspectRatio = options.preserveAspectRatio ?? 'xMidYMid meet';
  }

  get rect(): UiRect {
    return this._rect;
  }

  get text(): string | undefined {
    return this._text;
  }

  setText(text: string): void {
    this._text = text;
    if (this._host) this._host.setText(`${this.id}-text`, text);
  }

  setLabel(label: string): void {
    this.setText(label);
  }

  setFill(fill: string): void {
    this.setStyle({ fill });
  }

  setTextureId(textureId: number): void {
    this._textureId = textureId;
    if (this._host) this._host.setAttr(`${this.id}-img`, 'textureId', String(textureId));
  }

  setStyle(style: { fill?: string; stroke?: string }): void {
    if (style.fill !== undefined) {
      this._fill = style.fill;
      this._host?.setAttr(`${this.id}-bg`, 'fill', style.fill);
    }
    if (style.stroke !== undefined) {
      this._stroke = style.stroke;
      this._host?.setAttr(`${this.id}-bg`, 'stroke', style.stroke);
    }
  }

  attachHost(host: UiHost | undefined): void {
    if (this._host !== host) {
      this._appliedRect = undefined;
    }
    this._host = host;
  }

  collectDefs(_defs: string[]): void {}

  renderSvg(): string {
    const { x, y, width, height } = this._rect;
    const parts: string[] = [`<g id="${this.id}">`];
    if (this._fill || this._stroke) {
      const fillAttr = this._fill ? ` fill="${this._fill}"` : ' fill="none"';
      const strokeAttr = this._stroke
        ? ` stroke="${this._stroke}" stroke-width="${fmtNum(this._strokeWidth)}"`
        : '';
      const rxAttr = this._radius > 0 ? ` rx="${fmtNum(this._radius)}"` : '';
      parts.push(
        `<rect id="${this.id}-bg" x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(width)}" height="${fmtNum(height)}"${rxAttr}${fillAttr}${strokeAttr}/>`
      );
    }
    if (this._textureId !== undefined) {
      const rendering = this._imageRendering === 'pixelated' ? ' image-rendering="pixelated"' : '';
      parts.push(
        `<image id="${this.id}-img" textureId="${this._textureId}" x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(width)}" height="${fmtNum(height)}" preserveAspectRatio="${this._preserveAspectRatio}"${rendering}/>`
      );
    }
    if (this._text !== undefined) {
      const tx = x + 10;
      const ty = y + height * 0.5 + this._fontSize * 0.35;
      const weight = this._fontWeight !== 'normal' ? ` font-weight="${this._fontWeight}"` : '';
      parts.push(
        `<text id="${this.id}-text" x="${fmtNum(tx)}" y="${fmtNum(ty)}" fill="${this._textColor}" font-family="sans-serif" font-size="${fmtNum(this._fontSize)}"${weight}>${escapeXml(this._text)}</text>`
      );
    }
    parts.push('</g>');
    return parts.join('');
  }

  bindInteractions(_host: UiHost): void {}

  private _appliedRect?: UiRect;

  applyRect(rect: UiRect, host?: UiHost): void {
    const prev = this._appliedRect;
    if (
      prev &&
      prev.x === rect.x &&
      prev.y === rect.y &&
      prev.width === rect.width &&
      prev.height === rect.height
    ) {
      return;
    }
    this._appliedRect = { ...rect };
    this._rect = rect;
    if (!host) return;
    const { x, y, width, height } = rect;
    if (this._fill || this._stroke) {
      host.setAttr(`${this.id}-bg`, 'x', fmtNum(x));
      host.setAttr(`${this.id}-bg`, 'y', fmtNum(y));
      host.setAttr(`${this.id}-bg`, 'width', fmtNum(width));
      host.setAttr(`${this.id}-bg`, 'height', fmtNum(height));
    }
    if (this._textureId !== undefined) {
      host.setAttr(`${this.id}-img`, 'x', fmtNum(x));
      host.setAttr(`${this.id}-img`, 'y', fmtNum(y));
      host.setAttr(`${this.id}-img`, 'width', fmtNum(width));
      host.setAttr(`${this.id}-img`, 'height', fmtNum(height));
    }
    if (this._text !== undefined) {
      host.setAttr(`${this.id}-text`, 'x', fmtNum(x + 10));
      host.setAttr(`${this.id}-text`, 'y', fmtNum(y + height * 0.5 + this._fontSize * 0.35));
    }
  }
}
