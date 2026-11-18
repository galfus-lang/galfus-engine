import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, Transform2DDesc } from '@galfus/transport-types';
import { createAnchor } from '../src/anchors/index';
import { Model2DComponent, type Model2DUIComponent } from '../src/realm2d/components';
import { Realm2D } from '../src/realm2d/realm';

describe('Realm2D parity', () => {
  it('returns the core-computed UI layout for the matching model', () => {
    const calls: number[][] = [];
    const engine = {
      realm2dCreate: () => {},
      realm2dDestroy: () => {},
      realm2dGetUiLayout: (...args: number[]) => {
        calls.push(args);
        return JSON.stringify({
          localRect: [1, 2, 3, 4],
          absoluteRect: [5, 6, 3, 4],
          clipRect: null,
          accumulatedOpacity: 1,
          contentSize: [3, 4]
        });
      },
      realm2dGetRichTextClusters: () =>
        JSON.stringify([{ start: 1, end: 3, rect: [5, 6, 10, 20], rightToLeft: false }]),
      realm2dGetUiTextGeometry: () => JSON.stringify({ lines: [], clusters: [] })
    } as unknown as GalfusEngine;
    const realm = new Realm2D(7);
    const ui = realm.createUi({});
    expect(() => realm.getUiLayout(ui, 2)).toThrow('without a bound transport');
    realm.bindEngine(engine);
    expect(realm.getUiLayout(ui, 2).absoluteRect).toEqual([5, 6, 3, 4]);
    const component = realm.world.getComponent<Model2DUIComponent>(ui.entityId, 'Model2DUI')!;
    expect(() => realm.getRichTextClusters(ui, 2)).toThrow('pending changes');
    component.isDirty = false;
    expect(realm.getRichTextClusters(ui, 2)).toEqual([
      { start: 1, end: 3, rect: [5, 6, 10, 20], rightToLeft: false }
    ]);
    expect(realm.getUiTextGeometry(ui, 2)).toEqual({ lines: [], clusters: [] });
    realm.applyUiCommands(ui, [{ type: 'remove', id: 2 }]);
    expect(() => realm.getRichTextClusters(ui, 2)).toThrow('pending changes');
    expect(() => realm.getUiTextGeometry(ui, 2)).toThrow('pending changes');
    expect(calls).toEqual([[7, ui.uiId, 2]]);
    expect(() => realm.getUiLayout({ ...ui, uiId: ui.uiId + 1 }, 2)).toThrow(
      'UI model does not exist'
    );
    realm.dispose();
    expect(() => realm.getUiLayout(ui, 2)).toThrow('disposed');
  });
  it('synchronizes and destroys materials across binding and reset', () => {
    const events: string[] = [];
    const engine = {
      realm2dCreate: () => events.push('realm created'),
      realm2dDestroy: () => events.push('realm destroyed'),
      realm2dCreateMaterial: (_r: number, id: number) => events.push(`create ${id}`),
      realm2dDestroyMaterial: (_r: number, id: number) => events.push(`destroy ${id}`)
    } as unknown as GalfusEngine;
    const realm = new Realm2D(1);
    const first = realm.createMaterial({});
    const removed = realm.createMaterial({});
    realm.destroyMaterial(removed);
    realm.bindEngine(engine);
    realm.flush();
    expect(events).toEqual(['realm created', `create ${first}`]);
    realm.destroyMaterial(first);
    realm.flush();
    expect(events).toContain(`destroy ${first}`);
    const last = realm.createMaterial({});
    realm.flush();
    realm.reset();
    expect(events.filter((event) => event === `destroy ${last}`)).toHaveLength(1);
    realm.flush();
    expect(events.filter((event) => event === `create ${last}`)).toHaveLength(1);
    realm.dispose();
  });

  it('synchronizes changed layer and order and retains reflected transforms', () => {
    const transforms: Transform2DDesc[] = [];
    const engine = {
      realm2dCreate: () => {},
      realm2dCreateSprite: (_r: number, _id: number, _desc: unknown, tf: Transform2DDesc) =>
        transforms.push(tf),
      realm2dSetSpriteTransform: (_r: number, _id: number, tf: Transform2DDesc) =>
        transforms.push(tf),
      realm2dDestroySprite: () => {},
      realm2dDestroy: () => {}
    } as unknown as GalfusEngine;
    const realm = new Realm2D(1);
    realm.bindEngine(engine);
    const entity = realm.createSprite(
      { dimensions: [1, 1] },
      { position: [3, 4], rotation: 0.7, scale: [2, -3] }
    );
    realm.sync({ frameId: 1, time: 0, dt: 0, engine });
    const model = realm.world.getComponent<Model2DComponent>(entity, 'Model2D')!;
    model.zLayer = 4;
    model.drawOrder = 7;
    realm.sync({ frameId: 2, time: 0, dt: 0, engine });
    expect(transforms).toHaveLength(2);
    expect(transforms[1]!.zLayer).toBe(4);
    expect(transforms[1]!.drawOrder).toBe(7);
    expect(transforms[1]!.scale![1]).toBeCloseTo(-3);
    model.setRotation(1.2);
    realm.sync({ frameId: 3, time: 0, dt: 0, engine });
    expect(transforms[2]!.rotation).toBeCloseTo(1.2);
    expect(transforms[2]!.scale![1]).toBeCloseTo(-3);
    realm.dispose();
  });

  it('propagates a reflected parent transform to its child sprite', () => {
    const transforms: Transform2DDesc[] = [];
    const engine = {
      realm2dCreate: () => {},
      realm2dCreateSprite: (_r: number, _id: number, _desc: unknown, tf: Transform2DDesc) =>
        transforms.push(tf),
      realm2dSetSpriteTransform: (_r: number, _id: number, tf: Transform2DDesc) =>
        transforms.push(tf),
      realm2dDestroySprite: () => {},
      realm2dDestroy: () => {}
    } as unknown as GalfusEngine;
    const realm = new Realm2D(1);
    realm.bindEngine(engine);
    const parent = realm.createSpatialNode({ position: [10, 20], scale: [1, -1] });
    const child = realm.createSprite({ dimensions: [1, 1] }, { position: [2, 3] });
    realm.world.attachComponent(child, createAnchor({ targetEntityId: parent }));
    realm.sync({ frameId: 1, time: 0, dt: 0, engine });
    expect(transforms[0]!.position).toEqual([12, 17]);
    expect(transforms[0]!.scale![1]).toBeCloseTo(-1);
    realm.world.getComponent<Model2DComponent>(parent, 'Model2D')!.setPosition(20, 30);
    realm.sync({ frameId: 2, time: 0, dt: 0, engine });
    expect(transforms[1]!.position).toEqual([22, 27]);
    realm.dispose();
  });
});
