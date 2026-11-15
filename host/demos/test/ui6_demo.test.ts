import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { createUi6Scene, runDemoUi6 } from '../src/ui/ui6-selection-controls';

describe('ui6 selection controls', () => {
  it('runs its offscreen scene headlessly', async () => {
    await runDemoUi6({ headless: true, maxFrames: 3 });
  });
  it('lays out checkbox, switch, radios and slider with their initial values', () => {
    const transport = createBunTransport({ headless: true }),
      runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 900, height: 560 }
      });
      const scene = createUi6Scene(runtime, target);
      advanceFrame(runtime, transport);
      for (const control of [scene.checkbox, scene.toggle, scene.radios, scene.slider]) {
        const rect = scene.realm.getUiLayout(scene.root.handle, control.panel.id).absoluteRect;
        expect(rect[2]).toBeGreaterThan(0);
        expect(rect[3]).toBeGreaterThan(0);
      }
      expect(scene.checkbox.value).toBe(false);
      expect(scene.toggle.value).toBe(true);
      expect(scene.radios.value).toBe('medium');
      expect(scene.slider.value).toBe(40);
      expect(scene.disabled.getInteractionState().disabled).toBe(true);
      expect(scene.readOnly.readOnly).toBe(true);
      expect(
        scene.realm.getUiLayout(scene.root.handle, scene.status.id).absoluteRect[1]
      ).toBeLessThan(560);
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
