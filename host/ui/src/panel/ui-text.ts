import type { UiQuad2DDesc, UiText2DDesc } from '@galfus/transport-types';
import { parseColorToRgba } from '../layout/quad';
import type { UiColor, UiRect, UiSizeConstraints } from '../layout/types';
import type { UiHost, UiNode } from './node';
import { animatePanel, type PanelAnimationOptions } from './panel-animator';
import { PanelEventEmitter } from './panel-events';
import { nextUiId } from './panel';

export interface UiTextOptions extends UiSizeConstraints {
  readonly id?: string;
  readonly text?: string;
  readonly fontSize?: number;
  readonly color?: UiColor;
  readonly inline?: boolean;
  readonly multiline?: boolean;
  readonly maxWidth?: number;
  readonly align?: 'left' | 'center' | 'right';
}

/** Accurately estimates character advance based on font metrics. */
export function estimateCharAdvance(c: string, fontSize: number): number {
  if (c === ' ' || c === '\u00A0') return fontSize * 0.32;
  if ('WMwm@%—'.includes(c)) return fontSize * 0.88;
  if ('ABCDEFGHJKLNOPQRSTUVXYZ0123456789#$&?'.includes(c)) return fontSize * 0.7;
  if ("ijltrf!:,.;'|()[]{}".includes(c)) return fontSize * 0.3;
  return fontSize * 0.58;
}

/** Measures text width accurately using font-proportional metrics. */
export function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += estimateCharAdvance(text[i]!, fontSize);
  }
  return Math.ceil(w);
}

/** Visual text element supporting inline and multiline layout variants. */
export class UiText implements UiNode {
  readonly id: string;
  readonly constraints: UiSizeConstraints;
  parent?: UiNode;
  private _rect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  private _host: UiHost | undefined;
  private _text: string;
  private _fontSize: number;
  private _color: UiColor;
  private _inline: boolean;
  private _multiline: boolean;
  private _maxWidth: number | undefined;
  private _align: 'left' | 'center' | 'right';
  private readonly _explicitWidth: boolean;
  private readonly _explicitHeight: boolean;
  private readonly _events = new PanelEventEmitter();

  constructor(options: UiTextOptions = {}) {
    this.id = options.id ?? nextUiId('text');
    this._text = options.text ?? '';
    this._fontSize = options.fontSize ?? 14;
    this._color = options.color ?? [1, 1, 1, 1];
    this._inline = options.inline ?? false;
    this._multiline = options.multiline ?? false;
    this._maxWidth = options.maxWidth;
    this._align = options.align ?? 'left';
    this._explicitWidth = options.width !== undefined;
    this._explicitHeight = options.height !== undefined;

    const isMulti = this._multiline || this._text.includes('\n');
    const estWidth =
      options.width ?? (this._text.length > 0 ? estimateTextWidth(this._text, this._fontSize) : 40);
    const lineCount = isMulti ? this._text.split('\n').length : 1;
    const estHeight =
      options.height ??
      Math.ceil(this._fontSize * (isMulti ? Math.max(2.2, lineCount * 1.3) : 1.3));

    this.constraints = {
      ...options,
      width: options.width ?? (options.flex === undefined ? estWidth : undefined),
      height: options.height ?? estHeight
    };
  }

  get text(): string {
    return this._text;
  }

  get fontSize(): number {
    return this._fontSize;
  }

  get color(): UiColor {
    return this._color;
  }

  get inline(): boolean {
    return this._inline;
  }

  get multiline(): boolean {
    return this._multiline;
  }

  get rect(): UiRect {
    return this._rect;
  }

  setText(text: string): this {
    if (this._text !== text) {
      this._text = text;
      if (!this._explicitWidth && this.constraints.flex === undefined) {
        this.constraints.width = estimateTextWidth(text, this._fontSize);
      }
      if (!this._explicitHeight) {
        const isMulti = this._multiline || text.includes('\n');
        const lineCount = isMulti ? text.split('\n').length : 1;
        this.constraints.height = Math.ceil(
          this._fontSize * (isMulti ? Math.max(2.2, lineCount * 1.3) : 1.3)
        );
      }
      this._host?.markStructureDirty();
    }
    return this;
  }

