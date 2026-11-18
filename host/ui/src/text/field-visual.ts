import {
  getTextCarets,
  getTextSelectionRects,
  hitTestText,
  type InteractiveEvent,
  type UiTextCaret,
  type UiTextGeometry
} from '@galfus/engine';
import type { UiPanelComponent, UiTextComponent } from '../components/component';
import { uiWindowPointToLocal } from './coordinates';
import type { TextEditor } from './editor';

const PADDING = 8;
const SCROLLBAR_WIDTH = 6;
const SCROLLBAR_MARGIN = 4;
const SCROLLBAR_RESERVE = SCROLLBAR_WIDTH + SCROLLBAR_MARGIN * 2;

function mergeSelection(
  rectangles: [number, number, number, number][]
): [number, number, number, number][] {
  const sorted = rectangles
    .map((rect) => [...rect] as [number, number, number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const merged: [number, number, number, number][] = [];
  for (const rect of sorted) {
    const previous = merged.at(-1);
    if (
      previous &&
      Math.abs(previous[1] - rect[1]) < 0.01 &&
      Math.abs(previous[3] - rect[3]) < 0.01 &&
      rect[0] <= previous[0] + previous[2] + 0.01
    ) {
      previous[2] = Math.max(previous[0] + previous[2], rect[0] + rect[2]) - previous[0];
    } else merged.push(rect);
  }
  return merged;
}
/** Core-derived text, selection, and caret visuals inside a clipped panel. */
export class TextFieldVisual {
  readonly text: UiTextComponent;
  private readonly selectionLayer: UiPanelComponent;
  private readonly caret: UiPanelComponent;
  private readonly scrollTrack?: UiPanelComponent;
  private readonly scrollThumb?: UiPanelComponent;
  private readonly rectangles: UiPanelComponent[] = [];
  private scrollX = 0;
  private scrollY = 0;
  private followCaret = true;
  private geometry?: UiTextGeometry;
  private preferredX?: number;
  private readonly stop: (() => void)[] = [];
  constructor(
    readonly panel: UiPanelComponent,
    readonly editor: TextEditor,
    readonly multiline: boolean,
    width: number,
    private readonly pointer: (event: InteractiveEvent, drag: boolean) => void
  ) {
    const innerWidth = Math.max(1, width - 2 * PADDING - (multiline ? SCROLLBAR_RESERVE : 0));
    this.selectionLayer = panel.addPanel(
      { backgroundColor: [0, 0, 0, 0] },
      {
        width: { type: 'percent', value: 100 },
        height: { type: 'percent', value: 100 },
        isStack: true
      }
    );
    this.text = panel.addText(
      editor.displayValue,
      undefined,
      { multiline, wrap: multiline ? 'wordWrap' : 'noWrap' },
      {
        positionOffset: [PADDING, PADDING],
        ...(multiline ? { width: { type: 'exact', value: innerWidth } } : {})
      }
    );
    this.caret = panel.addPanel(
      { backgroundColor: [1, 1, 1, 1] },
      {
        width: { type: 'exact', value: 1 },
        height: { type: 'exact', value: 1 },
        positionOffset: [PADDING, PADDING]
      }
    );
    this.caret.setVisible(false);
    if (multiline) {
      this.scrollTrack = panel.addPanel(
        { backgroundColor: [0.04, 0.07, 0.11, 0.85], borderRadius: [3, 3, 3, 3] },
        {
          width: { type: 'exact', value: SCROLLBAR_WIDTH },
          height: { type: 'exact', value: 1 },
          positionOffset: [
            Math.max(PADDING, width - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN),
            SCROLLBAR_MARGIN
          ]
        }
      );
      this.scrollThumb = panel.addPanel(
        { backgroundColor: [0.38, 0.56, 0.76, 0.9], borderRadius: [3, 3, 3, 3] },
        {
          width: { type: 'exact', value: SCROLLBAR_WIDTH },
          height: { type: 'exact', value: 1 },
          positionOffset: [
            Math.max(PADDING, width - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN),
            SCROLLBAR_MARGIN
          ]
        }
      );
      this.scrollThumb.setVisible(false);
      this.bindScrollbar(this.scrollTrack);
      this.bindScrollbar(this.scrollThumb);
    }
    this.bind(panel);
    this.bind(this.selectionLayer);
    this.bind(this.caret);
  }
  private bind(panel: UiPanelComponent): void {
    this.stop.push(panel.on('down', (event) => this.pointer(event, false)));
    this.stop.push(panel.on('pressmove', (event) => this.pointer(event, true)));
    this.stop.push(panel.on('scroll', (event) => this.onScroll(event)));
  }
  private bindScrollbar(part: UiPanelComponent): void {
    this.stop.push(part.on('down', (event) => this.onScrollbarPointer(event)));
    this.stop.push(part.on('pressmove', (event) => this.onScrollbarPointer(event)));
    this.stop.push(part.on('scroll', (event) => this.onScroll(event)));
  }
  requestFollowCaret(): void {
    this.followCaret = true;
  }
  setSize(width: number): void {
    if (!this.multiline) return;
    const innerWidth = Math.max(1, width - 2 * PADDING - SCROLLBAR_RESERVE);
    this.text.setLayout({
      ...this.text.layout,
      width: { type: 'exact', value: innerWidth }
    });
  }
  setText(value: string): void {
    if (this.text.text !== value) {
      this.geometry = undefined;
      this.followCaret = true;
      this.text.setText(value);
    }
  }
  /** Read only from the last successfully presented frame. */
  readGeometry(): UiTextGeometry {
    const root = this.panel.componentRoot;
    const geometry = root.realm.getUiTextGeometry(root.handle, this.text.id);
    if (geometry.lines.length) return geometry;
    const rect = root.realm.getUiLayout(root.handle, this.text.id).absoluteRect;
    const font = this.text.resolvedStyle.kind.fontSize ?? 14;
    return { clusters: [], lines: [{ start: 0, end: 0, rect: [rect[0], rect[1], 0, font * 1.2] }] };
  }
  hit(x: number, y: number): UiTextCaret | undefined {
    if (!this.geometry) return undefined;
    const caret = hitTestText(this.geometry, x, y);
    this.preferredX = caret.rect[0];
    return caret;
  }
  moveVertical(direction: -1 | 1, extend: boolean): boolean {
    if (!this.geometry || this.editor.composition) return false;
    const current = this.findCaret(this.geometry, this.editor.selection.focus);
    const next = current.line + direction;
    const line = this.geometry.lines[next];
    if (!line) return true;
    const x = this.preferredX ?? current.rect[0];
    this.preferredX = x;
    const target = hitTestText(this.geometry, x, line.rect[1] + line.rect[3] / 2);
    this.editor.setSelection(extend ? this.editor.selection.anchor : target.offset, target.offset);
    return true;
  }
  moveLineBoundary(end: boolean, extend: boolean): boolean {
    if (!this.geometry || this.editor.composition) return false;
    const current = this.findCaret(this.geometry, this.editor.selection.focus);
    const line = this.geometry.lines[current.line];
    if (!line) return false;
    const offset = end ? line.end : line.start;
    this.editor.setSelection(extend ? this.editor.selection.anchor : offset, offset);
    this.preferredX = undefined;
    return true;
  }
  resetPreferredX(): void {
    this.preferredX = undefined;
  }
  /** Updates decorations; may stage a text scroll to reveal the caret. */
  update(focused: boolean): UiTextCaret | undefined {
    const geometry = this.readGeometry();
    this.geometry = geometry;
    const selection = this.editor.selection;
    const start = Math.min(selection.anchor, selection.focus);
    const composition = this.editor.composition;
    const offset = composition
      ? start + (composition.selection?.[1] ?? composition.text.length)
      : selection.focus;
    const caret = this.findCaret(geometry, offset);
    const root = this.panel.componentRoot;
    const bounds = root.realm.getUiLayout(root.handle, this.panel.id).absoluteRect;
    const contentHeight = this.computeContentHeight(geometry);
    const viewportHeight = Math.max(1, bounds[3] - 2 * PADDING);
    const maxScrollY = Math.max(0, contentHeight - viewportHeight);
    const left = bounds[0] + PADDING,
      right = bounds[0] + bounds[2] - PADDING - (this.multiline ? SCROLLBAR_RESERVE : 0);
    const top = bounds[1] + PADDING,
      bottom = bounds[1] + bounds[3] - PADDING;
    let dx = 0,
      dy = 0;
    if (focused && this.followCaret) {
      dx =
        caret.rect[0] > right
          ? caret.rect[0] - right
          : caret.rect[0] < left
            ? caret.rect[0] - left
            : 0;
      if (this.multiline)
        dy =
          caret.rect[1] + caret.rect[3] > bottom
            ? caret.rect[1] + caret.rect[3] - bottom
            : caret.rect[1] < top
              ? caret.rect[1] - top
              : 0;
    } else if (this.multiline && this.scrollY > maxScrollY + 0.01) {
      dy = maxScrollY - this.scrollY;
    }
    // Core layout is represented as f32; ignore subpixel rounding noise so
    // cursor correction converges and selection decorations can be updated.
    if (Math.abs(dx) < 0.01) dx = 0;
    if (Math.abs(dy) < 0.01) dy = 0;
    if (dx || dy) {
      this.scrollX = Math.max(0, this.scrollX + dx);
      this.scrollY = Math.max(0, Math.min(maxScrollY, this.scrollY + dy));
      this.text.setLayout({
        ...this.text.layout,
        positionOffset: [PADDING - this.scrollX, PADDING - this.scrollY]
      });
      this.updateScrollbar(bounds, contentHeight, viewportHeight, maxScrollY);
      return undefined;
    }
    if (focused) this.followCaret = false;
    this.updateScrollbar(bounds, contentHeight, viewportHeight, maxScrollY);
    const caretLayout = {
      width: { type: 'exact' as const, value: 1 },
      height: { type: 'exact' as const, value: Math.max(1, caret.rect[3]) },
      positionOffset: [caret.rect[0] - bounds[0], caret.rect[1] - bounds[1]] as [number, number]
    };
    if (JSON.stringify(this.caret.layout) !== JSON.stringify(caretLayout))
      this.caret.setLayout(caretLayout);
    if (this.caret.visible !== focused) this.caret.setVisible(focused);
    const rects =
      focused && !composition && selection.anchor !== selection.focus
        ? mergeSelection(getTextSelectionRects(geometry, selection.anchor, selection.focus))
        : [];
    for (let i = this.rectangles.length - 1; i >= 0; i--)
      if (!this.rectangles[i]!.isAttached) this.rectangles.splice(i, 1);
    while (this.rectangles.length < rects.length) {
      const panel = this.selectionLayer.addPanel({ backgroundColor: [0.22, 0.48, 0.75, 0.65] });
      this.rectangles.push(panel);
      this.bind(panel);
    }
    this.rectangles.forEach((panel, index) => {
      const rect = rects[index];
      if (!rect) {
        if (panel.visible) panel.setVisible(false);
        return;
      }
      const layout = {
        width: { type: 'exact' as const, value: rect[2] },
        height: { type: 'exact' as const, value: rect[3] },
        positionOffset: [rect[0] - bounds[0], rect[1] - bounds[1]] as [number, number]
      };
      if (JSON.stringify(panel.layout) !== JSON.stringify(layout)) panel.setLayout(layout);
      if (!panel.visible) panel.setVisible(true);
    });
    return caret;
  }
  private computeContentHeight(geometry: UiTextGeometry): number {
    if (!geometry.lines.length) return 0;
    const first = geometry.lines[0]!;
    const last = geometry.lines.at(-1)!;
    return Math.max(0, last.rect[1] + last.rect[3] - first.rect[1]);
  }
  private updateScrollbar(
    bounds: readonly [number, number, number, number],
    contentHeight: number,
    viewportHeight: number,
    maxScrollY: number
  ): void {
    if (!this.multiline || !this.scrollTrack || !this.scrollThumb) return;
    const trackX = Math.max(PADDING, bounds[2] - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN);
    const trackY = SCROLLBAR_MARGIN;
    const trackH = Math.max(8, bounds[3] - SCROLLBAR_MARGIN * 2);
    const trackLayout = {
      width: { type: 'exact' as const, value: SCROLLBAR_WIDTH },
      height: { type: 'exact' as const, value: trackH },
      positionOffset: [trackX, trackY] as [number, number]
    };
    if (JSON.stringify(this.scrollTrack.layout) !== JSON.stringify(trackLayout))
      this.scrollTrack.setLayout(trackLayout);
    if (!this.scrollTrack.visible) this.scrollTrack.setVisible(true);
    if (maxScrollY <= 0.5) {
      if (this.scrollThumb.visible) this.scrollThumb.setVisible(false);
      return;
    }
    const ratio = Math.min(1, viewportHeight / Math.max(1, contentHeight));
    const thumbH = Math.max(Math.min(18, trackH), Math.round(trackH * ratio));
    const progress = Math.max(0, Math.min(1, this.scrollY / maxScrollY));
    const thumbY = trackY + (trackH - thumbH) * progress;
    const thumbLayout = {
      width: { type: 'exact' as const, value: SCROLLBAR_WIDTH },
      height: { type: 'exact' as const, value: thumbH },
      positionOffset: [trackX, thumbY] as [number, number]
    };
    if (JSON.stringify(this.scrollThumb.layout) !== JSON.stringify(thumbLayout))
      this.scrollThumb.setLayout(thumbLayout);
    if (!this.scrollThumb.visible) this.scrollThumb.setVisible(true);
  }
  private applyScrollY(nextY: number): void {
    const root = this.panel.componentRoot;
    if (root.syncState === 'disposed' || !this.panel.isAttached) return;
    const geometry = this.geometry ?? this.readGeometry();
    this.geometry = geometry;
    const bounds = root.realm.getUiLayout(root.handle, this.panel.id).absoluteRect;
    const contentHeight = this.computeContentHeight(geometry);
    const viewportHeight = Math.max(1, bounds[3] - 2 * PADDING);
    const maxScrollY = Math.max(0, contentHeight - viewportHeight);
    const clampedY = Math.max(0, Math.min(maxScrollY, nextY));
    const dy = clampedY - this.scrollY;
    this.followCaret = false;
    if (Math.abs(dy) < 0.01) return;
    this.scrollY = clampedY;
    this.text.setLayout({
      ...this.text.layout,
      positionOffset: [PADDING - this.scrollX, PADDING - this.scrollY]
    });
    const caretOffset = this.caret.layout.positionOffset;
    if (caretOffset) {
      this.caret.setLayout({
        ...this.caret.layout,
        positionOffset: [caretOffset[0], caretOffset[1] - dy]
      });
    }
    for (const rectPanel of this.rectangles) {
      const off = rectPanel.layout.positionOffset;
      if (rectPanel.visible && off) {
        rectPanel.setLayout({
          ...rectPanel.layout,
          positionOffset: [off[0], off[1] - dy]
        });
      }
    }
    this.updateScrollbar(bounds, contentHeight, viewportHeight, maxScrollY);
    if ((root.syncState as string) === 'pending') root.flush();
  }
  private onScroll(event: InteractiveEvent): void {
    if (!this.multiline || !this.panel.isAttached) return;
    const delta =
      event.scrollDelta ?? (event.pointer.type === 'scroll' ? event.pointer.delta : undefined);
    if (!delta) return;
    const [dx, dy] = 'pixels' in delta ? delta.pixels : [delta.lines[0] * 28, delta.lines[1] * 28];
    const amount = dy || dx;
    if (!Number.isFinite(amount) || amount === 0) return;
    this.applyScrollY(this.scrollY - amount);
  }
  private onScrollbarPointer(event: InteractiveEvent): void {
    if (!this.multiline || !this.panel.isAttached) return;
    const root = this.panel.componentRoot;
    const bounds = root.realm.getUiLayout(root.handle, this.panel.id).absoluteRect;
    const viewport = root.realm.getUiLayout(root.handle, root.root.id).absoluteRect;
    const point =
      event.windowPosition &&
      uiWindowPointToLocal(root.getRuntime(), root, event.pointer.windowId, event.windowPosition);
    const local =
      point ??
      (event.uv ? [event.uv[0] * viewport[2], (1 - event.uv[1]) * viewport[3]] : undefined);
    if (!local) return;
    const geometry = this.geometry ?? this.readGeometry();
    const contentHeight = this.computeContentHeight(geometry);
    const viewportHeight = Math.max(1, bounds[3] - 2 * PADDING);
    const maxScrollY = Math.max(0, contentHeight - viewportHeight);
    if (maxScrollY <= 0) return;
    const trackY = bounds[1] + SCROLLBAR_MARGIN;
    const trackH = Math.max(8, bounds[3] - SCROLLBAR_MARGIN * 2);
    const ratio = Math.max(0, Math.min(1, (local[1]! - trackY) / trackH));
    this.applyScrollY(ratio * maxScrollY);
  }
  private findCaret(geometry: UiTextGeometry, offset: number): UiTextCaret {
    let positions: UiTextCaret[];
    try {
      positions = getTextCarets(geometry, offset);
    } catch {
      const candidates = [
        ...new Set(
          geometry.lines
            .flatMap((line) => [line.start, line.end])
            .concat(
              geometry.clusters.flatMap((cluster) => [
                cluster.start,
                cluster.end,
                ...(cluster.carets ?? []).map((c) => c.offset)
              ])
            )
        )
      ];
      const nearest = candidates.reduce(
        (a, b) => (Math.abs(b - offset) < Math.abs(a - offset) ? b : a),
        0
      );
      positions = getTextCarets(geometry, nearest).map((item) => ({ ...item, approximate: true }));
    }
    return this.preferredX === undefined
      ? positions[0]!
      : positions.reduce((a, b) =>
          Math.abs(b.rect[0] - this.preferredX!) < Math.abs(a.rect[0] - this.preferredX!) ? b : a
        );
  }
  dispose(): void {
    for (const stop of this.stop) stop();
  }
}
