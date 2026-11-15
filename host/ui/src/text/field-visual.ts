import {
  getTextCarets,
  getTextSelectionRects,
  hitTestText,
  type InteractiveEvent,
  type UiTextCaret,
  type UiTextGeometry
} from '@galfus/engine';
import type { UiPanelComponent, UiTextComponent } from '../components/component';
import type { TextEditor } from './editor';

const PADDING = 8;
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
  private readonly rectangles: UiPanelComponent[] = [];
  private scrollX = 0;
  private scrollY = 0;
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
    const innerWidth = Math.max(1, width - 2 * PADDING);
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
    this.bind(panel);
    this.bind(this.selectionLayer);
    this.bind(this.caret);
  }
  private bind(panel: UiPanelComponent): void {
    this.stop.push(panel.on('down', (event) => this.pointer(event, false)));
    this.stop.push(panel.on('pressmove', (event) => this.pointer(event, true)));
  }
  setText(value: string): void {
    if (this.text.text !== value) {
      this.geometry = undefined;
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
    const left = bounds[0] + PADDING,
      right = bounds[0] + bounds[2] - PADDING;
    const top = bounds[1] + PADDING,
      bottom = bounds[1] + bounds[3] - PADDING;
    let dx = 0,
      dy = 0;
    if (focused) {
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
    }
    // Core layout is represented as f32; ignore subpixel rounding noise so
    // cursor correction converges and selection decorations can be updated.
    if (Math.abs(dx) < 0.01) dx = 0;
    if (Math.abs(dy) < 0.01) dy = 0;
    if (dx || dy) {
      this.scrollX = Math.max(0, this.scrollX + dx);
      this.scrollY = Math.max(0, this.scrollY + dy);
      this.text.setLayout({
        ...this.text.layout,
        positionOffset: [PADDING - this.scrollX, PADDING - this.scrollY]
      });
      return undefined;
    }
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
