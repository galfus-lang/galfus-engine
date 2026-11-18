import { describe, expect, it } from 'bun:test';
import { createRuntime, type Model3DComponent } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { createUi8Scene, runDemoUi8 } from '../src/ui/ui8-integrated';

describe('game editor UI demo', () => {
  it('runs headlessly', async () => {
    await runDemoUi8({ headless: true, maxFrames: 3 });
  });

  it('resizes split panels and keeps the animated 3D target synchronized', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 960, height: 720 }
      });
      const scene = createUi8Scene(runtime, target);
      const check = () => {
        for (let i = 0; i < 2; i++) advanceFrame(runtime, transport);
        const rect = scene.realm.getUiLayout(scene.root.handle, scene.viewport.id).absoluteRect;
        const expected = scene.splits.horizontal.panels[1]!.rect;
        expect(rect[0]).toBeCloseTo(expected.x);
        expect(rect[1]).toBeCloseTo(expected.y);
        expect(rect[2]).toBeCloseTo(expected.width);
        expect(rect[3]).toBeCloseTo(expected.height);
        expect(runtime.multiverse.getTarget(scene.renderTarget)?.kind).toMatchObject({
          type: 'texture',
          width: Math.max(1, Math.round(expected.width)),
          height: Math.max(1, Math.round(expected.height))
        });
        expect(runtime.multiverse.getInvocation(scene.preview.invocation)?.targetId).toBe(
          scene.renderTarget
        );
      };
      check();
      const beforeSplit = scene.splits.horizontal.panels[0]!.rect.width;
      scene.splits.horizontal.moveSash(0, 35);
      scene.splits.update();
      check();
      expect(scene.splits.horizontal.panels[0]!.rect.width).toBeGreaterThan(beforeSplit);
      const cube = scene.preview.realm.world.getComponent<Model3DComponent>(
        scene.preview.cube.entityId,
        'Model3D'
      )!;
      const before = Array.from(cube.localMatrix);
      advanceFrame(runtime, transport, 0.5);
      expect(Array.from(cube.localMatrix)).not.toEqual(before);
      const originalTarget = scene.renderTarget;
      scene.resize(600, 400);
      check();
      expect(runtime.multiverse.getTarget(originalTarget)).toBeUndefined();
      const previewRealmId = scene.preview.realm.realmId,
        renderTarget = scene.renderTarget;
      scene.dispose();
      expect(runtime.multiverse.getRealm(previewRealmId)).toBeUndefined();
      expect(runtime.multiverse.getTarget(renderTarget)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });
});
