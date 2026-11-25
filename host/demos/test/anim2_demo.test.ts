import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { createAnim2Scene, runDemoAnim2 } from '../src/realm2d/anim2-path';

describe('anim2 path followers demo', () => {
  it('runs headlessly via runDemoAnim2', async () => {
    await runDemoAnim2({ headless: true, maxFrames: 3 });
  }, 30000);

  it('evaluates spline path progression and rebinds parameters', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);

    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 1024, height: 768 }
      });
      const scene = createAnim2Scene(runtime, target);

      advanceFrame(runtime, transport);
      const initialDroneState = runtime.animation.getPathState(scene.dronePathId);
      const initialOrbState = runtime.animation.getPathState(scene.orbPathId);

      expect(initialDroneState).toBeDefined();
      expect(initialDroneState?.status).toBe('running');
      expect(initialOrbState).toBeDefined();
      expect(initialOrbState?.status).toBe('running');

      // Step multiple frames to ensure spline evaluation proceeds
      for (let i = 0; i < 5; i++) {
        advanceFrame(runtime, transport, 0.05);
      }

      const activeDroneState = runtime.animation.getPathState(scene.dronePathId);
      expect(activeDroneState?.progress).toBeGreaterThan(0);

      // Rebind with new speed & ping-pong loop
      scene.rebindDronePath(2.0, 'pingPong', false);
      advanceFrame(runtime, transport, 0.05);

      const reboundDroneState = runtime.animation.getPathState(scene.dronePathId);
      expect(reboundDroneState).toBeDefined();
      expect(reboundDroneState?.status).toBe('running');
    } finally {
      runtime.dispose();
    }
  });
});
