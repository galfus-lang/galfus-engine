import { clampSize } from '../layout/solver';
import type { UiRect, UiSizeConstraints } from '../layout/types';
import { fmtNum, type UiHost, type UiNode } from './node';
import { _registerSplitGroupFactory, nextUiId, Panel, type PanelOptions } from './panel';
import { ScrollPanel, type ScrollPanelOptions } from './scroll-panel';

export interface SplitGroupOptions extends UiSizeConstraints {
  readonly id?: string;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly handleSize?: number;
  readonly sashColor?: string;
  readonly sashHoverColor?: string;
}

/** Divides space horizontally or vertically between 2 or more `Panel` children with draggable divider sashes. */
export class SplitGroup implements UiNode {
  readonly id: string;
  readonly constraints: UiSizeConstraints;
  readonly orientation: 'horizontal' | 'vertical';
  private _rect: UiRect = { x: 0, y: 0, width: 300, height: 200 };
  private _host: UiHost | undefined;
  private readonly _panels: Panel[] = [];
  private readonly _weights: number[] = [];
  private _ratios: number[] = [];
  private readonly _handleSize: number;
  private readonly _sashColor: string;
  private readonly _sashHoverColor: string;

  constructor(options: SplitGroupOptions = {}) {
    this.id = options.id ?? nextUiId('split');
    this.orientation = options.orientation ?? 'horizontal';
    this.constraints = {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      minWidth: options.minWidth,
      maxWidth: options.maxWidth,
      minHeight: options.minHeight,
      maxHeight: options.maxHeight,
      flex: options.flex ?? 1
    };
    this._handleSize = Math.max(4, options.handleSize ?? 6);
    this._sashColor = options.sashColor ?? '#1b314b';
    this._sashHoverColor = options.sashHoverColor ?? '#38bdf8';
  }

  get rect(): UiRect {
    return this._rect;
  }

  get panels(): readonly Panel[] {
    return this._panels;
  }

  get ratios(): readonly number[] {
    return this._ratios;
  }

  addPanel(options: PanelOptions = {}): Panel {
    const panel = new Panel(options);
    return this.insertPanel(panel, options.flex);
  }

  addScrollPanel(options: ScrollPanelOptions = {}): ScrollPanel {
    const panel = new ScrollPanel(options);
    return this.insertPanel(panel, options.flex);
  }

  private insertPanel<T extends Panel>(panel: T, weight = 1): T {
    const w = Math.max(0.05, weight);
    this._panels.push(panel);
    this._weights.push(w);
    const totalWeight = this._weights.reduce((a, b) => a + b, 0);
    this._ratios = this._weights.map((item) => item / totalWeight);
    panel.attachHost(this._host);
    this.applyRect(this._rect);
    this._host?.markStructureDirty();
    return panel;
  }

