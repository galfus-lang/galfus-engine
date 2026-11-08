import { describe, expect, test } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { advanceFrame } from '../../engine/test/controlled-transport';
import { button, move } from '../../engine/test/interactive-fixture';
import { createUi } from '../src/index';

function createPanelTestEnv(width = 800, height = 600) {
  const events: PlatformEvent[] = [];
  const attrUpdates: Array<{ elementId: string; name: string; value: string }> = [];
  const rects = new Map<string, { x: number; y: number; width: number; height: number }>();
  let latestSource = '';
  let viewportW = width;
  let viewportH = height;

  const parseSvgRects = (xml: string) => {
    const svgMatch = xml.match(/<svg[^>]*width="([^"]+)"[^>]*height="([^"]+)"/);
    if (svgMatch) {
      viewportW = Number(svgMatch[1]);
      viewportH = Number(svgMatch[2]);
    }
    const re = /<rect\s+[^>]*id="([^"]+)"[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const tag = m[0];
      const id = m[1]!;
      const x = Number(tag.match(/\bx="([^"]+)"/)?.[1] ?? 0);
      const y = Number(tag.match(/\by="([^"]+)"/)?.[1] ?? 0);
      const w = Number(tag.match(/\bwidth="([^"]+)"/)?.[1] ?? 0);
      const h = Number(tag.match(/\bheight="([^"]+)"/)?.[1] ?? 0);
      rects.set(id, { x, y, width: w, height: h });
    }
  };

  const schedule = {
    targetBlocks: [
      {
        targetId: 1,
        invocations: [
          {
            invocationId: 1,
            realmId: 1,
            resolvedViewport: [0, 0, width, height],
            zIndex: 0,
            filters: []
          }
        ]
      }
    ]
  };

  const engine = new Proxy(
    {
      platformPumpEvents: () => events.splice(0),
      multiverseResolve: () => schedule,
      multiverseDispatch: () => {},
      realm2dCreateSvg: (_r: number, _id: number, desc: { source: string }) => {
        latestSource = desc.source;
        parseSvgRects(desc.source);
      },
      realm2dSetSvgSource: (_r: number, _id: number, source: string) => {
        latestSource = source;
        parseSvgRects(source);
      },
      realm2dSetSvgAttribute: (_r: number, _id: number, el: string, name: string, val: string) => {
        attrUpdates.push({ elementId: el, name, value: val });
        const cur = rects.get(el);
        if (cur && (name === 'x' || name === 'y' || name === 'width' || name === 'height')) {
          cur[name] = Number(val);
        }
      },
      realm2dGetSvgElementRect: (_r: number, _id: number, elementId: string) => {
        const found = rects.get(elementId);
        if (!found) return { rect: undefined };
        return {
          rect: {
            ...found,
            viewportWidth: viewportW,
            viewportHeight: viewportH
          }
        };
      }
    },
    { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => {}) }
  ) as unknown as GalfusEngine;

  const transport = {
    engine,
    isInitialized: true,
    isDisposed: false,
    isRunning: false,
    startLoop: () => {},
    stopLoop: () => {},
    dispose: () => {}
  } as unknown as GalfusTransport;

  const runtime = createRuntime(transport);
  const windowId = runtime.platform.window.create();
  const realm = runtime.createRealm2D(1);
  realm.createCamera({ orthoScale: height });
  const targetId = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
  runtime.multiverse.createInvocation({ realmId: 1, targetId });
  const ui = createUi(runtime);

  return {
    runtime,
    transport,
    realm,
    ui,
    windowId,
    events,
    attrUpdates,
    rects,
    getLatestSource: () => latestSource
  };
}

