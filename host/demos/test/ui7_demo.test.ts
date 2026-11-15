import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { createUi7Scene, runDemoUi7 } from '../src/ui/ui7-menu-dialog-progress';

describe('ui7 menus, dialogs and progress', () => {
  it('runs offscreen', async () => {
    await runDemoUi7({ headless: true, maxFrames: 3 });
  });
  it('lays out and updates both progress modes', () => {
    const transport = createBunTransport({ headless: true }),
      runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 900, height: 560 }
      });
      const scene = createUi7Scene(runtime, target);
      advanceFrame(runtime, transport);
      expect(scene.progress.value).toBe(40);
      expect(scene.indeterminate.indeterminate).toBe(true);
      expect(
        scene.realm.getUiLayout(scene.root.handle, scene.progress.panel.id).absoluteRect[2]
      ).toBe(320);
      scene.slider.setValue(75);
      expect(scene.progress.value).toBe(75);
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
