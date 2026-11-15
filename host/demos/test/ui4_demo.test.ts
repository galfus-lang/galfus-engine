import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { createUi4Scene, runDemoUi4 } from '../src/ui/ui4-overlays';

describe('ui4 overlay showcase', () => {
  it('runs its static offscreen scene headlessly', async () => {
    await runDemoUi4({ headless: true, maxFrames: 2 });
  });
  it('lays out the popover and tooltip triggers in the native core', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 900, height: 560 }
      });
      const scene = createUi4Scene(runtime, target);
      advanceFrame(runtime, transport);
      const a = scene.realm.getUiLayout(scene.root.handle, scene.trigger.panel.id).absoluteRect;
      const b = scene.realm.getUiLayout(scene.root.handle, scene.tipTrigger.panel.id).absoluteRect;
      expect(a[2]).toBeGreaterThan(0);
      expect(a[3]).toBeGreaterThan(0);
      expect(b[1]).toBeGreaterThan(a[1] + a[3]);
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
