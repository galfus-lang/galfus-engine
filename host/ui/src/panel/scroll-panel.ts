import { solveLayout } from '../layout/solver';
import type { UiRect } from '../layout/types';
import { fmtNum, type UiHost } from './node';
import { _registerScrollPanelFactory, nextUiId, Panel, type PanelOptions } from './panel';

export interface ScrollPanelOptions extends PanelOptions {
  readonly scrollX?: number;
  readonly scrollY?: number;
  readonly wheelSpeed?: number;
  readonly scrollbarSize?: number;
  readonly scrollHorizontal?: boolean;
  readonly scrollVertical?: boolean;
}

/** A `Panel` with clipped viewport, translated inner content, mouse-wheel scrolling, and draggable scrollbars. */
export class ScrollPanel extends Panel {
  private _scrollX: number;
  private _scrollY: number;
  private _contentWidth = 0;
  private _contentHeight = 0;
  private readonly _wheelSpeed: number;
  private readonly _barSize: number;
  private readonly _scrollH: boolean;
  private readonly _scrollV: boolean;
  private readonly _scrollListeners = new Set<
    (state: { scrollX: number; scrollY: number }) => void
  >();

  constructor(options: ScrollPanelOptions = {}) {
    super({
      ...options,
      id: options.id ?? nextUiId('scroll'),
      clip: true
    });
    this._scrollX = Math.max(0, options.scrollX ?? 0);
    this._scrollY = Math.max(0, options.scrollY ?? 0);
    this._wheelSpeed = options.wheelSpeed ?? 28;
    this._barSize = options.scrollbarSize ?? 8;
    this._scrollH = options.scrollHorizontal ?? false;
    this._scrollV = options.scrollVertical ?? true;
  }

  get scrollX(): number {
    return this._scrollX;
  }

  get scrollY(): number {
    return this._scrollY;
  }

  get contentWidth(): number {
    return this._contentWidth;
  }

  get contentHeight(): number {
    return this._contentHeight;
  }

  get viewportRect(): UiRect {
    const body = this.bodyRect;
    const reserveV = this._scrollV ? this._barSize + 4 : 0;
    const reserveH = this._scrollH ? this._barSize + 4 : 0;
    return {
      x: body.x,
      y: body.y,
      width: Math.max(0, body.width - reserveV),
      height: Math.max(0, body.height - reserveH)
    };
  }

  get maxScrollX(): number {
    return Math.max(0, this._contentWidth - this.viewportRect.width);
  }

  get maxScrollY(): number {
    return Math.max(0, this._contentHeight - this.viewportRect.height);
  }

  scrollTo(x: number, y: number): void {
    const nextX = this._scrollH ? Math.max(0, Math.min(this.maxScrollX, x)) : 0;
    const nextY = this._scrollV ? Math.max(0, Math.min(this.maxScrollY, y)) : 0;
    if (nextX === this._scrollX && nextY === this._scrollY) return;
    this._scrollX = nextX;
    this._scrollY = nextY;
    this.syncScrollAttributes(this._host);
    for (const cb of this._scrollListeners) cb({ scrollX: this._scrollX, scrollY: this._scrollY });
  }

  scrollBy(dx: number, dy: number): void {
    this.scrollTo(this._scrollX + dx, this._scrollY + dy);
  }

  onScroll(callback: (state: { scrollX: number; scrollY: number }) => void): () => void {
    this._scrollListeners.add(callback);
    return () => void this._scrollListeners.delete(callback);
  }

  override collectDefs(defs: string[]): void {
    const vp = this.viewportRect;
    defs.push(
      `<clipPath id="${this.id}-clip"><rect id="${this.id}-clip-rect" x="${fmtNum(vp.x)}" y="${fmtNum(vp.y)}" width="${fmtNum(vp.width)}" height="${fmtNum(vp.height)}"/></clipPath>`
    );
    for (const child of this._children) child.collectDefs(defs);
  }

