import { describe, expect, test } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createUi } from '../src/index';

function createPanelTestEnv(width = 800, height = 600) {
  const events: PlatformEvent[] = [];
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
      realm2dCreateUi: () => {},
      realm2dSetUiContent: () => {}
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
  const realm = runtime.createRealm2D(1);
  realm.createCamera({ orthoScale: height });
  const ui = createUi(runtime);

  return {
    runtime,
    realm,
    ui
  };
}

describe('UI Panels, SplitGroup, and ScrollPanel', () => {
  test('UiRoot compiles native Model2DUI quads and texts with nested hierarchy', () => {
    const { runtime, realm, ui } = createPanelTestEnv(800, 600);
    try {
      const root = ui.createRoot(realm, {
        id: 'main-ui',
        width: 800,
        height: 600,
        padding: 10,
        layout: { type: 'horizontal', gap: 10 }
      });

      const left = root.addPanel({ id: 'sidebar', title: 'Explorer', width: 220 });
      left.addText({ text: 'Preview Asset', fontSize: 13 });
      left.addSpritePanel({ width: 32, height: 32, textureId: 42 });

      const right = root.addPanel({ id: 'editor', title: 'Viewport', flex: 1 });
      right.addText({ text: 'Editor Viewport', fontSize: 14 });

      const compiled = root.compileUi();
      expect(compiled.quads.length).toBeGreaterThan(0);
      expect(compiled.texts.length).toBeGreaterThan(0);
      expect(left.rect.width).toBe(220);
      expect(right.rect.width).toBe(800 - 20 - 10 - 220);

      // Verify text descriptions
      const assetTxt = compiled.texts.find((t) => t.text === 'Preview Asset');
      expect(assetTxt).toBeDefined();
      expect(assetTxt?.fontSize).toBe(13);

      // Resizing viewport updates layout cleanly
      root.resizeViewport(1000, 700);
      expect(right.rect.width).toBe(1000 - 20 - 10 - 220);
      const recompiled = root.compileUi();
      expect(recompiled.quads.length).toBeGreaterThan(0);
    } finally {
      runtime.dispose();
    }
  });

  test('SplitGroup divides panels and resizes proportions', () => {
    const { runtime, realm, ui } = createPanelTestEnv(600, 400);
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

      // Move sash by 50px
      split.moveSash(0, 50);
      expect(left.rect.width).toBeCloseTo(347, 3);
      expect(right.rect.width).toBeCloseTo(247, 3);

      const compiled = root.compileUi();
      expect(compiled.quads.length).toBeGreaterThanOrEqual(2);
    } finally {
      runtime.dispose();
    }
  });

  test('ScrollPanel calculates scroll limits and clips children with scissor quads', () => {
    const { runtime, realm, ui } = createPanelTestEnv(400, 300);
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
        scroll.addText({ id: `row-${i}`, height: 48, text: `Item ${i}` });
      }

      expect(scroll.contentHeight).toBeGreaterThan(scroll.viewportRect.height);
      expect(scroll.maxScrollY).toBeGreaterThan(0);

      scroll.scrollTo(0, 60);
      expect(scroll.scrollY).toBeCloseTo(60, 3);

      const compiled = root.compileUi();
      expect(compiled.quads.length).toBeGreaterThan(0);
      // Items should receive the scissor clip rect of the viewport
      const itemTexts = compiled.texts.filter((t) => t.text?.startsWith('Item '));
      expect(itemTexts.length).toBe(10);
      for (const t of itemTexts) {
        expect(t.clipRect).toBeDefined();
      }
    } finally {
      runtime.dispose();
    }
  });

  test('Floating Panel supports direct dragging and sizing constraints', () => {
    const { runtime, realm, ui } = createPanelTestEnv(800, 600);
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

      expect(floating.rect.x).toBe(100);
      expect(floating.rect.y).toBe(80);

      // Move by (+30, +20)
      floating.moveBy(30, 20);
      expect(floating.rect.x).toBe(130);
      expect(floating.rect.y).toBe(100);

      // Resize
      floating.setSize(280, 210);
      expect(floating.rect.width).toBe(280);
      expect(floating.rect.height).toBe(210);

      const compiled = root.compileUi();
      expect(compiled.quads.length).toBeGreaterThan(0);
    } finally {
      runtime.dispose();
    }
  });

  test('UiRoot routes pointer interactions to SplitGroup sash, ScrollPanel, and Panel callbacks', () => {
    const { runtime, realm, ui } = createPanelTestEnv(800, 600);
    try {
      const root = ui.createRoot(realm, {
        id: 'interactive-root',
        width: 800,
        height: 600,
        padding: 0,
        layout: { type: 'horizontal' }
      });

      const split = root.addSplitGroup({
        id: 'test-split',
        orientation: 'horizontal',
        handleSize: 6
      });

      const left = split.addScrollPanel({
        id: 'left-scroll',
        title: 'Scrollable Left',
        minWidth: 100,
        padding: 4,
        layout: { type: 'vertical', gap: 4 }
      });
      for (let i = 0; i < 20; i++) {
        left.addText({ text: `Item ${i}`, height: 40 });
      }

      const right = split.addPanel({
        id: 'right-panel',
        minWidth: 100
      });

      let clicked = false;
      let draggedDx = 0;
      let draggedDy = 0;
      right.onClick(() => {
        clicked = true;
      });
      right.onDrag((dx, dy) => {
        draggedDx += dx;
        draggedDy += dy;
      });

      const initialLeftWidth = left.rect.width; // 397
      const initialScrollY = left.scrollY; // 0

      // Get the root interactive listener
      const rootListener = root.interactiveListener!;

      // 1. Drag SplitGroup sash
      // Sash 0 is located at x = initialLeftWidth (397), y = 0..600, width = 6.
      // In local coordinates: localX = uiX - 400. At uiX = 398, localX = -2.
      // LocalY: uiY = 300, localY = 0.
      rootListener.emit({
        type: 'down',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'button',
          windowId: 1,
          pointerId: 0,
          pointerType: 'mouse',
          position: [-2, 0],
          button: 'primary',
          state: 'down'
        } as any
      });

      // Drag 40px to the right: uiX = 438 -> localX = 38
      rootListener.emit({
        type: 'pressmove',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'move',
          windowId: 1,
          pointerId: 0,
          pointerType: 'mouse',
          position: [38, 0]
        } as any
      });

      rootListener.emit({
        type: 'pressup',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'button',
          windowId: 1,
          pointerId: 0,
          pointerType: 'mouse',
          position: [38, 0]
        } as any
      });

      expect(left.rect.width).toBeCloseTo(initialLeftWidth + 40, 1);

      // 2. Scroll wheel over ScrollPanel
      // Left scroll panel is at x = 0..437, y = 0..600.
      // Point at uiX = 100, uiY = 200 -> localX = 100 - 400 = -300, localY = 300 - 200 = 100.
      rootListener.emit({
        type: 'scroll',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'scroll',
          windowId: 1,
          pointerId: 0,
          pointerType: 'mouse',
          position: [-300, 100],
          delta: { lines: [0, -2] }
        } as any,
        scrollDelta: { lines: [0, -2] }
      });

      expect(left.scrollY).toBeGreaterThan(initialScrollY);

      // 2b. Scroll using normalized UV coordinates (e.g. from Multiverse picking)
      const prevScrollY = left.scrollY;
      // UV [0.1, 0.8]: x = 0.1 * 800 = 80px (over left panel), y = (1.0 - 0.8) * 600 = 120px (over left panel)
      rootListener.emit({
        type: 'scroll',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        uv: [0.1, 0.8],
        pointer: {
          kind: 'pointer',
          type: 'scroll',
          windowId: 1,
          pointerId: 0,
          pointerType: 'mouse',
          position: [0, 0]
        } as any,
        scrollDelta: { lines: [0, -3] }
      });
      expect(left.scrollY).toBeGreaterThan(prevScrollY);

      // 3. Click and Drag on Right Panel
      // Right panel is at x = 443..800, y = 0..600.
      // Point at uiX = 600, uiY = 300 -> localX = 600 - 400 = 200, localY = 300 - 300 = 0.
      rootListener.emit({
        type: 'down',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'button',
          windowId: 1,
          pointerId: 0,
          pointerType: 'mouse',
          position: [200, 0],
          button: 'primary',
          state: 'down'
        } as any
      });

      rootListener.emit({
        type: 'pressmove',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'move',
          windowId: 1,
          pointerId: 0,
          pointerType: 'mouse',
          position: [225, -15] // uiX = 625 (+25), uiY = 315 (+15)
        } as any
      });

      rootListener.emit({
        type: 'pressup',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'button',
          windowId: 1,
          pointerId: 0,
          pointerType: 'mouse',
          position: [225, -15]
        } as any
      });

      expect(clicked).toBe(true);
      expect(draggedDx).toBe(25);
      expect(draggedDy).toBe(15);
    } finally {
      runtime.dispose();
    }
  });

  test('events bubble up from frontmost child panels to parent container', () => {
    const { runtime, realm, ui } = createPanelTestEnv(800, 600);
    try {
      const root = ui.createRoot(realm, { width: 800, height: 600 });

      // Parent container
      const container = root.addPanel({
        id: 'container',
        x: 50,
        y: 50,
        width: 300,
        height: 200
      });

      // Child sprite panel in front
      const childSprite = container.addSpritePanel({
        id: 'child-sprite',
        x: 20,
        y: 20,
        width: 100,
        height: 100
      });

      let parentPressed = false;
      let parentDraggedDx = 0;
      let parentScrolledDy = 0;
      let parentClicked = false;

      container.on('press', () => (parentPressed = true));
      container.on('drag', (dx) => (parentDraggedDx += dx));
      container.on('scroll', (_dx, dy) => (parentScrolledDy += dy));
      container.on('click', () => (parentClicked = true));

      const rootListener = root.interactiveListener!;

      // Click on childSprite: uiX = 50 + 20 + 10 = 80, uiY = 50 + 20 + 10 = 80
      // localX = 80 - 400 = -320, localY = 300 - 80 = 220
      rootListener.emit({
        type: 'down',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'button',
          position: [-320, 220],
          button: 'primary'
        } as any
      });

      expect(parentPressed).toBe(true);

      rootListener.emit({
        type: 'pressmove',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'move',
          position: [-310, 220] // dx = +10
        } as any
      });

      expect(parentDraggedDx).toBe(10);

      rootListener.emit({
        type: 'scroll',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'wheel',
          position: [-310, 220]
        } as any,
        scrollDelta: { lines: [0, 5] }
      });

      expect(parentScrolledDy).toBe(5);

      rootListener.emit({
        type: 'pressup',
        realmId: realm.realmId,
        target: { type: 'collider', entityId: root.entityId },
        pointer: {
          kind: 'pointer',
          type: 'button',
          position: [-310, 220]
        } as any
      });

      expect(parentClicked).toBe(true);
    } finally {
      runtime.dispose();
    }
  });
});
