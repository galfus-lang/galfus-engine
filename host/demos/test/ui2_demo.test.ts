import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import type { GalfusEngine, GalfusTransport } from '@galfus/transport-types';
import { findDemo } from '../src/catalog';
import { createUi2Scene } from '../src/ui/ui2-panels-layout';

describe('ui2 demo (Panels, SplitGroup, ScrollPanel & Layout Solver)', () => {
  it('is registered in the demo catalog and builds a responsive panel hierarchy', () => {
    expect(findDemo('ui2')?.id).toBe('ui2');
    expect(findDemo('split-group')?.id).toBe('ui2');

    let nextTexId = 10;
    const attrUpdates: Array<{ id: string; name: string; value: string }> = [];
    const engine = new Proxy(
      {
        resourceCreateTexture: () => nextTexId++,
        realm2dSetSvgAttribute: (
          _r: number,
          _s: number,
          id: string,
          name: string,
          value: string
        ) => {
          attrUpdates.push({ id, name, value });
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
    const targetId = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
    const scene = createUi2Scene(runtime, targetId, windowId, [1120, 700]);

    try {
      const xml = scene.root.toSvgString();
      expect(xml).toContain('viewBox="0 0 1120 700"');
      expect(xml).toContain('id="hierarchy-scroll-clip"');
      expect(xml).toContain('id="main-split-sash-0"');
      expect(xml).toContain('id="center-split-sash-0"');
      expect(scene.hierarchyScroll.maxScrollY).toBeGreaterThan(0);

      // Programmatic sash move and scroll update attributes without rebuilding XML
      const initialLeftW = scene.hierarchyScroll.rect.width;
      scene.mainSplit.moveSash(0, 45);
      expect(scene.hierarchyScroll.rect.width).toBeCloseTo(initialLeftW + 45, 3);

      scene.hierarchyScroll.scrollBy(0, 80);
      expect(scene.hierarchyScroll.scrollY).toBe(80);
      expect(
        attrUpdates.some((u) => u.id === 'hierarchy-scroll-content' && u.name === 'transform')
      ).toBe(true);

      // Resize root viewport
      scene.resize(1280, 800);
      expect(scene.root.width).toBe(1280);
      expect(scene.root.height).toBe(800);
    } finally {
      scene.dispose();
      runtime.dispose();
    }
  });
});