  protected override renderChildrenSvg(): string {
    const body = this.bodyRect;
    const vp = this.viewportRect;
    const inner = this._children.map((child) => child.renderSvg()).join('');
    const parts: string[] = [
      `<rect id="${this.id}-wheel" x="${fmtNum(vp.x)}" y="${fmtNum(vp.y)}" width="${fmtNum(vp.width)}" height="${fmtNum(vp.height)}" fill="#ffffff" fill-opacity="0.001"/>`,
      `<g id="${this.id}-body" clip-path="url(#${this.id}-clip)">`,
      `<g id="${this.id}-content" transform="translate(${fmtNum(-this._scrollX)} ${fmtNum(-this._scrollY)})">${inner}</g>`,
      '</g>'
    ];

    if (this._scrollV) {
      const trackX = body.x + body.width - this._barSize - 2;
      const trackY = vp.y + 2;
      const trackH = Math.max(0, vp.height - 4);
      const { thumbY, thumbH } = this.computeVerticalThumb(trackY, trackH);
      parts.push(
        `<rect id="${this.id}-vtrack" x="${fmtNum(trackX)}" y="${fmtNum(trackY)}" width="${fmtNum(this._barSize)}" height="${fmtNum(trackH)}" rx="${fmtNum(this._barSize * 0.5)}" fill="#091320"/>`,
        `<rect id="${this.id}-vthumb" x="${fmtNum(trackX)}" y="${fmtNum(thumbY)}" width="${fmtNum(this._barSize)}" height="${fmtNum(thumbH)}" rx="${fmtNum(this._barSize * 0.5)}" fill="#2b5278"/>`
      );
    }

    if (this._scrollH) {
      const trackX = vp.x + 2;
      const trackY = body.y + body.height - this._barSize - 2;
      const trackW = Math.max(0, vp.width - 4);
      const { thumbX, thumbW } = this.computeHorizontalThumb(trackX, trackW);
      parts.push(
        `<rect id="${this.id}-htrack" x="${fmtNum(trackX)}" y="${fmtNum(trackY)}" width="${fmtNum(trackW)}" height="${fmtNum(this._barSize)}" rx="${fmtNum(this._barSize * 0.5)}" fill="#091320"/>`,
        `<rect id="${this.id}-hthumb" x="${fmtNum(thumbX)}" y="${fmtNum(trackY)}" width="${fmtNum(thumbW)}" height="${fmtNum(this._barSize)}" rx="${fmtNum(this._barSize * 0.5)}" fill="#2b5278"/>`
      );
    }

    return parts.join('');
  }

  override bindInteractions(host: UiHost): void {
    if (this._scrollV) {
      let lastY: number | undefined;
      const vthumb = host.listen(`${this.id}-vthumb`);
      vthumb.on('hover', () => host.setAttr(`${this.id}-vthumb`, 'fill', '#38bdf8'));
      vthumb.on('leave', () => host.setAttr(`${this.id}-vthumb`, 'fill', '#2b5278'));
      vthumb.on('down', ({ pointer }) => {
        if (pointer.type === 'button' && pointer.button === 'primary') lastY = pointer.position[1];
      });
      vthumb.on('pressmove', ({ pointer }) => {
        if (lastY === undefined) return;
        const dy = pointer.position[1] - lastY;
        lastY = pointer.position[1];
        const vp = this.viewportRect;
        const trackH = Math.max(1, vp.height - 4);
        const { thumbH } = this.computeVerticalThumb(vp.y + 2, trackH);
        const travel = Math.max(1, trackH - thumbH);
        this.scrollBy(0, (dy / travel) * this.maxScrollY);
      });
      vthumb.on('pressup', () => (lastY = undefined));
      vthumb.on('cancel', () => (lastY = undefined));
    }

    if (this._scrollH) {
      let lastX: number | undefined;
      const hthumb = host.listen(`${this.id}-hthumb`);
      hthumb.on('hover', () => host.setAttr(`${this.id}-hthumb`, 'fill', '#38bdf8'));
      hthumb.on('leave', () => host.setAttr(`${this.id}-hthumb`, 'fill', '#2b5278'));
      hthumb.on('down', ({ pointer }) => {
        if (pointer.type === 'button' && pointer.button === 'primary') lastX = pointer.position[0];
      });
      hthumb.on('pressmove', ({ pointer }) => {
        if (lastX === undefined) return;
        const dx = pointer.position[0] - lastX;
        lastX = pointer.position[0];
        const vp = this.viewportRect;
        const trackW = Math.max(1, vp.width - 4);
        const { thumbW } = this.computeHorizontalThumb(vp.x + 2, trackW);
        const travel = Math.max(1, trackW - thumbW);
        this.scrollBy((dx / travel) * this.maxScrollX, 0);
      });
      hthumb.on('pressup', () => (lastX = undefined));
      hthumb.on('cancel', () => (lastX = undefined));
    }

    super.bindInteractions(host);

    const wheel = host.listen(`${this.id}-wheel`);
    wheel.on('scroll', ({ scrollDelta }) => {
      if (!scrollDelta) return;
      const isLines = 'lines' in scrollDelta;
      const [dx, dy] = isLines ? scrollDelta.lines : scrollDelta.pixels;
      const mul = isLines ? this._wheelSpeed : 1;
      this.scrollBy(-dx * mul, -dy * mul);
    });
  }

