import { describe, expect, it } from 'bun:test';
import type { Model2DComponent } from '../src/realm2d';
import { setup } from './interactive-fixture';
import { PresentationLinks } from '../src/multiverse/presentation-links';

describe('interaction surfaces', () => {
  it('retains a shared ModelUI binding until every SpritePanel is disconnected', () => {
    const links = new PresentationLinks();
    links.bind({ realmId: 1, slot: 'screen', sourceTargetId: 2 });
    const first = { realmId: 1, entityId: 5, slot: 'screen', elementId: 10 };
    const second = { ...first, elementId: 11 };
    links.connectSurface(first);
    links.connectSurface(second);
    links.disconnectSurface(first);
    expect(links.snapshot().surfaces).toEqual([second]);
    links.disconnectSurface(second);
    expect(links.snapshot().surfaces).toEqual([]);
  });
  it('resolves host entity IDs, rejects duplicates and disconnects on reset', () => {
    const f = setup();
    try {
      const sent: unknown[] = [],
        disconnected: number[][] = [];
      f.transport.engine.multiverseConnectInteractionSurface = (surface) => {
        sent.push(surface);
      };
      f.transport.engine.multiverseDisconnectInteractionSurface = (realm, collider) => {
        disconnected.push([realm, collider]);
      };
      f.realm.world.createEntity();
      const entity = f.realm.createSprite({ dimensions: [10, 10] });
      const collider = f.realm.addCollider(entity, { type: 'rectangle', halfExtents: [5, 5] });
      const model = f.realm.world.getComponent<Model2DComponent>(entity, 'Model2D')!;
      expect(model.modelId).not.toBe(entity);
      const target = f.runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 10, height: 10 }
      });
      f.runtime.multiverse.bindTargetTexture({
        realmId: f.realm.realmId,
        slot: 'screen',
        sourceTargetId: target
      });
      const options = {
        realmId: f.realm.realmId,
        entityId: entity,
        colliderId: collider,
        slot: 'screen',
        flipY: true
      };
      const disconnect = f.runtime.interaction.connectSurface(options);
      expect(sent).toEqual([
        {
          realmId: f.realm.realmId,
          modelId: model.modelId,
          colliderId: collider,
          slot: 'screen',
          flipY: true
        }
      ]);
      expect(() => f.runtime.interaction.connectSurface(options)).toThrow('already');
      f.runtime.reset();
      expect(disconnected).toEqual([[f.realm.realmId, collider]]);
      disconnect();
      expect(disconnected).toHaveLength(1);
    } finally {
      f.runtime.dispose();
    }
  });
});
