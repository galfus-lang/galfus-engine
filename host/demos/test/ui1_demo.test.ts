import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime } from '@galfus/engine';
import { createUi1Scene } from '../src/ui/ui1-pointer-wheel-image';
import { advanceFrame } from './test-helpers';

describe('ui1 demo (pointer, wheel & SVG <image textureId>)', () => {
  it('routes pointer move, drag pan, wheel zoom, and thumbnail textureId swap', () => {
    const events: PlatformEvent[] = [];
    const text = new Map<string, string>();
    const attrs = new Map<string, string>();
    let nextTexId = 10;

    const rects: Record<
      string,
      {
        x: number;
        y: number;
        width: number;
        height: number;
        viewportWidth: number;
        viewportHeight: number;
      }
    > = {
      'viewport-hit': {
        x: 36,
        y: 96,
        width: 460,
        height: 340,
        viewportWidth: 920,
        viewportHeight: 580
      },
      'thumb-radar': {
        x: 36,
        y: 478,
        width: 136,
        height: 68,
        viewportWidth: 920,
        viewportHeight: 580
      },
      'thumb-pixel': {
        x: 184,
        y: 478,
        width: 146,
        height: 68,
        viewportWidth: 920,
        viewportHeight: 580
      },
      'thumb-star': {
        x: 342,
        y: 478,
        width: 154,
        height: 68,
        viewportWidth: 920,
        viewportHeight: 580
      },
      'btn-aspect': {
        x: 548,
        y: 400,
        width: 312,
        height: 42,
        viewportWidth: 920,
        viewportHeight: 580
      },
      'btn-reset': {
        x: 548,
        y: 454,
        width: 312,
        height: 42,
        viewportWidth: 920,
        viewportHeight: 580
      }
    };

    const engine = new Proxy(
      {
        platformPumpEvents: () => events.splice(0),
        resourceCreateTexture: () => nextTexId++,
        multiverseResolve: () => ({
          targetBlocks: [
            {
              targetId: 1,
              invocations: [
                {
                  invocationId: 1,
                  realmId: 1,
                  resolvedViewport: [0, 0, 920, 580],
                  zIndex: 0,
                  filters: []
                }
              ]
            }
          ]
        }),
        realm2dGetSvgElementRect: (_realm: number, _svg: number, elementId: string) => ({
          rect: rects[elementId] ?? null
        }),
        realm2dSetSvgText: (_realm: number, _svg: number, id: string, value: string) =>
          text.set(id, value),
        realm2dSetSvgAttribute: (
          _realm: number,
          _svg: number,
          id: string,
          name: string,
          value: string
        ) => attrs.set(`${id}:${name}`, value)
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
    const scene = createUi1Scene(runtime, targetId, windowId, [920, 580]);

    try {
      advanceFrame(runtime, transport);

      // 1. Move inside viewport-hit (center of [36..496, 96..436] is [266, 266])
      events.push({
        kind: 'pointer',
        type: 'move',
        windowId,
        pointerId: 0,
        pointerType: 'mouse',
        position: [266, 266],
        delta: [0, 0],
        pressure: 0
      });
      advanceFrame(runtime, transport);
      expect(text.get('stat-event')).toBe('move (viewport)');
      expect(text.get('stat-uv')).toBe('0.48, 0.50');

      // 2. Scroll wheel to zoom in
      events.push({
        kind: 'pointer',
        type: 'scroll',
        windowId,
        pointerId: 0,
        pointerType: 'mouse',
        position: [266, 266],
        delta: { lines: [0, 2] }
      });
      advanceFrame(runtime, transport);
      expect(text.get('stat-event')).toBe('scroll (wheel)');
      expect(scene.getState().zoom).toBeCloseTo(1.3);
      expect(attrs.get('viewport-image:width')).toBe((360 * 1.3).toFixed(1));

      // 3. Drag pan inside viewport
      events.push(
        {
          kind: 'pointer',
          type: 'button',
          windowId,
          pointerId: 0,
          pointerType: 'mouse',
          position: [266, 266],
          button: 'primary',
          state: 'pressed',
          pressure: 0.5
        },
        {
          kind: 'pointer',
          type: 'move',
          windowId,
          pointerId: 0,
          pointerType: 'mouse',
          position: [306, 246],
          delta: [40, -20],
          pressure: 0.5
        },
        {
          kind: 'pointer',
          type: 'button',
          windowId,
          pointerId: 0,
          pointerType: 'mouse',
          position: [306, 246],
          button: 'primary',
          state: 'released',
          pressure: 0
        }
      );
      advanceFrame(runtime, transport);
      expect(scene.getState().panX).toBe(40);
      expect(scene.getState().panY).toBe(-20);

      // 4. Click thumb-pixel to swap <image textureId="..."> to pixelated texture
      events.push(
        {
          kind: 'pointer',
          type: 'move',
          windowId,
          pointerId: 0,
          pointerType: 'mouse',
          position: [250, 510],
          delta: [0, 0],
          pressure: 0
        },
        {
          kind: 'pointer',
          type: 'button',
          windowId,
          pointerId: 0,
          pointerType: 'mouse',
          position: [250, 510],
          button: 'primary',
          state: 'pressed',
          pressure: 0.5
        },
        {
          kind: 'pointer',
          type: 'button',
          windowId,
          pointerId: 0,
          pointerType: 'mouse',
          position: [250, 510],
          button: 'primary',
          state: 'released',
          pressure: 0
        }
      );
      advanceFrame(runtime, transport);
      expect(scene.getState().activeTex).toBe(scene.textures.texPixel);
      expect(scene.getState().activePixelated).toBe(true);
      expect(attrs.get('viewport-image:textureId')).toBe(String(scene.textures.texPixel));
      expect(attrs.get('viewport-image:image-rendering')).toBe('pixelated');
    } finally {
      runtime.dispose();
    }
  });
});