  protected override layoutChildren(host?: UiHost): void {
    const vp = this.viewportRect;
    const solution = solveLayout(
      vp,
      this._padding,
      this._layout,
      this._children.map((c) => c.constraints)
    );
    this._contentWidth = solution.contentWidth;
    this._contentHeight = solution.contentHeight;
    this._scrollX = this._scrollH ? Math.max(0, Math.min(this.maxScrollX, this._scrollX)) : 0;
    this._scrollY = this._scrollV ? Math.max(0, Math.min(this.maxScrollY, this._scrollY)) : 0;

    for (let i = 0; i < this._children.length; i++) {
      this._children[i]!.applyRect(solution.rects[i]!, host);
    }
    this.syncScrollAttributes(host);
  }

  private syncScrollAttributes(host?: UiHost): void {
    if (!host) return;
    const body = this.bodyRect;
    const vp = this.viewportRect;
    host.setAttr(`${this.id}-clip-rect`, 'x', fmtNum(vp.x));
    host.setAttr(`${this.id}-clip-rect`, 'y', fmtNum(vp.y));
    host.setAttr(`${this.id}-clip-rect`, 'width', fmtNum(vp.width));
    host.setAttr(`${this.id}-clip-rect`, 'height', fmtNum(vp.height));
    host.setAttr(
      `${this.id}-content`,
      'transform',
      `translate(${fmtNum(-this._scrollX)} ${fmtNum(-this._scrollY)})`
    );
    host.setAttr(`${this.id}-wheel`, 'x', fmtNum(vp.x));
    host.setAttr(`${this.id}-wheel`, 'y', fmtNum(vp.y));
    host.setAttr(`${this.id}-wheel`, 'width', fmtNum(vp.width));
    host.setAttr(`${this.id}-wheel`, 'height', fmtNum(vp.height));

    if (this._scrollV) {
      const trackX = body.x + body.width - this._barSize - 2;
      const trackY = vp.y + 2;
      const trackH = Math.max(0, vp.height - 4);
      const { thumbY, thumbH } = this.computeVerticalThumb(trackY, trackH);
      host.setAttr(`${this.id}-vtrack`, 'x', fmtNum(trackX));
      host.setAttr(`${this.id}-vtrack`, 'y', fmtNum(trackY));
      host.setAttr(`${this.id}-vtrack`, 'height', fmtNum(trackH));
      host.setAttr(`${this.id}-vthumb`, 'x', fmtNum(trackX));
      host.setAttr(`${this.id}-vthumb`, 'y', fmtNum(thumbY));
      host.setAttr(`${this.id}-vthumb`, 'height', fmtNum(thumbH));
    }

    if (this._scrollH) {
      const trackX = vp.x + 2;
      const trackY = body.y + body.height - this._barSize - 2;
      const trackW = Math.max(0, vp.width - 4);
      const { thumbX, thumbW } = this.computeHorizontalThumb(trackX, trackW);
      host.setAttr(`${this.id}-htrack`, 'x', fmtNum(trackX));
      host.setAttr(`${this.id}-htrack`, 'y', fmtNum(trackY));
      host.setAttr(`${this.id}-htrack`, 'width', fmtNum(trackW));
      host.setAttr(`${this.id}-hthumb`, 'x', fmtNum(thumbX));
      host.setAttr(`${this.id}-hthumb`, 'y', fmtNum(trackY));
      host.setAttr(`${this.id}-hthumb`, 'width', fmtNum(thumbW));
    }
  }

  private computeVerticalThumb(trackY: number, trackH: number): { thumbY: number; thumbH: number } {
    if (trackH <= 0 || this._contentHeight <= 0 || this.maxScrollY <= 0) {
      return { thumbY: trackY, thumbH: trackH };
    }
    const ratio = Math.min(1, this.viewportRect.height / this._contentHeight);
    const thumbH = Math.max(Math.min(20, trackH), trackH * ratio);
    const progress = this._scrollY / this.maxScrollY;
    return { thumbY: trackY + (trackH - thumbH) * progress, thumbH };
  }

  private computeHorizontalThumb(
    trackX: number,
    trackW: number
  ): { thumbX: number; thumbW: number } {
    if (trackW <= 0 || this._contentWidth <= 0 || this.maxScrollX <= 0) {
      return { thumbX: trackX, thumbW: trackW };
    }
    const ratio = Math.min(1, this.viewportRect.width / this._contentWidth);
    const thumbW = Math.max(Math.min(20, trackW), trackW * ratio);
    const progress = this._scrollX / this.maxScrollX;
    return { thumbX: trackX + (trackW - thumbW) * progress, thumbW };
  }
}

_registerScrollPanelFactory((options) => new ScrollPanel(options));
