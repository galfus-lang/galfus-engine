import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime, type WindowId } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { createUi1Scene, runDemoUi1 } from '../src/ui/ui1-pointer-wheel-image';
import { advanceFrame } from './test-helpers';

describe('ui1 demo (Native SpritePanel & Texture Lab)', () => {
  it('compiles native quads, text, and updates SpritePanel texture and sampler', () => {
    let nextTexId = 10;
    const commands: unknown[][] = [];
    const events: PlatformEvent[] = [];
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
        platformPumpEvents: () => events.splice(0),
        resourceCreateTexture: () => nextTexId++,
        realm2dApplyUiCommands: (_realm: number, _ui: number, batch: unknown[]) =>
          commands.push(batch),
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
      const scene = createUi1Scene(runtime, targetId, 1 as WindowId, [1024, 680]);
      advanceFrame(runtime, transport);

      const compiled = scene.uiRoot.compileUi();
      expect(compiled.quads.length).toBeGreaterThanOrEqual(5);
      expect(compiled.texts.length).toBeGreaterThanOrEqual(4);
      expect(scene.viewportContainer.rect).toEqual({ x: 24, y: 80, width: 560, height: 420 });
      expect(scene.controlPanel.rect).toEqual({ x: 608, y: 80, width: 392, height: 420 });
      const rich = commands.flat().find((command: any) => command.kind?.type === 'richText') as any;
      expect(rich.kind.spans.map((span: any) => span.text)).toEqual([
        'RichText: ',
        'bold ',
        'italic ',
        'underline ',
        'strike'
      ]);
      expect(rich.kind.spans[3].style.underline).toBe(true);
      expect(rich.kind.spans[4].style.strikethrough).toBe(true);
      const multiline = commands
        .flat()
        .find((command: any) => command.kind?.type === 'richText' && command.kind.multiline) as any;
      expect(multiline.kind.wrap).toBe('wordWrap');
      expect(multiline.layout.width).toEqual({ type: 'exact', value: 330 });
      for (const element of [rich, multiline]) {
        const [x, y] = element.layout.positionOffset;
        const panel = scene.controlPanel.rect;
        expect(y >= panel.y + panel.height || x >= panel.x + panel.width).toBe(true);
      }

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

      events.push({
        kind: 'window',
        type: 'resized',
        windowId: 1,
        width: 1200,
        height: 800,
        scaleFactor: 1
      });
      advanceFrame(runtime, transport);
      const resize = commands
        .flat()
        .find((command: any) => command.type === 'setLayout' && command.id === 1) as any;
      expect(resize.layout).toMatchObject({
        width: { type: 'exact', value: 1200 },
        height: { type: 'exact', value: 800 },
        isStack: true
      });
    } finally {
      runtime.dispose();
    }
  });

  it('runs headless demo smoke without crashing', async () => {
    await runDemoUi1({ headless: true, maxFrames: 2 });
  });

  it('retrieves the actual core layout of the formatted text', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 1024, height: 680 }
      });
      const scene = createUi1Scene(runtime, target, undefined, [1024, 680]);
      advanceFrame(runtime, transport);
      const first = scene.realm2d.getUiLayout(scene.richUi, 2);
      const second = scene.realm2d.getUiLayout(scene.richUi, 3);
      const clusters = scene.realm2d.getRichTextClusters(scene.richUi, 2);
      const geometry = scene.realm2d.getUiTextGeometry(scene.richUi, 2);
      expect(first.absoluteRect[0]).toBe(24);
      expect(first.absoluteRect[1]).toBe(530);
      expect(first.absoluteRect[2]).toBeGreaterThan(0);
      expect(second.absoluteRect[1]).toBe(570);
      expect(second.absoluteRect[3]).toBeGreaterThan(15);
      expect(clusters.length).toBeGreaterThan(0);
      expect(geometry.clusters).toEqual(clusters);
      expect(geometry.lines[0]!.start).toBe(0);
      expect(clusters[0]).toMatchObject({ start: 0, end: 1, rightToLeft: false });
      expect(clusters[0]!.rect[0]).toBeCloseTo(24, 2);
    } finally {
      runtime.dispose();
    }
  });
});