  private normalizeRatios(): void {
    const sum = this._ratios.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < this._ratios.length; i++) {
        this._ratios[i] = this._ratios[i]! / sum;
      }
    }
  }

  /** Adjusts the divider at `sashIndex` by `deltaPixels` in main-axis coordinates. */
  moveSash(sashIndex: number, deltaPixels: number): void {
    if (sashIndex < 0 || sashIndex >= this._panels.length - 1 || deltaPixels === 0) return;
    const sizes = this.computePanelSizes();
    const totalAvailable = sizes.reduce((a, b) => a + b, 0);
    if (totalAvailable <= 0) return;

    const a = this._panels[sashIndex]!;
    const b = this._panels[sashIndex + 1]!;
    const isHoriz = this.orientation === 'horizontal';
    const minA = (isHoriz ? a.constraints.minWidth : a.constraints.minHeight) ?? 40;
    const maxA = (isHoriz ? a.constraints.maxWidth : a.constraints.maxHeight) ?? Infinity;
    const minB = (isHoriz ? b.constraints.minWidth : b.constraints.minHeight) ?? 40;
    const maxB = (isHoriz ? b.constraints.maxWidth : b.constraints.maxHeight) ?? Infinity;

    const pairSum = sizes[sashIndex]! + sizes[sashIndex + 1]!;
    let nextA = clampSize(sizes[sashIndex]! + deltaPixels, minA, Math.min(maxA, pairSum - minB));
    let nextB = pairSum - nextA;
    if (nextB > maxB) {
      nextB = maxB;
      nextA = pairSum - nextB;
    }

    sizes[sashIndex] = nextA;
    sizes[sashIndex + 1] = nextB;
    const totalWeight = this._weights.reduce((acc, w) => acc + w, 0) || sizes.length;
    for (let i = 0; i < sizes.length; i++) {
      const r = sizes[i]! / totalAvailable;
      this._ratios[i] = r;
      this._weights[i] = r * totalWeight;
    }
    this.applyRect(this._rect, this._host);
  }

  attachHost(host: UiHost | undefined): void {
    this._host = host;
    for (const panel of this._panels) panel.attachHost(host);
  }

  collectDefs(defs: string[]): void {
    for (const panel of this._panels) panel.collectDefs(defs);
  }

  renderSvg(): string {
    const parts: string[] = [`<g id="${this.id}">`];
    for (const panel of this._panels) {
      parts.push(panel.renderSvg());
    }
    const sashes = this.computeSashRects();
    for (let i = 0; i < sashes.length; i++) {
      const s = sashes[i]!;
      parts.push(
        `<rect id="${this.id}-sash-${i}" x="${fmtNum(s.x)}" y="${fmtNum(s.y)}" width="${fmtNum(s.width)}" height="${fmtNum(s.height)}" rx="2" fill="${this._sashColor}"/>`
      );
    }
    parts.push('</g>');
    return parts.join('');
  }

  bindInteractions(host: UiHost): void {
    const isHoriz = this.orientation === 'horizontal';
    for (let i = 0; i < this._panels.length - 1; i++) {
      const sashId = `${this.id}-sash-${i}`;
      let lastMain: number | undefined;
      const listener = host.listen(sashId);
      listener.on('hover', () => host.setAttr(sashId, 'fill', this._sashHoverColor));
      listener.on('leave', () => host.setAttr(sashId, 'fill', this._sashColor));
      listener.on('down', ({ pointer }) => {
        if (pointer.type === 'button' && pointer.button === 'primary') {
          lastMain = isHoriz ? pointer.position[0] : pointer.position[1];
        }
      });
      listener.on('pressmove', ({ pointer }) => {
        if (lastMain === undefined) return;
        const curr = isHoriz ? pointer.position[0] : pointer.position[1];
        const delta = curr - lastMain;
        lastMain = curr;
        this.moveSash(i, delta);
      });
      listener.on('pressup', () => (lastMain = undefined));
      listener.on('cancel', () => (lastMain = undefined));
    }
    for (const panel of this._panels) panel.bindInteractions(host);
  }

  applyRect(rect: UiRect, host?: UiHost): void {
    this._rect = rect;
    if (this._panels.length === 0) return;

    const isHoriz = this.orientation === 'horizontal';
    const sizes = this.computePanelSizes();
    let cursor = isHoriz ? rect.x : rect.y;

    for (let i = 0; i < this._panels.length; i++) {
      const sz = sizes[i]!;
      const panelRect: UiRect = isHoriz
        ? { x: cursor, y: rect.y, width: sz, height: rect.height }
        : { x: rect.x, y: cursor, width: rect.width, height: sz };
      this._panels[i]!.applyRect(panelRect, host);
      cursor += sz;
      if (i < this._panels.length - 1) {
        if (host) {
          const sashX = isHoriz ? cursor : rect.x;
          const sashY = isHoriz ? rect.y : cursor;
          const sashW = isHoriz ? this._handleSize : rect.width;
          const sashH = isHoriz ? rect.height : this._handleSize;
          host.setAttr(`${this.id}-sash-${i}`, 'x', fmtNum(sashX));
          host.setAttr(`${this.id}-sash-${i}`, 'y', fmtNum(sashY));
          host.setAttr(`${this.id}-sash-${i}`, 'width', fmtNum(sashW));
          host.setAttr(`${this.id}-sash-${i}`, 'height', fmtNum(sashH));
        }
        cursor += this._handleSize;
      }
    }
  }

  private computePanelSizes(): number[] {
    const n = this._panels.length;
    if (n === 0) return [];
    const isHoriz = this.orientation === 'horizontal';
    const totalMain = isHoriz ? this._rect.width : this._rect.height;
    const totalHandles = this._handleSize * Math.max(0, n - 1);
    const available = Math.max(0, totalMain - totalHandles);

    this.normalizeRatios();
    const sizes = new Array<number>(n).fill(0);
    let used = 0;
    for (let i = 0; i < n; i++) {
      const p = this._panels[i]!;
      const min = (isHoriz ? p.constraints.minWidth : p.constraints.minHeight) ?? 40;
      const max = (isHoriz ? p.constraints.maxWidth : p.constraints.maxHeight) ?? Infinity;
      const sz = clampSize(available * (this._ratios[i] ?? 1 / n), min, max);
      sizes[i] = sz;
      used += sz;
    }
    const diff = available - used;
    if (Math.abs(diff) > 0.01 && n > 0) {
      sizes[n - 1] = Math.max(0, sizes[n - 1]! + diff);
    }
    return sizes;
  }

  private computeSashRects(): UiRect[] {
    const n = this._panels.length;
    if (n <= 1) return [];
    const isHoriz = this.orientation === 'horizontal';
    const sizes = this.computePanelSizes();
    const sashes: UiRect[] = [];
    let cursor = isHoriz ? this._rect.x : this._rect.y;
    for (let i = 0; i < n - 1; i++) {
      cursor += sizes[i]!;
      sashes.push(
        isHoriz
          ? { x: cursor, y: this._rect.y, width: this._handleSize, height: this._rect.height }
          : { x: this._rect.x, y: cursor, width: this._rect.width, height: this._handleSize }
      );
      cursor += this._handleSize;
    }
    return sashes;
  }
}

_registerSplitGroupFactory((options) => new SplitGroup(options));
