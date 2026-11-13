import type { UiQuad2DDesc, UiText2DDesc } from '@galfus/transport-types';
import { solveLayout } from '../layout/solver';
import type { UiRect } from '../layout/types';
import type { UiHitTarget, UiHost } from './node';
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
    this._host?.markStructureDirty();
    for (const cb of this._scrollListeners) cb({ scrollX: this._scrollX, scrollY: this._scrollY });
  }

  scrollBy(dx: number, dy: number): void {
    this.scrollTo(this._scrollX + dx, this._scrollY + dy);
  }

  override onScroll(callback: (state: { scrollX: number; scrollY: number }) => void): () => void;
  override onScroll(cb: (dx: number, dy: number) => void): () => void;
  override onScroll(
    cb: ((state: { scrollX: number; scrollY: number }) => void) | ((dx: number, dy: number) => void)
  ): () => void {
    const wrapper = (state: { scrollX: number; scrollY: number }) => {
      if (cb.length <= 1) {
        (cb as (state: { scrollX: number; scrollY: number }) => void)(state);
      } else {
        (cb as (dx: number, dy: number) => void)(state.scrollX, state.scrollY);
      }
    };
    this._scrollListeners.add(wrapper);
    return () => void this._scrollListeners.delete(wrapper);
  }

  override bindInteractions(host: UiHost): void {
    if (this._scrollV) {
      let lastY: number | undefined;
      const vthumb = host.listen(`${this.id}-vthumb`);
      vthumb.on('down', ({ pointer }) => {
        lastY = pointer ? pointer.position[1] : undefined;
      });
      vthumb.on('pressmove', ({ pointer }) => {
        if (lastY === undefined || !pointer) return;
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
      hthumb.on('down', ({ pointer }) => {
        lastX = pointer ? pointer.position[0] : undefined;
      });
      hthumb.on('pressmove', ({ pointer }) => {
        if (lastX === undefined || !pointer) return;
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

  override hitTest(x: number, y: number): UiHitTarget | undefined {
    if (
      x < this._rect.x ||
      x > this._rect.x + this._rect.width ||
      y < this._rect.y ||
      y > this._rect.y + this._rect.height
    ) {
      return undefined;
    }

    const vp = this.viewportRect;
    const body = this.bodyRect;

    // Check vertical scrollbar thumb
    if (this._scrollV && this.maxScrollY > 0) {
      const trackX = body.x + body.width - this._barSize - 2;
      const trackY = vp.y + 2;
      const trackH = Math.max(0, vp.height - 4);
      const { thumbY, thumbH } = this.computeVerticalThumb(trackY, trackH);
      if (
        x >= trackX - 4 &&
        x <= trackX + this._barSize + 4 &&
        y >= thumbY &&
        y <= thumbY + thumbH
      ) {
        return { id: `${this.id}-vthumb`, type: 'thumb' };
      }
    }

    // Check horizontal scrollbar thumb
    if (this._scrollH && this.maxScrollX > 0) {
      const trackX = vp.x + 2;
      const trackY = body.y + body.height - this._barSize - 2;
      const trackW = Math.max(0, vp.width - 4);
      const { thumbX, thumbW } = this.computeHorizontalThumb(trackX, trackW);
      if (
        x >= thumbX &&
        x <= thumbX + thumbW &&
        y >= trackY - 4 &&
        y <= trackY + this._barSize + 4
      ) {
        return { id: `${this.id}-hthumb`, type: 'thumb' };
      }
    }

    // Check children inside viewport with scroll offset
    if (x >= vp.x && x <= vp.x + vp.width && y >= vp.y && y <= vp.y + vp.height) {
      const childX = x + this._scrollX;
      const childY = y + this._scrollY;
      for (let i = this._children.length - 1; i >= 0; i--) {
        const child = this._children[i]!;
        const hit = child.hitTest?.(childX, childY);
        if (hit) return hit;
      }
    }

    return { id: this.id, type: 'panel' };
  }

  override hitTestScroll(x: number, y: number): UiHitTarget | undefined {
    const vp = this.viewportRect;
    if (x < vp.x || x > vp.x + vp.width || y < vp.y || y > vp.y + vp.height) {
      return undefined;
    }

    const childX = x + this._scrollX;
    const childY = y + this._scrollY;
    for (let i = this._children.length - 1; i >= 0; i--) {
      const child = this._children[i]!;
      const hit = child.hitTestScroll?.(childX, childY);
      if (hit) return hit;
    }

    return { id: this.id, type: 'scroll' };
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

  protected override compileChildrenUi(
    outQuads: UiQuad2DDesc[],
    outTexts: UiText2DDesc[],
    clipRect?: [number, number, number, number]
  ): void {
    const vp = this.viewportRect;
    const body = this.bodyRect;
    let childClip: [number, number, number, number];
    if (clipRect) {
      const cx0 = Math.max(clipRect[0], vp.x);
      const cy0 = Math.max(clipRect[1], vp.y);
      const cx1 = Math.min(clipRect[0] + clipRect[2], vp.x + vp.width);
      const cy1 = Math.min(clipRect[1] + clipRect[3], vp.y + vp.height);
      childClip = [cx0, cy0, Math.max(0, cx1 - cx0), Math.max(0, cy1 - cy0)];
    } else {
      childClip = [vp.x, vp.y, vp.width, vp.height];
    }

    const quadsBefore = outQuads.length;
    const textsBefore = outTexts.length;

    for (const child of this._children) {
      child.compileUi?.(outQuads, outTexts, childClip);
    }

    if (this._scrollX !== 0 || this._scrollY !== 0) {
      for (let i = quadsBefore; i < outQuads.length; i++) {
        const q = outQuads[i]!;
        q.rect = [q.rect[0] - this._scrollX, q.rect[1] - this._scrollY, q.rect[2], q.rect[3]];
        if (
          q.clipRect &&
          (q.clipRect[0] !== childClip[0] ||
            q.clipRect[1] !== childClip[1] ||
            q.clipRect[2] !== childClip[2] ||
            q.clipRect[3] !== childClip[3])
        ) {
          const nx0 = Math.max(childClip[0], q.clipRect[0] - this._scrollX);
          const ny0 = Math.max(childClip[1], q.clipRect[1] - this._scrollY);
          const nx1 = Math.min(
            childClip[0] + childClip[2],
            q.clipRect[0] + q.clipRect[2] - this._scrollX
          );
          const ny1 = Math.min(
            childClip[1] + childClip[3],
            q.clipRect[1] + q.clipRect[3] - this._scrollY
          );
          q.clipRect = [nx0, ny0, Math.max(0, nx1 - nx0), Math.max(0, ny1 - ny0)];
        }
      }
      for (let i = textsBefore; i < outTexts.length; i++) {
        const t = outTexts[i]!;
        t.position = [t.position[0] - this._scrollX, t.position[1] - this._scrollY];
        if (
          t.clipRect &&
          (t.clipRect[0] !== childClip[0] ||
            t.clipRect[1] !== childClip[1] ||
            t.clipRect[2] !== childClip[2] ||
            t.clipRect[3] !== childClip[3])
        ) {
          const nx0 = Math.max(childClip[0], t.clipRect[0] - this._scrollX);
          const ny0 = Math.max(childClip[1], t.clipRect[1] - this._scrollY);
          const nx1 = Math.min(
            childClip[0] + childClip[2],
            t.clipRect[0] + t.clipRect[2] - this._scrollX
          );
          const ny1 = Math.min(
            childClip[1] + childClip[3],
            t.clipRect[1] + t.clipRect[3] - this._scrollY
          );
          t.clipRect = [nx0, ny0, Math.max(0, nx1 - nx0), Math.max(0, ny1 - ny0)];
        }
      }
    }

    if (this._scrollV) {
      const trackX = body.x + body.width - this._barSize - 2;
      const trackY = vp.y + 2;
      const trackH = Math.max(0, vp.height - 4);
      const { thumbY, thumbH } = this.computeVerticalThumb(trackY, trackH);
      outQuads.push({
        rect: [trackX, thumbY, this._barSize, thumbH],
        backgroundColor: [0.17, 0.32, 0.47, 0.8],
        borderRadius: [
          this._barSize * 0.5,
          this._barSize * 0.5,
          this._barSize * 0.5,
          this._barSize * 0.5
        ],
        clipRect
      });
    }
    if (this._scrollH) {
      const trackX = vp.x + 2;
      const trackY = body.y + body.height - this._barSize - 2;
      const trackW = Math.max(0, vp.width - 4);
      const { thumbX, thumbW } = this.computeHorizontalThumb(trackX, trackW);
      outQuads.push({
        rect: [thumbX, trackY, thumbW, this._barSize],
        backgroundColor: [0.17, 0.32, 0.47, 0.8],
        borderRadius: [
          this._barSize * 0.5,
          this._barSize * 0.5,
          this._barSize * 0.5,
          this._barSize * 0.5
        ],
        clipRect
      });
    }
  }
}

_registerScrollPanelFactory((options) => new ScrollPanel(options));
