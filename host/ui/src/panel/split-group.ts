import type { UiQuad2DDesc, UiText2DDesc } from '@galfus/transport-types';
import { parseColorToRgba } from '../layout/quad';
import { clampSize } from '../layout/solver';
import type { UiRect, UiSizeConstraints } from '../layout/types';
import type { UiHitTarget, UiHost, UiNode } from './node';
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
  parent?: UiNode;
  readonly orientation: 'horizontal' | 'vertical';
  private _rect: UiRect = { x: 0, y: 0, width: 300, height: 200 };
  private _host: UiHost | undefined;
  private readonly _panels: Panel[] = [];
  private readonly _weights: number[] = [];
  private _ratios: number[] = [];
  private readonly _boundSashes = new Set<number>();
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
    panel.parent = this;
    this._panels.push(panel);
    this._weights.push(w);
    const totalWeight = this._weights.reduce((a, b) => a + b, 0);
    this._ratios = this._weights.map((item) => item / totalWeight);
    panel.attachHost(this._host);
    if (this._host) {
      panel.bindInteractions(this._host);
      this.bindInteractions(this._host);
    }
    this.applyRect(this._rect);
    this._host?.markStructureDirty();
    return panel;
  }

  findNode(id: string): UiNode | undefined {
    if (this.id === id) return this;
    for (const panel of this._panels) {
      if (panel.id === id) return panel;
      const found = panel.findNode?.(id);
      if (found) return found;
    }
    return undefined;
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
    this._host?.markStructureDirty();
  }

  attachHost(host: UiHost | undefined): void {
    this._host = host;
    for (const panel of this._panels) {
      panel.attachHost(host);
      if (host) {
        panel.bindInteractions(host);
      }
    }
    if (host) {
      this.bindInteractions(host);
    }
  }

  bindInteractions(host: UiHost): void {
    const isHoriz = this.orientation === 'horizontal';
    for (let i = 0; i < this._panels.length - 1; i++) {
      if (this._boundSashes.has(i)) continue;
      this._boundSashes.add(i);
      const sashId = `${this.id}-sash-${i}`;
      let lastMain: number | undefined;
      const listener = host.listen(sashId);
      listener.on('down', ({ pointer }) => {
        if (pointer) {
          lastMain = isHoriz ? pointer.position[0] : pointer.position[1];
        }
      });
      listener.on('pressmove', ({ pointer }) => {
        if (lastMain === undefined || !pointer) return;
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

  hitTest(x: number, y: number): UiHitTarget | undefined {
    if (
      x < this._rect.x ||
      x > this._rect.x + this._rect.width ||
      y < this._rect.y ||
      y > this._rect.y + this._rect.height
    ) {
      return undefined;
    }

    const isHoriz = this.orientation === 'horizontal';
    const sashes = this.computeSashRects();
    for (let i = 0; i < sashes.length; i++) {
      const s = sashes[i]!;
      const hitMargin = 4;
      const x0 = isHoriz ? s.x - hitMargin : s.x;
      const x1 = isHoriz ? s.x + s.width + hitMargin : s.x + s.width;
      const y0 = isHoriz ? s.y : s.y - hitMargin;
      const y1 = isHoriz ? s.y + s.height : s.y + s.height + hitMargin;

      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
        return { id: `${this.id}-sash-${i}`, type: 'sash' };
      }
    }

    for (let i = this._panels.length - 1; i >= 0; i--) {
      const hit = this._panels[i]!.hitTest?.(x, y);
      if (hit) return hit;
    }

    return undefined;
  }

  hitTestScroll(x: number, y: number): UiHitTarget | undefined {
    if (
      x < this._rect.x ||
      x > this._rect.x + this._rect.width ||
      y < this._rect.y ||
      y > this._rect.y + this._rect.height
    ) {
      return undefined;
    }

    for (let i = this._panels.length - 1; i >= 0; i--) {
      const hit = this._panels[i]!.hitTestScroll?.(x, y);
      if (hit) return hit;
    }

    return undefined;
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

  compileUi(
    outQuads: UiQuad2DDesc[],
    outTexts: UiText2DDesc[],
    clipRect?: [number, number, number, number]
  ): void {
    for (const panel of this._panels) {
      panel.compileUi(outQuads, outTexts, clipRect);
    }
    const sashCol = parseColorToRgba(this._sashColor, [0.11, 0.19, 0.29, 1]);
    for (const sash of this.computeSashRects()) {
      outQuads.push({
        rect: [sash.x, sash.y, sash.width, sash.height],
        backgroundColor: sashCol,
        clipRect
      });
    }
  }
}

_registerSplitGroupFactory((options) => new SplitGroup(options));
