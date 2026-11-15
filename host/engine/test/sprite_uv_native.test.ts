import { describe, expect, it } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { createNodeTransport } from '@galfus/transport-node';
import { createRuntime, type Sprite2DComponent } from '../src';

describe('sprite UV native bindings', () => {
  it.each([
    ['Bun', createBunTransport],
    ['Node', createNodeTransport]
  ] as const)('updates existing Sprite2D and SpritePanel through %s', (_name, createTransport) => {
    const transport = createTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const realm = runtime.createRealm2D();
      const entity = realm.createSprite({ dimensions: [1, 1] });
      realm.setSpriteUvRect(entity, [0, 0, 0.5, 0.5]);
      realm.flush();
      const sprite = realm.world.getComponent<Sprite2DComponent>(entity, 'Sprite2D')!;
      realm.setSpriteUvRect(entity, [0.5, 0.5, 1, 1]);
      expect(() => realm.flush()).not.toThrow();
      expect(sprite.desc.uvRect).toEqual([0.5, 0.5, 1, 1]);
      expect(() =>
        transport.engine.realm2dSetSpriteUvRect(realm.realmId, sprite.spriteId, NaN, 0, 1, 1)
      ).toThrow();
      expect(() =>
        transport.engine.realm2dSetSpriteUvRect(realm.realmId, 100000, 0, 0, 1, 1)
      ).toThrow();
      const ui = realm.createUi({});
      realm.applyUiCommands(ui, [
        { type: 'create', id: 1, kind: { type: 'panel' } },
        { type: 'create', id: 2, kind: { type: 'spritePanel', textureId: 1 } },
        { type: 'insert', parentId: 1, childId: 2 }
      ]);
      realm.flush();
      expect(() =>
        realm.commitUiCommands(ui, [
          { type: 'setSpriteUvRect', id: 2, uvRect: [0.25, 0.25, 0.5, 0.5] }
        ])
      ).not.toThrow();
      expect(() =>
        realm.commitUiCommands(ui, [{ type: 'setSpriteUvRect', id: 1, uvRect: [0, 0, 1, 1] }])
      ).toThrow();
    } finally {
      runtime.dispose();
    }
  });
});
