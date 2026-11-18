import type { PanelResizeOptions, UiRect } from '../layout/types';
import type { UiHitTarget, UiHost, UiNode } from './node';
import type { Panel } from './panel';

export function hitTestPanel(
  id: string,
  rect: UiRect,
  children: readonly UiNode[],
  resizable: PanelResizeOptions | undefined,
  draggable: boolean,
  title: string | undefined,
  headerOffset: number,
  x: number,
  y: number
): UiHitTarget | undefined {
  if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) {
    return undefined;
  }

  if (resizable) {
    const hSize = resizable.handleSize ?? 8;
    const r = rect;
    if (
      x >= r.x + r.width - hSize &&
      x <= r.x + r.width &&
      y >= r.y + r.height - hSize &&
      y <= r.y + r.height
    ) {
      return { id: `${id}-res-c`, type: 'resize' };
    }
    if (x >= r.x + r.width - hSize && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
      return { id: `${id}-res-r`, type: 'resize' };
    }
    if (x >= r.x && x <= r.x + r.width && y >= r.y + r.height - hSize && y <= r.y + r.height) {
      return { id: `${id}-res-b`, type: 'resize' };
    }
  }

  if (draggable && title !== undefined) {
    const hh = headerOffset;
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + hh) {
      return { id: `${id}-header`, type: 'header' };
    }
  }

  for (let i = children.length - 1; i >= 0; i--) {
    const hit = children[i]!.hitTest?.(x, y);
    if (hit) return hit;
  }

  return { id: id, type: 'panel' };
}

export function hitTestPanelScroll(
  id: string,
  rect: UiRect,
  children: readonly UiNode[],
  hasScroll: boolean,
  x: number,
  y: number
): UiHitTarget | undefined {
  if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) return;
  for (let i = children.length - 1; i >= 0; i--) {
    const hit = children[i]!.hitTestScroll?.(x, y);
    if (hit) return hit;
  }
  return hasScroll ? { id, type: 'panel' } : undefined;
}

const boundDraggables = new WeakSet<Panel>();

export function bindPanelDraggable(
  host: UiHost,
  panel: Panel,
  draggable: boolean,
  title: string | undefined
): void {
  if (!draggable || title === undefined) return;
  if (boundDraggables.has(panel)) return;
  boundDraggables.add(panel);
  let lastPos: [number, number] | undefined;
  const header = host.listen(`${panel.id}-header`);
  header.on('down', ({ pointer }) => {
    if (pointer) {
      lastPos = [pointer.position[0], pointer.position[1]];
    }
  });
  header.on('pressmove', ({ pointer }) => {
    if (!lastPos) return;
    const dx = pointer.position[0] - lastPos[0];
    const dy = pointer.position[1] - lastPos[1];
    lastPos = [pointer.position[0], pointer.position[1]];
    panel.moveBy(dx, dy);
  });
  header.on('pressup', () => (lastPos = undefined));
  header.on('cancel', () => (lastPos = undefined));
}

const boundResizables = new WeakSet<Panel>();

export function bindPanelResizable(
  host: UiHost,
  panel: Panel,
  resizable?: PanelResizeOptions
): void {
  if (!resizable) return;
  if (boundResizables.has(panel)) return;
  boundResizables.add(panel);
  const edges = resizable.edges ?? ['right', 'bottom', 'corner'];
  const bindEdge = (suffix: string, horiz: boolean, vert: boolean) => {
    let lastPos: [number, number] | undefined;
    const listener = host.listen(`${panel.id}-${suffix}`);
    listener.on('down', ({ pointer }) => {
      if (pointer) {
        lastPos = [pointer.position[0], pointer.position[1]];
      }
    });
    listener.on('pressmove', ({ pointer }) => {
      if (!lastPos) return;
      const dx = horiz ? pointer.position[0] - lastPos[0] : 0;
      const dy = vert ? pointer.position[1] - lastPos[1] : 0;
      lastPos = [pointer.position[0], pointer.position[1]];
      panel.setSize(panel.rect.width + dx, panel.rect.height + dy);
    });
    listener.on('pressup', () => (lastPos = undefined));
    listener.on('cancel', () => (lastPos = undefined));
  };
  if (edges.includes('corner')) bindEdge('res-c', true, true);
  if (edges.includes('right')) bindEdge('res-r', true, false);
  if (edges.includes('bottom')) bindEdge('res-b', false, true);
}
