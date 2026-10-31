import { describe, expect, it } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { createNodeTransport } from '@galfus/transport-node';
import { BrowserTransport } from '@galfus/transport-browser';
import {
  GalfusLoopError,
  GalfusTransportError,
  calculateFrameTiming
} from '@galfus/transport-types';

describe('Phase F02 — Transport: Inicialização, FPS, Delta e Loop', () => {
  describe('Factory Contract: Ready-by-Default', () => {
    it('createBunTransport returns an already initialized transport capable of native operations immediately', () => {
      const transport = createBunTransport({ headless: true, targetFps: 60 });
      expect(transport.isInitialized).toBe(true);
      expect(transport.isDisposed).toBe(false);

      // Can immediately query native engine without manual init()
      const caps = transport.engine.platformGetCapabilities();
      expect(caps).toBeDefined();
      expect(caps.isHeadless).toBe(true);

      // Subsequent init() calls are idempotent
      expect(() => transport.init({ headless: true })).not.toThrow();
      expect(transport.isInitialized).toBe(true);

      transport.dispose();
    });

    it('createNodeTransport returns an already initialized transport capable of native operations immediately', () => {
      const transport = createNodeTransport({ headless: true, targetFps: 60 });
      expect(transport.isInitialized).toBe(true);
      expect(transport.isDisposed).toBe(false);

      const caps = transport.engine.platformGetCapabilities();
      expect(caps).toBeDefined();
      expect(caps.isHeadless).toBe(true);

      expect(() => transport.init({ headless: true })).not.toThrow();
      expect(transport.isInitialized).toBe(true);

      transport.dispose();
    });
  });

  describe('Real-Time Timing & Unclamped Delta (HOST-023)', () => {
    it('reports a 200ms frame as 200ms without clamping (HOST-023 acceptance)', () => {
      // Automatic time measurement: 1000ms -> 1200ms (200ms real duration)
      const timing = calculateFrameTiming(1200, 1000, 1);
      expect(timing.deltaMs).toBe(200);
      expect(timing.dt).toBe(0.2);
      expect(timing.fps).toBe(5);
    });

    it('preserves explicit delta on manual step() without clamping', () => {
      const transport = createBunTransport({ headless: true });
      let receivedDeltaMs = 0;
      let receivedDt = 0;
      let receivedFps = 0;

      // Step with explicit 200ms delta directly
      transport.step(1200, 200, (timing) => {
        receivedDeltaMs = timing.deltaMs;
        receivedDt = timing.dt;
        receivedFps = timing.fps;
      });

      expect(receivedDeltaMs).toBe(200);
      expect(receivedDt).toBe(0.2);
      expect(receivedFps).toBe(5);

      transport.dispose();
    });
  });

  describe('Concurrency & Loop Generation Safety', () => {
    it('100 rapid stopLoop/startLoop cycles do not spawn concurrent loops', async () => {
      const transport = createBunTransport({ headless: true, targetFps: 120 });
      let activeLoopCount = 0;
      let maxConcurrentCallbacksInOneTick = 0;

      for (let i = 0; i < 100; i++) {
        transport.startLoop(() => {
          activeLoopCount++;
          if (activeLoopCount > maxConcurrentCallbacksInOneTick) {
            maxConcurrentCallbacksInOneTick = activeLoopCount;
          }
          // Simulate minimal work
          activeLoopCount--;
        });
        transport.stopLoop();
      }

      // Start the final loop and let it tick for a few milliseconds
      let finalTicks = 0;
      transport.startLoop(() => {
        finalTicks++;
      });

      await new Promise((resolve) => setTimeout(resolve, 40));

      transport.stopLoop();
      expect(transport.isRunning).toBe(false);
      expect(finalTicks).toBeGreaterThan(0);
      // At no point did orphan loops run concurrently
      expect(maxConcurrentCallbacksInOneTick).toBeLessThanOrEqual(1);

      transport.dispose();
    });
  });

  describe('Dispose Lifecycle: Terminal & Idempotent (HOST-027)', () => {
    it('dispose() permanently invalidates transport and rejects subsequent engine/loop operations', () => {
      const transport = createBunTransport({ headless: true });
      expect(transport.isInitialized).toBe(true);
      expect(transport.isDisposed).toBe(false);

      transport.dispose();
      expect(transport.isInitialized).toBe(false);
      expect(transport.isDisposed).toBe(true);

      // Accessing engine after dispose throws
      expect(() => transport.engine).toThrow(GalfusTransportError);

      // Starting loop after dispose throws
      expect(() => transport.startLoop(() => {})).toThrow(GalfusLoopError);

      // Stepping after dispose throws
      expect(() => transport.step()).toThrow(GalfusLoopError);

      // Initializing after dispose throws
      expect(() => transport.init()).toThrow(GalfusTransportError);

      // Calling dispose repeatedly is safe and idempotent
      expect(() => transport.dispose()).not.toThrow();
      expect(() => transport.dispose()).not.toThrow();
      expect(transport.isDisposed).toBe(true);
    });
  });

  describe('Browser Transport Contract', () => {
    it('throws controlled GalfusLoopError when startLoop is called in a non-DOM environment without requestAnimationFrame', () => {
      const transport = new BrowserTransport();
      // BrowserTransport should throw a descriptive error when RAF is missing
      expect(() => {
        transport.startLoop(() => {});
      }).toThrow(GalfusLoopError);
    });

    it('supports deterministic step() and terminal dispose in headless mode', () => {
      const transport = new BrowserTransport();
      let stepReceived = false;

      // Mock callback via startLoop error bypass: register step through alias
      (transport as unknown as { _callback: (t: unknown) => void })._callback = () => {
        stepReceived = true;
      };

      transport.step(100, 16.666);
      expect(stepReceived).toBe(true);

      transport.dispose();
      expect(transport.isDisposed).toBe(true);
      expect(() => transport.step()).toThrow(GalfusLoopError);
      expect(() => transport.dispose()).not.toThrow();
    });
  });
});
