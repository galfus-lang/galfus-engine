import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime, type Model2DComponent, type Model3DComponent } from '@galfus/engine';
import { createTransRealmScene } from '../src/host/trans-realm';
import { advanceFrame, button, move, tab } from './test-helpers';

function setupDemoFixture() {
  const events: PlatformEvent[] = [];
  const tabCapture: Array<[number, number]> = [];

  const schedule = {
    targetBlocks: [
      {
        targetId: 10,
        invocations: [
          {
            invocationId: 1,
            realmId: 1,
            resolvedViewport: [0, 0, 1000, 700],
            zIndex: 0,
            filters: []
          }
        ]
      },
      {
        targetId: 20,
        invocations: [
          {
            invocationId: 2,
            realmId: 2,
            resolvedViewport: [0, 0, 500, 400],
            zIndex: 0,
            filters: []
          }
        ]
      },
      {
        targetId: 30,
        invocations: [
          {
            invocationId: 3,
            realmId: 3,
            resolvedViewport: [0, 0, 300, 300],
            zIndex: 0,
            filters: []
          }
        ]
      }
    ],
    softCutEdges: [] as Array<[number, number]>
  };

  const engine = new Proxy(
    {
      platformPumpEvents: () => events.splice(0),
      windowSetTabCapture: (id: number, enabled: number) => tabCapture.push([id, enabled]),
      windowSetImeAllowed: () => {},
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
  const windowId = runtime.platform.window.create();
  const rootTargetId = runtime.multiverse.createTarget(10, {
    kind: { type: 'window', windowId }
  });

  const scene = createTransRealmScene(runtime, rootTargetId, windowId, [1000, 700]);
  advanceFrame(runtime, transport);

  return { runtime, transport, windowId, scene, events, schedule, tabCapture };
}

describe('trans-realm host demo (3D → 2D → 3D traversal)', () => {
  it('dispatches direct 3D raycast clicks in Realm 1 (Depth 1)', () => {
    const { runtime, transport, windowId, scene, events } = setupDemoFixture();
    try {
      // Window [250, 350] projects ray directly to [-2.0, 0, 0] in Realm 1
      events.push(
        move(windowId, 250, 350),
        button(windowId, 250, 350, 'pressed'),
        button(windowId, 250, 350, 'released')
      );
      advanceFrame(runtime, transport);

      expect(scene.clicks.r1).toBe(1);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r1Sphere.target);
    } finally {
      runtime.dispose();
    }
  });

  it('traverses 3D Plane to Realm 2 (2D World - Depth 2)', () => {
    const { runtime, transport, windowId, scene, events } = setupDemoFixture();
    try {
      // Window [492, 350] hits screenPlane1 in Realm 1, maps UV to [-120, 0] in Realm 2
      events.push(
        move(windowId, 492, 350),
        button(windowId, 492, 350, 'pressed'),
        button(windowId, 492, 350, 'released')
      );
      advanceFrame(runtime, transport);

      expect(scene.clicks.r2).toBe(1);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r2Btn.target);
    } finally {
      runtime.dispose();
    }
  });

  it('traverses 3D Plane → 2D Surface → Realm 3 (3D World - Depth 3 MAX)', () => {
    const { runtime, transport, windowId, scene, events } = setupDemoFixture();
    try {
      // Window [690, 350] hits screenPlane1 (R1) → surface2 (R2) → r3Orb (R3 3D Sphere)
      events.push(
        move(windowId, 690, 350),
        button(windowId, 690, 350, 'pressed'),
        button(windowId, 690, 350, 'released')
      );
      advanceFrame(runtime, transport);

      expect(scene.clicks.r3).toBe(1);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r3Orb.target);
    } finally {
      runtime.dispose();
    }
  });

  it('strictly isolates Tab navigation within each realm and switches only via click or requestFocus', () => {
    const { runtime, transport, windowId, scene, events } = setupDemoFixture();
    try {
      // Focus r1Sphere in Realm 1
      expect(scene.r1Sphere.requestFocus(windowId)).toBe(true);
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r1Sphere.target);

      // Tab within Realm 1 loops on Realm 1's focusable targets (never leaps to Realm 2 or 3)
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r1Sphere.target);

      // Direct click on Realm 2's button switches active realm to Realm 2 (Depth 2)
      events.push(
        move(windowId, 492, 350),
        button(windowId, 492, 350, 'pressed'),
        button(windowId, 492, 350, 'released')
      );
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r2Btn.target);

      // Tab within Realm 2 stays in Realm 2
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r2Btn.target);

      // Direct click on Realm 3's 3D Orb switches active realm to Realm 3 (Depth 3)
      events.push(
        move(windowId, 690, 350),
        button(windowId, 690, 350, 'pressed'),
        button(windowId, 690, 350, 'released')
      );
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r3Orb.target);

      // Tab within Realm 3 stays in Realm 3
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r3Orb.target);

      // Programmatic requestFocus() back to Realm 1 switches realm safely
      expect(scene.r1Sphere.requestFocus(windowId)).toBe(true);
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)?.target).toEqual(scene.r1Sphere.target);
    } finally {
      runtime.dispose();
    }
  });

  it('updates spatial transforms dynamically during tick animations across all realms', () => {
    const { runtime, transport, scene } = setupDemoFixture();
    try {
      // Advance several frames over time
      for (let i = 0; i < 20; i++) {
        advanceFrame(runtime, transport, 0.05);
      }

      // Verify that after moving, the entities' world matrices have changed from initial positions
      const r1Target = scene.r1Sphere.target;
      const r1EntityId = r1Target.type === 'collider' ? r1Target.entityId : 0;
      const r1Model = scene.realm1.world.getComponent<Model3DComponent>(r1EntityId, 'Model3D');
      expect(r1Model).toBeDefined();
      expect(r1Model!.worldMatrix[13]).not.toBe(0); // Y has animated

      const r2Target = scene.r2Btn.target;
      const r2EntityId = r2Target.type === 'collider' ? r2Target.entityId : 0;
      const r2Model = scene.realm2.world.getComponent<Model2DComponent>(r2EntityId, 'Model2D');
      expect(r2Model).toBeDefined();
      expect(r2Model!.worldMatrix[5]).not.toBe(0); // Y has animated

      const r3Target = scene.r3Orb.target;
      const r3EntityId = r3Target.type === 'collider' ? r3Target.entityId : 0;
      const r3Model = scene.realm3.world.getComponent<Model3DComponent>(r3EntityId, 'Model3D');
      expect(r3Model).toBeDefined();
      expect(r3Model!.worldMatrix[12]).not.toBe(0); // X has animated
    } finally {
      runtime.dispose();
    }
  });
});
