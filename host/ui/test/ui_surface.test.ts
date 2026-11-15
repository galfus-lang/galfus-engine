import { describe, expect, it } from 'bun:test';
import type { Model2DComponent } from '@galfus/engine';
import { setup } from '../../engine/test/interactive-fixture';
import { createUi } from '../src';

describe('UI interaction surface host', () => {
  it('connects multiple SpritePanels with the core UI ID and disconnects them independently', () => {
    const f = setup();
    try {
      const calls: unknown[] = [],
        removed: number[][] = [];
      f.transport.engine.multiverseConnectUiInteractionSurface = (surface) => {
        calls.push(surface);
      };
      f.transport.engine.multiverseDisconnectUiInteractionSurface = (realm, model, element) => {
        removed.push([realm, model, element]);
      };
      const ui = createUi(f.runtime);
      f.realm.world.createEntity();
      const root = ui.createComponentRoot(f.realm, { width: 100, height: 100 });
      const target = f.runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 100, height: 100 }
      });
      const first = root.root.addSpritePanel({ textureId: target });
      const second = root.root.addSpritePanel({ textureId: target });
      root.flush();
      f.runtime.multiverse.bindTargetTexture({
        realmId: f.realm.realmId,
        sourceTargetId: target,
        slot: 'screen'
      });
      const base = { realmId: f.realm.realmId, uiId: root.uiId, slot: 'screen' };
      const one = f.runtime.interaction.connectUiSurface({ ...base, elementId: first.id });
      const two = f.runtime.interaction.connectUiSurface({ ...base, elementId: second.id });
      const model = f.realm.world.getComponent<Model2DComponent>(root.entityId, 'Model2D')!;
      expect(model.modelId).not.toBe(root.entityId);
      expect(calls).toEqual([
        expect.objectContaining({ modelId: model.modelId, elementId: first.id }),
        expect.objectContaining({ modelId: model.modelId, elementId: second.id })
      ]);
      expect(() =>
        f.runtime.interaction.connectUiSurface({ ...base, elementId: first.id })
      ).toThrow('already');
      one();
      expect(removed).toEqual([[f.realm.realmId, model.modelId, first.id]]);
      two();
      expect(removed).toHaveLength(2);
      ui.dispose();
    } finally {
      f.runtime.dispose();
    }
  });
});
