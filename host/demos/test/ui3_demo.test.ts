import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { createUi3Scene, runDemoUi3 } from '../src/ui/ui3-components';

describe('ui3 component showcase', () => {
  it('runs headlessly', async () => {
    await runDemoUi3({ headless: true, maxFrames: 2 });
  });
  it('lays out all component types and nested controls in the real core', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 900, height: 560 }
      });
      const scene = createUi3Scene(runtime, target);
      advanceFrame(runtime, transport);
      const rect = (id: number) => scene.realm.getUiLayout(scene.root.handle, id).absoluteRect;
      const bar = rect(scene.bar.panel.id);
      const toolbar = rect(scene.toolbar.panel.id);
      const group = rect(scene.group.panel.id);
      const column = rect(scene.column.panel.id);
      const nested = rect(scene.nested.panel.id);
      const standalone = rect(scene.standalone.panel.id);
      const independentToolbar = rect(scene.independentToolbar.panel.id);
      for (const item of [bar, toolbar, group, column, nested, standalone, independentToolbar]) {
        expect(item[2]).toBeGreaterThan(0);
        expect(item[3]).toBeGreaterThan(0);
      }
      expect(bar[2]).toBe(860);
      expect(group[1]).toBeGreaterThan(bar[1] + bar[3]);
      expect(column[1]).toBeGreaterThan(group[1] + group[3]);
      expect(standalone[1]).toBeGreaterThan(column[1] + column[3]);
      expect(independentToolbar[1]).toBeGreaterThan(standalone[1] + standalone[3]);
      expect(scene.toolbar.children).toHaveLength(2);
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
