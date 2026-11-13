import { describe, expect, it } from 'bun:test';
import type {
  AnimationTarget,
  AnimValue,
  GalfusEngine,
  GalfusTransport,
  PlatformEvent,
  TransitionConfig
} from '@galfus/transport-types';
import { createRuntime, type Model2DComponent, type Model3DComponent } from '@galfus/engine';
import { createInteractionScene } from '../src/host/interaction';
import { advanceFrame } from './test-helpers';
import { createMockInteractionEngine } from '../../engine/test/mock-core-interaction';

describe('interaction demo', () => {
  it('routes pointer input to the demo UI, 2D collider, and 3D objects', () => {
    const events: PlatformEvent[] = [];
    let runtimeRef: any;
    const mockInteractions = createMockInteractionEngine((id) =>
      runtimeRef?.multiverse.getRealm(id)
    );
    const transitions = new Map<
      number,
      {
        current: AnimValue;
        start: AnimValue;
        target: AnimValue;
        elapsed: number;
        duration: number;
        binding?: AnimationTarget;
      }
    >();
    const leftViewport = [0, 0, 616, 700];
    const rightViewport = [616, 0, 484, 700];
    let windowClosed = false;
    const engine = new Proxy(
      {
        ...mockInteractions,
        multiverseDispatch: () => {
          mockInteractions.multiverseDispatch();
        },
        animationCreateTransition: (id: number, value: AnimValue, config: TransitionConfig) => {
          transitions.set(id, {
            current: value,
            start: value,
            target: value,
            elapsed: 0,
            duration: config.duration
          });
        },
        animationBindTarget: (id: number, binding: AnimationTarget) => {
          transitions.get(id)!.binding = binding;
        },
        animationTransitionTo: (id: number, value: AnimValue, config: TransitionConfig) => {
          const transition = transitions.get(id)!;
          transition.start = transition.current;
          transition.target = value;
          transition.elapsed = 0;
          transition.duration = config.duration;
        },
        animationGetValue: (id: number) => transitions.get(id)?.current,
        animationDestroyTransition: (id: number) => transitions.delete(id),
        animationStep: (dt: number) => {
          for (const transition of transitions.values()) {
            transition.elapsed += dt;
            const progress = Math.min(transition.elapsed / transition.duration, 1);
            const start = transition.start.value as number[];
            const target = transition.target.value as number[];
            transition.current = {
              type: transition.start.type,
              value: start.map((value, index) => value + (target[index]! - value) * progress) as any
            };
          }
        },
        platformPumpEvents: () => events.splice(0),
        windowClose: () => {
          windowClosed = true;
        },
        windowSetCursorIcon: () => {
          if (windowClosed) throw new Error('Cursor updated after window close');
        },
        multiverseResolve: () => ({
          targetBlocks: [
            {
              targetId: 1,
              invocations: [
                {
                  invocationId: 1,
                  realmId: 1,
                  resolvedViewport: leftViewport,
                  zIndex: 0,
                  filters: []
                },
                {
                  invocationId: 2,
                  realmId: 2,
                  resolvedViewport: rightViewport,
                  zIndex: 1,
                  filters: []
                }
              ]
            }
          ]
        })
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
    runtimeRef = runtime;
    const windowId = runtime.platform.window.create();
    const targetId = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
    const scene = createInteractionScene(runtime, targetId, windowId);
    const move = (x: number, y: number): PlatformEvent => ({
      kind: 'pointer',
      type: 'move',
      windowId,
      pointerId: 0,
      pointerType: 'mouse',
      position: [x, y],
      delta: [0, 0],
      pressure: 0
    });
    const button = (x: number, y: number, state: 'pressed' | 'released'): PlatformEvent => ({
      kind: 'pointer',
      type: 'button',
      windowId,
      pointerId: 0,
      pointerType: 'mouse',
      position: [x, y],
      button: 'primary',
      state,
      pressure: 0
    });
    const click = (x: number, y: number) => {
      events.push(move(x, y), button(x, y, 'pressed'), button(x, y, 'released'));
      advanceFrame(runtime, transport);
    };
    try {
      advanceFrame(runtime, transport);
      click(858, 240);
      expect(scene.statusText.text).toBe('Clicked: UI button');
      expect(scene.countText.text).toBe('Clicks: 1');
      click(714, 416);
      expect(scene.statusText.text).toBe('Clicked: 2D circle');
      advanceFrame(runtime, transport, 0.1);
      const circleScale = () =>
        scene.realm2d.world.getComponent<Model2DComponent>(scene.circle, 'Model2D')!
          .localMatrix[0]!;
      expect(circleScale()).toBeGreaterThan(1);
      expect(circleScale()).toBeLessThan(1.15);
      events.push(move(600, 50));
      advanceFrame(runtime, transport);
      const scaleBeforeLeave = circleScale();
      advanceFrame(runtime, transport, 0.05);
      expect(circleScale()).toBeLessThan(scaleBeforeLeave);
      events.push(move(714, 416));
      advanceFrame(runtime, transport);
      advanceFrame(runtime, transport, 0.21);
      expect(
        scene.realm2d.world.getComponent<Model2DComponent>(scene.circle, 'Model2D')!.localMatrix[0]
      ).toBeCloseTo(1.15);
      click(190, 350);
      expect(scene.statusText.text).toBe('Clicked: 3D cube');
      advanceFrame(runtime, transport, 0.21);
      expect(
        scene.realm3d.world.getComponent<Model3DComponent>(scene.cube.entityId, 'Model3D')!
          .localMatrix[0]
      ).toBeCloseTo(1.12);
      click(426, 350);
      expect(scene.statusText.text).toBe('Clicked: 3D sphere');
      expect(scene.countText.text).toBe('Clicks: 4');
      leftViewport.splice(0, 4, 0, 0, 512, 1048);
      rightViewport.splice(0, 4, 512, 0, 403, 1048);
      events.push({
        kind: 'window',
        type: 'resized',
        windowId,
        width: 915,
        height: 1048,
        scaleFactor: 1
      });
      advanceFrame(runtime, transport);
      click(714, 451);
      expect(scene.statusText.text).toBe('Clicked: UI button');
      expect(scene.countText.text).toBe('Clicks: 5');
    } finally {
      runtime.dispose();
    }
  });
});
