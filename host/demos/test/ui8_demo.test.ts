import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { createUi8Scene, runDemoUi8 } from '../src/ui/ui8-integrated';

describe('integrated UI demo', () => {
  it('runs headlessly', async () => {
    await runDemoUi8({ headless: true, maxFrames: 3 });
  });
  it('combines inherited styles, text editing and controls in the presented layout', () => {
    const transport = createBunTransport({ headless: true }),
      runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 960, height: 720 }
      });
      const scene = createUi8Scene(runtime, target);
      for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
      expect(scene.title.resolvedStyle.kind.fontWeight).toBe(700);
      expect(scene.menuButton.panel.resolvedStyle.kind.backgroundColor).toEqual([
        0.12, 0.42, 0.63, 1
      ]);
      expect(scene.input.value).toBe('Ada França');
      scene.input.setValue('Changed 😀');
      scene.slider.setValue(75);
      expect(scene.progress.value).toBe(75);
      for (const component of [
        scene.input,
        scene.area,
        scene.checkbox,
        scene.slider,
        scene.progress
      ]) {
        const rect = scene.realm.getUiLayout(scene.root.handle, component.panel.id).absoluteRect;
        expect(rect[2]).toBeGreaterThan(0);
        expect(rect[3]).toBeGreaterThan(0);
        expect(rect[1] + rect[3]).toBeLessThan(720);
      }
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
