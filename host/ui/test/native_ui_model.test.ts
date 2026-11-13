import { describe, expect, test } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import type { GalfusEngine, GalfusTransport } from '@galfus/transport-types';
import { createUi, Panel, SpritePanel } from '../src/index';

function createMockRuntime() {
  const engine = new Proxy(
    {
      platformPumpEvents: () => [],
      multiverseResolve: () => ({ targetBlocks: [] }),
      multiverseDispatch: () => {},
      realm2dCreateUi: () => 0,
      realm2dSetUiContent: () => 0,
      realm2dSetUiTransform: () => 0,
      realm2dDestroyUi: () => 0,
      realm2dCreateSvg: () => 0,
      realm2dSetSvgSource: () => 0,
      realm2dSetSvgAttribute: () => 0,
      realm2dGetSvgElementRect: () => ({ rect: undefined })
    },
    { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => 0) }
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
  return { runtime, realm };
}

describe('Native UI Model (Model2DUI) & Fluent Panel APIs', () => {
  test('direct setters modify visual properties cleanly', () => {
    const panel = new Panel({ width: 320, height: 240 });
    panel.setBackgroundColor([0.1, 0.2, 0.3, 0.9]);
    panel.setBorderColor('#38bdf8');
    panel.setBorderWidth([2, 4]); // top/bottom: 2, right/left: 4
    panel.setBorderRadius([8, 16, 24, 32]);
    panel.setOpacity(0.85);

    expect(panel.style.fill).toEqual([0.1, 0.2, 0.3, 0.9]);
    expect(panel.style.stroke).toBe('#38bdf8');
    expect(panel.style.strokeWidth).toEqual([2, 4]);
    expect(panel.style.radius).toEqual([8, 16, 24, 32]);
    expect(panel.style.opacity).toBe(0.85);
  });

  test('animate applies immediate transition or interpolated values', async () => {
    const panel = new Panel({ width: 200, height: 100 });
    panel.setBackgroundColor([0, 0, 0, 1]);
    panel.animate('backgroundColor', [1, 1, 1, 1], { duration: 0 });
    expect(panel.style.fill).toEqual([1, 1, 1, 1]);

    let completed = false;
    panel.animate('opacity', 0.5, {
      duration: 30,
      onComplete: () => {
        completed = true;
      }
    });

    await new Promise((r) => setTimeout(r, 60));
    expect(completed).toBe(true);
    expect(panel.style.opacity).toBe(0.5);
  });

  test('interaction events register and trigger on pointer actions', () => {
    const panel = new Panel({ width: 120, height: 40 });
    let hoverTriggered = false;
    let clickTriggered = false;
    let dragDist = [0, 0];

    panel.onHover(() => {
      hoverTriggered = true;
    });
    panel.onClick(() => {
      clickTriggered = true;
    });
    panel.onDrag((dx, dy) => {
      dragDist = [dx, dy];
    });

    (panel as any)._events.emit('hover');
    (panel as any)._events.emit('click');
    (panel as any)._events.emit('drag', 15, -5);

    expect(hoverTriggered).toBe(true);
    expect(clickTriggered).toBe(true);
    expect(dragDist).toEqual([15, -5]);
  });

  test('SpritePanel compiles 9-slice and textured quads to native descriptors', () => {
    const sprite = new SpritePanel({
      width: 100,
      height: 100,
      textureId: 42,
      fit: 'nineSlice',
      slice: [10, 10, 10, 10],
      tintColor: [1, 0.8, 0.5, 1]
    });

    const quads: any[] = [];
    const texts: any[] = [];
    sprite.compileUi(quads, texts);

    // 9-slice decomposes into 9 sub-quads
    expect(quads.length).toBe(9);
    expect(quads[0].textureId).toBe(42);
    expect(quads[0].tintColor).toEqual([1, 0.8, 0.5, 1]);
  });

  test('StackLayout layers SpritePanel background and interactive buttons', () => {
    const { runtime, realm } = createMockRuntime();
    const ui = createUi(runtime);
    const root = ui.createRoot(realm, {
      width: 600,
      height: 400,
      layout: { type: 'stack' }
    });

    // 1. Background image
    const bg = root.addSpritePanel({
      textureId: 7,
      fit: 'stretch',
      sampler: 'linear'
    });

    // 2. Overlaid content panel
    const content = root.addPanel({
      layout: { type: 'vertical', gap: 12 }
    });
    content.setBackgroundColor([0, 0, 0, 0.5]);

    root.flush();

    const compiled = root.compileUi();
    expect(compiled.quads.length).toBeGreaterThan(1);
    // First quad is root panel or background
    expect(compiled.quads.some((q) => q.textureId === 7)).toBe(true);
  });

  test('UiText compiles inline and multiline text descriptors with formatting', () => {
    const { runtime, realm } = createMockRuntime();
    const ui = createUi(runtime);
    const root = ui.createRoot(realm, {
      width: 500,
      height: 300,
      layout: { type: 'vertical', gap: 8 }
    });

    const title = root.addText({
      text: 'Title Header',
      fontSize: 18,
      color: '#38bdf8',
      inline: true
    });
    const paragraph = root.addText({
      text: 'This is a long description text that spans multiple lines cleanly',
      fontSize: 12,
      multiline: true,
      maxWidth: 400
    });

    root.flush();
    const compiled = root.compileUi();
    expect(compiled.texts.length).toBeGreaterThanOrEqual(2);

    const t1 = compiled.texts.find((t) => t.text === 'Title Header');
    expect(t1).toBeDefined();
    expect(t1?.fontSize).toBe(18);

    const t2 = compiled.texts.find((t) => t.text?.includes('long description'));
    expect(t2).toBeDefined();
    expect(t2?.fontSize).toBe(12);

    // Direct setter
    title.setText('Updated Title');
    root.flush();
    const updated = root.compileUi();
    expect(updated.texts.some((t) => t.text === 'Updated Title')).toBe(true);
  });
});
