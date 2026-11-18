import { SplitGroup, type UiPanelComponent, uiWindowPointToLocal } from '@galfus/ui';

const exact = (value: number) => ({ type: 'exact' as const, value: Math.max(1, value) });
const sashSize = 6;

/** Layout using the same SplitGroup sizing rules with core-owned interactive panels. */
export function createEditorSplits(
  root: UiPanelComponent,
  panels: {
    hierarchy: UiPanelComponent;
    viewport: UiPanelComponent;
    inspector: UiPanelComponent;
    assets: UiPanelComponent;
  },
  onViewportResize: (width: number, height: number) => void
) {
  const vertical = new SplitGroup({ orientation: 'vertical', handleSize: sashSize });
  const body = vertical.addPanel({ flex: 3, minHeight: 100 });
  const bottom = vertical.addPanel({ flex: 1, minHeight: 80 });
  const horizontal = new SplitGroup({ orientation: 'horizontal', handleSize: sashSize });
  const left = horizontal.addPanel({ flex: 0.18, minWidth: 100 });
  const center = horizontal.addPanel({ flex: 0.6, minWidth: 100 });
  const right = horizontal.addPanel({ flex: 0.22, minWidth: 100 });
  const sashes = [0, 1, 2].map(() => root.addPanel({ backgroundColor: [0.2, 0.23, 0.27, 1] }));
  let width = 960;
  let height = 720;
  const place = (
    panel: UiPanelComponent,
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    panel.setLayout({
      ...panel.layout,
      width: exact(rect.width),
      height: exact(rect.height),
      positionOffset: [rect.x, rect.y]
    });
  };
  const update = () => {
    vertical.applyRect({ x: 0, y: 84, width, height: Math.max(1, height - 106) });
    horizontal.applyRect(body.rect);
    place(panels.hierarchy, left.rect);
    place(panels.viewport, center.rect);
    place(panels.inspector, right.rect);
    place(panels.assets, bottom.rect);
    place(sashes[0]!, {
      x: left.rect.x + left.rect.width,
      y: body.rect.y,
      width: sashSize,
      height: body.rect.height
    });
    place(sashes[1]!, {
      x: center.rect.x + center.rect.width,
      y: body.rect.y,
      width: sashSize,
      height: body.rect.height
    });
    place(sashes[2]!, { x: 0, y: body.rect.y + body.rect.height, width, height: sashSize });
    onViewportResize(
      Math.max(1, Math.round(center.rect.width)),
      Math.max(1, Math.round(center.rect.height))
    );
  };
  sashes.forEach((sash, index) => {
    let drag: { pointerId: number; windowId: number; last: number } | undefined;
    const coordinate = (windowId: number, position: readonly [number, number]) =>
      uiWindowPointToLocal(
        root.componentRoot.getRuntime(),
        root.componentRoot,
        windowId,
        position
      )?.[index === 2 ? 1 : 0];
    sash.on('down', ({ pointer, windowPosition }) => {
      if (!windowPosition) return;
      const last = coordinate(pointer.windowId, windowPosition);
      if (last !== undefined)
        drag = { pointerId: pointer.pointerId, windowId: pointer.windowId, last };
    });
    sash.on('pressmove', ({ pointer, windowPosition }) => {
      if (
        !drag ||
        !windowPosition ||
        pointer.windowId !== drag.windowId ||
        pointer.pointerId !== drag.pointerId
      )
        return;
      const current = coordinate(pointer.windowId, windowPosition);
      if (current === undefined) return;
      (index === 2 ? vertical : horizontal).moveSash(index === 2 ? 0 : index, current - drag.last);
      drag.last = current;
      update();
    });
    sash.on('pressup', ({ pointer }) => {
      if (drag?.windowId === pointer.windowId && drag.pointerId === pointer.pointerId)
        drag = undefined;
    });
    sash.on('cancel', ({ pointer }) => {
      if (drag?.windowId === pointer.windowId && drag.pointerId === pointer.pointerId)
        drag = undefined;
    });
  });
  return {
    horizontal,
    vertical,
    sashes,
    update,
    resize(w: number, h: number) {
      width = w;
      height = h;
      update();
    }
  };
}
