import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport } from '@galfus/transport-types';
import { createRuntime } from '@galfus/engine';
import { createUi1Scene, runDemoUi1 } from '../src/ui/ui1-pointer-wheel-image';
import { advanceFrame } from './test-helpers';

describe('ui1 demo (Native SpritePanel & Texture Lab)', () => {
  it('compiles native quads, text, and updates SpritePanel texture and sampler', () => {
    let nextTexId = 10;
    const schedule = {
      targetBlocks: [
        {
          targetId: 1,
          invocations: [
            {
              invocationId: 1,
              realmId: 1,
              resolvedViewport: [0, 0, 1024, 680],
              zIndex: 10,
              filters: []
            }
          ]
        }
      ]
    };

    const engine = new Proxy(
      {
        platformPumpEvents: () => [],
        resourceCreateTexture: () => nextTexId++,
        multiverseResolve: () => schedule,
        multiverseDispatch: () => {}
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
    try {
      const targetId = runtime.multiverse.createTarget(1, {
        kind: { type: 'texture', width: 1024, height: 680 }
      });
      const scene = createUi1Scene(runtime, targetId, undefined, [1024, 680]);
      advanceFrame(runtime, transport);

      const compiled = scene.uiRoot.compileUi();
      expect(compiled.quads.length).toBeGreaterThanOrEqual(5);
      expect(compiled.texts.length).toBeGreaterThanOrEqual(4);

      // Check initial state
      let state = scene.getState();
      expect(state.activeTex).toBe(scene.textures.texRadar);
      expect(state.activePixelated).toBe(false);
      expect(state.zoom).toBe(1.0);
      expect(state.panX).toBe(0);
      expect(state.panY).toBe(0);

      // Switch to pixel checker texture
      scene.selectTexture(scene.textures.texPixel, true);
      state = scene.getState();
      expect(state.activeTex).toBe(scene.textures.texPixel);
      expect(state.activePixelated).toBe(true);

      const updatedCompiled = scene.uiRoot.compileUi();
      const spriteQuad = updatedCompiled.quads.find((q) => q.textureId === scene.textures.texPixel);
      expect(spriteQuad).toBeDefined();
      expect(spriteQuad?.samplerIndex).toBe(3);
    } finally {
      runtime.dispose();
    }
  });

  it('runs headless demo smoke without crashing', async () => {
    await runDemoUi1({ headless: true, maxFrames: 2 });
  });
});