describe('UI Panels, SplitGroup, and ScrollPanel', () => {
  test('UiRoot generates valid SVG XML with nested panels, clipPaths, and images', () => {
    const { runtime, realm, ui, getLatestSource } = createPanelTestEnv(800, 600);
    try {
      const root = ui.createRoot(realm, {
        id: 'main-ui',
        width: 800,
        height: 600,
        padding: 10,
        layout: { type: 'horizontal', gap: 10 }
      });

      const left = root.addPanel({ id: 'sidebar', title: 'Explorer', width: 220 });
      left.addContent({
        id: 'thumb-1',
        height: 48,
        label: 'Preview Asset',
        textureId: 42
      });

      const right = root.addPanel({ id: 'editor', title: 'Viewport', flex: 1 });
      const xml = root.toSvgString();

      expect(xml).toContain('width="800" height="600" viewBox="0 0 800 600"');
      expect(xml).toContain('<clipPath id="sidebar-clip">');
      expect(xml).toContain('<image id="thumb-1-img"');
      expect(xml).toContain('textureId="42"');
      expect(left.rect.width).toBe(220);
      expect(right.rect.width).toBe(800 - 20 - 10 - 220);
      expect(getLatestSource()).toBe(xml);

      root.resizeViewport(1000, 700);
      expect(right.rect.width).toBe(1000 - 20 - 10 - 220);
      expect(root.toSvgString()).toContain('viewBox="0 0 1000 700"');
    } finally {
      runtime.dispose();
    }
  });

  test('SplitGroup divides panels and resizes via sash dragging without regenerating XML', () => {
    const { runtime, transport, realm, ui, windowId, events, attrUpdates, rects } =
      createPanelTestEnv(600, 400);
    try {
      const root = ui.createRoot(realm, {
        width: 600,
        height: 400,
        padding: 0,
        layout: { type: 'horizontal' }
      });
      const split = root.addSplitGroup({
        id: 'split-h',
        orientation: 'horizontal',
        handleSize: 6
      });
      const left = split.addPanel({ id: 'left-p', minWidth: 100 });
      const right = split.addPanel({ id: 'right-p', minWidth: 100 });

      // Total available = 600 - 6 = 594 -> 297 each
      expect(left.rect.width).toBeCloseTo(297, 3);
      expect(right.rect.width).toBeCloseTo(297, 3);

      advanceFrame(runtime, transport);
      attrUpdates.length = 0;

      const sashRect = rects.get('split-h-sash-0')!;
      expect(sashRect).toBeDefined();
      const startX = sashRect.x + sashRect.width * 0.5;
      const startY = sashRect.y + sashRect.height * 0.5;

      events.push(
        move(windowId, startX, startY),
        button(windowId, startX, startY, 'pressed'),
        move(windowId, startX + 50, startY),
        button(windowId, startX + 50, startY, 'released')
      );
      advanceFrame(runtime, transport);

      expect(left.rect.width).toBeCloseTo(347, 3);
      expect(right.rect.width).toBeCloseTo(247, 3);
      expect(attrUpdates.some((u) => u.elementId === 'left-p-bg' && u.name === 'width')).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  test('ScrollPanel clips overflow and scrolls via wheel events and scrollbar thumb drag', () => {
    const { runtime, transport, realm, ui, windowId, events, attrUpdates, rects } =
      createPanelTestEnv(400, 300);
    try {
      const root = ui.createRoot(realm, {
        width: 400,
        height: 300,
        padding: 0,
        layout: { type: 'vertical' }
      });
      const scroll = root.addScrollPanel({
        id: 'list-scroll',
        title: 'Items',
        flex: 1,
        padding: 8,
        layout: { type: 'vertical', gap: 8 }
      });

      for (let i = 0; i < 10; i++) {
        scroll.addContent({ id: `row-${i}`, height: 48, label: `Item ${i}` });
      }

      expect(scroll.contentHeight).toBeGreaterThan(scroll.viewportRect.height);
      expect(scroll.maxScrollY).toBeGreaterThan(0);

      advanceFrame(runtime, transport);
      attrUpdates.length = 0;

      // Wheel scroll inside the viewport
      events.push(move(windowId, 120, 150), {
        kind: 'pointer',
        type: 'scroll',
        windowId,
        pointerId: 0,
        pointerType: 'mouse',
        position: [120, 150],
        delta: { pixels: [0, -60] }
      });
      advanceFrame(runtime, transport);

      expect(scroll.scrollY).toBeCloseTo(60, 3);
      expect(
        attrUpdates.some(
          (u) =>
            u.elementId === 'list-scroll-content' &&
            u.name === 'transform' &&
            u.value === 'translate(0 -60)'
        )
      ).toBe(true);

      // Drag the vertical scrollbar thumb downward
      const thumb = rects.get('list-scroll-vthumb')!;
      expect(thumb).toBeDefined();
      const tx = thumb.x + thumb.width * 0.5;
      const ty = thumb.y + thumb.height * 0.5;
      events.push(
        move(windowId, tx, ty),
        button(windowId, tx, ty, 'pressed'),
        move(windowId, tx, ty + 40),
        button(windowId, tx, ty + 40, 'released')
      );
      advanceFrame(runtime, transport);
      expect(scroll.scrollY).toBeGreaterThan(60);
    } finally {
      runtime.dispose();
    }
  });

  test('Floating Panel supports header dragging and corner resizing', () => {
    const { runtime, transport, realm, ui, windowId, events, rects } = createPanelTestEnv(800, 600);
    try {
      const root = ui.createRoot(realm, {
        width: 800,
        height: 600,
        padding: 0,
        layout: { type: 'free' }
      });
      const floating = root.addPanel({
        id: 'float-win',
        title: 'Inspector',
        x: 100,
        y: 80,
        width: 240,
        height: 180,
        draggable: true,
        resizable: true
      });

      advanceFrame(runtime, transport);

      // Drag header by (+30, +20)
      const hdr = rects.get('float-win-header')!;
      const hx = hdr.x + 40;
      const hy = hdr.y + 10;
      events.push(
        move(windowId, hx, hy),
        button(windowId, hx, hy, 'pressed'),
        move(windowId, hx + 30, hy + 20),
        button(windowId, hx + 30, hy + 20, 'released')
      );
      advanceFrame(runtime, transport);
      expect(floating.rect.x).toBe(130);
      expect(floating.rect.y).toBe(100);

      // Resize corner handle by (+40, +30)
      const corner = rects.get('float-win-res-c')!;
      const cx = corner.x + corner.width * 0.5;
      const cy = corner.y + corner.height * 0.5;
      events.push(
        move(windowId, cx, cy),
        button(windowId, cx, cy, 'pressed'),
        move(windowId, cx + 40, cy + 30),
        button(windowId, cx + 40, cy + 30, 'released')
      );
      advanceFrame(runtime, transport);
      expect(floating.rect.x).toBe(130);
      expect(floating.rect.y).toBe(100);
      expect(floating.rect.width).toBe(280);
      expect(floating.rect.height).toBe(210);
    } finally {
      runtime.dispose();
    }
  });

  test('Nested floating Panel inside a SplitGroup keeps local coordinates across drag and resize', () => {
    const { runtime, transport, realm, ui, windowId, events, rects } = createPanelTestEnv(900, 600);
    try {
      const root = ui.createRoot(realm, {
        width: 900,
        height: 600,
        padding: 0,
        layout: { type: 'horizontal' }
      });
      const split = root.addSplitGroup({ orientation: 'horizontal', handleSize: 6 });
      split.addPanel({ id: 'left-dock', flex: 1 });
      const rightDock = split.addPanel({
        id: 'right-dock',
        title: 'Right Dock',
        flex: 1,
        padding: 10,
        layout: { type: 'free' }
      });
      const floating = rightDock.addPanel({
        id: 'nested-float',
        title: 'Tool',
        x: 15,
        y: 20,
        width: 180,
        height: 140,
        draggable: true,
        resizable: true
      });

      const startX = floating.rect.x;
      const startY = floating.rect.y;
      expect(startX).toBeGreaterThan(400);

      advanceFrame(runtime, transport);

      // 1. Drag header by (+25, +15)
      const hdr = rects.get('nested-float-header')!;
      const hx = hdr.x + 30;
      const hy = hdr.y + 10;
      events.push(
        move(windowId, hx, hy),
        button(windowId, hx, hy, 'pressed'),
        move(windowId, hx + 25, hy + 15),
        button(windowId, hx + 25, hy + 15, 'released')
      );
      advanceFrame(runtime, transport);
      expect(floating.rect.x).toBeCloseTo(startX + 25, 3);
      expect(floating.rect.y).toBeCloseTo(startY + 15, 3);
      expect(floating.constraints.x).toBeCloseTo(40, 3);
      expect(floating.constraints.y).toBeCloseTo(35, 3);

      // 2. Resize corner by (+20, +20) — must not jump or teleport outside rightDock!
      const corner = rects.get('nested-float-res-c')!;
      const cx = corner.x + corner.width * 0.5;
      const cy = corner.y + corner.height * 0.5;
      events.push(
        move(windowId, cx, cy),
        button(windowId, cx, cy, 'pressed'),
        move(windowId, cx + 20, cy + 20),
        button(windowId, cx + 20, cy + 20, 'released')
      );
      advanceFrame(runtime, transport);
      expect(floating.rect.x).toBeCloseTo(startX + 25, 3);
      expect(floating.rect.y).toBeCloseTo(startY + 15, 3);
      expect(floating.rect.width).toBeCloseTo(200, 3);
      expect(floating.rect.height).toBeCloseTo(160, 3);
    } finally {
      runtime.dispose();
    }
  });
});
