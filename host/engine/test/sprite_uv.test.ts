import { describe, expect, it } from 'bun:test';
import type { GalfusEngine } from '@galfus/transport-types';
import { Realm2D } from '../src/realm2d/realm';

describe('sprite UV synchronization', () => {
  it('updates only the sprite UV by its logical ID, coalesces updates and retries failures', () => {
    const realm = new Realm2D(9);
    const created: number[] = [];
    const sent: Array<[number, number, number, number, number]> = [];
    let fail = false;
    const engine = {
      realm2dCreate: () => {},
      realm2dCreateMaterial: () => {},
      realm2dCreateSprite: (_realm: number, id: number) => created.push(id),
      realm2dSetSpriteTransform: () => {},
      realm2dSetSpriteUvRect: (
        _realm: number,
        id: number,
        ...uv: [number, number, number, number]
      ) => {
        if (fail) throw new Error('failed');
        sent.push([id, ...uv]);
      }
    } as unknown as GalfusEngine;
    realm.bindEngine(engine);
    realm.createMaterial({});
    const entity = realm.createSprite({ dimensions: [4, 5] });
    const sync = () => realm.sync({ time: 0, dt: 0.016, frameId: 1, engine });
    sync();
    expect(created).toEqual([2]);
    expect(Number(entity)).not.toBe(2);
    realm.setSpriteUvRect(entity, [0, 0, 0.25, 0.25]);
    realm.setSpriteUvRect(entity, [1.5, 0, -1, 0.5]);
    sync();
    expect(sent).toEqual([[2, 1.5, 0, -1, 0.5]]);
    expect(created).toEqual([2]);
    realm.setSpriteUvRect(entity, [1.5, 0, -1, 0.5]);
    sync();
    expect(sent).toHaveLength(1);
    expect(() => realm.setSpriteUvRect(entity, [NaN, 0, 1, 1])).toThrow();
    expect(() => realm.setSpriteUvRect(entity, [1e100, 0, 1, 1])).toThrow();
    expect(() => realm.setSpriteUvRect(realm.world.createEntity(), [0, 0, 1, 1])).toThrow();
    realm.setSpriteUvRect(entity, [0, 0, 1, 1]);
    fail = true;
    expect(sync).toThrow();
    fail = false;
    sync();
    expect(sent.at(-1)).toEqual([2, 0, 0, 1, 1]);
  });
});
