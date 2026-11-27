import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { createWin1Scene, runDemoWin1 } from '../src/host/win1-cursor-window';

describe('@galfus/demos > win1 cursor & window controls lab', () => {
  it('runs win1 headlessly for 3 frames without error', async () => {
    await runDemoWin1({ headless: true, maxFrames: 3 });
  });

  it('tracks locked pointer deltas, focus transitions, and cursor actions', () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const targetId = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 1024, height: 680 }
      });
      const scene = createWin1Scene(runtime, targetId, undefined, [1024, 680]);

      runtime.platform.dispatch({
        kind: 'pointer',
        type: 'move',
        windowId: 1,
        pointerId: 0,
        pointerType: 'mouse',
        position: [320, 240],
        delta: [12, -8],
        pressure: 0
      });
      expect(scene.getState().moveEvents).toBe(1);
      expect(scene.getState().pointerPos).toEqual([320, 240]);
      expect(scene.getState().lastDelta).toEqual([12, -8]);

      runtime.platform.dispatch({
        kind: 'window',
        type: 'focusChanged',
        windowId: 1,
        focused: false
      });
      expect(scene.getState().windowFocused).toBe(false);

      runtime.platform.dispatch({
        kind: 'window',
        type: 'focusChanged',
        windowId: 1,
        focused: true
      });
      expect(scene.getState().windowFocused).toBe(true);

      scene.resetDelta();
      expect(scene.getState().moveEvents).toBe(0);
      expect(scene.getState().lockedAccum).toEqual([0, 0]);
    } finally {
      runtime.dispose();
    }
  });
});