  setFontSize(fontSize: number): this {
    if (this._fontSize !== fontSize) {
      this._fontSize = fontSize;
      if (!this._explicitWidth && this.constraints.flex === undefined) {
        this.constraints.width = estimateTextWidth(this._text, this._fontSize);
      }
      if (!this._explicitHeight) {
        const isMulti = this._multiline || this._text.includes('\n');
        const lineCount = isMulti ? this._text.split('\n').length : 1;
        this.constraints.height = Math.ceil(
          this._fontSize * (isMulti ? Math.max(2.2, lineCount * 1.3) : 1.3)
        );
      }
      this._host?.markStructureDirty();
    }
    return this;
  }

  setColor(color: UiColor): this {
    this._color = color;
    this._host?.markStructureDirty();
    return this;
  }

  setInline(inline: boolean): this {
    this._inline = inline;
    this._host?.markLayoutDirty();
    return this;
  }

  setMultiline(multiline: boolean): this {
    this._multiline = multiline;
    this._host?.markLayoutDirty();
    return this;
  }

  onHover(cb: () => void): () => void {
    return this._events.on('hover', cb);
  }

  onLeave(cb: () => void): () => void {
    return this._events.on('leave', cb);
  }

  onClick(cb: () => void): () => void {
    return this._events.on('click', cb);
  }

  animate(property: string, targetValue: any, options: PanelAnimationOptions = {}): this {
    animatePanel(this as any, property, targetValue, options);
    return this;
  }

  attachHost(host: UiHost | undefined): void {
    this._host = host;
  }

  applyRect(rect: UiRect, _host?: UiHost): void {
    this._rect = rect;
  }

  bindInteractions(host: UiHost): void {
    if (this._events.hasListeners()) {
      const listener = host.listen(this.id);
      listener.on('hover', () => this._events.emit('hover'));
      listener.on('leave', () => this._events.emit('leave'));
      listener.on('click', () => this._events.emit('click'));
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (!text || maxWidth <= 0) return [text];
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    const spaceWidth = estimateCharAdvance(' ', this._fontSize);

    for (const paragraph of paragraphs) {
      if (!paragraph) {
        lines.push('');
        continue;
      }
      const words = paragraph.split(' ');
      let currentLine = '';
      let currentLineWidth = 0;

      for (const word of words) {
        const wordWidth = estimateTextWidth(word, this._fontSize);
        if (!currentLine) {
          currentLine = word;
          currentLineWidth = wordWidth;
        } else if (currentLineWidth + spaceWidth + wordWidth <= maxWidth) {
          currentLine += ` ${word}`;
          currentLineWidth += spaceWidth + wordWidth;
        } else {
          lines.push(currentLine);
          currentLine = word;
          currentLineWidth = wordWidth;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines.length > 0 ? lines : [text];
  }

  compileUi(
    _outQuads: UiQuad2DDesc[],
    outTexts: UiText2DDesc[],
    clipRect?: [number, number, number, number]
  ): void {
    const { x, y, width, height } = this._rect;
    const isMulti = this._multiline || this._text.includes('\n');
    const lines = isMulti ? this.wrapText(this._text, this._maxWidth ?? width) : [this._text];
    const lineHeight = this._fontSize * 1.3;
    const totalTextH = lines.length * lineHeight;
    const startY = y + Math.max(0, (height - totalTextH) * 0.5);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      let lineX = x;
      if (this._align === 'center') {
        const lineW = estimateTextWidth(line, this._fontSize);
        lineX = x + Math.max(0, (width - lineW) * 0.5);
      } else if (this._align === 'right') {
        const lineW = estimateTextWidth(line, this._fontSize);
        lineX = x + Math.max(0, width - lineW);
      }
      outTexts.push({
        text: line,
        position: [lineX, startY + i * lineHeight],
        fontSize: this._fontSize,
        color: parseColorToRgba(this._color, [1, 1, 1, 1]),
        clipRect
      });
    }
  }
}
