import { describe, expect, it } from 'bun:test';
import type { GalfusEngine } from '@galfus/transport-types';
import { Realm2D, type Sprite2DComponent, SpriteSheet } from '../src/realm2d';
import { ResourceManager } from '../src/resources/manager';

describe('SpriteSheet', () => {
  it('maps grid cells and names to normalized UVs with margin and spacing', () => {
    const sheet = new SpriteSheet({
      textureId: 1,
      textureSize: [100, 60],
      grid: {
        columns: 3,
        rows: 2,
        frameSize: [20, 20],
        margin: [4, 5],
        spacing: [2, 3],
        frameCount: 5,
        names: { idle: 0, selected: 4 }
      }
    });
    expect(sheet.frameCount).toBe(5);
    expect(sheet.uvRect(0)).toEqual([0.04, 5 / 60, 0.24, 25 / 60]);
    expect(sheet.uvRect('selected')).toEqual([0.26, 28 / 60, 0.46, 48 / 60]);
    const uv = sheet.uvRect('idle');
    uv[0] = 99;
    expect(sheet.uvRect('idle')[0]).toBe(0.04);
    expect(() => sheet.uvRect(5)).toThrow();
    expect(() => sheet.uvRect(-1)).toThrow();
    expect(() => sheet.uvRect(1.5)).toThrow();
    expect(() => sheet.uvRect('unknown')).toThrow();
  });

  it('supports explicit irregular rectangles and copies input data', () => {
    const frame: [number, number, number, number] = [16, 8, 24, 12];
    const sheet = new SpriteSheet({
      textureId: 4,
      textureSize: [64, 32],
      frames: [{ name: 'large', rect: frame }, { rect: [0, 0, 8, 8] }]
    });
    frame[0] = 0;
    expect(sheet.uvRect('large')).toEqual([0.25, 0.25, 0.625, 0.625]);
    expect(sheet.uvRect(1)).toEqual([0, 0, 0.125, 0.25]);
    expect(Object.isFrozen(sheet)).toBe(true);
  });

  it('rejects invalid identifiers, rectangles and grid metadata', () => {
    expect(
      () =>
        new SpriteSheet({
          textureId: 0xffffffff,
          textureSize: [32, 32],
          frames: [{ rect: [0, 0, 1, 1] }]
        })
    ).toThrow();
    expect(
      () =>
        new SpriteSheet({ textureId: 1, textureSize: [0, 32], frames: [{ rect: [0, 0, 1, 1] }] })
    ).toThrow();
    expect(
      () =>
        new SpriteSheet({ textureId: 1, textureSize: [32, 32], frames: [{ rect: [31, 0, 2, 1] }] })
    ).toThrow();
    expect(
      () =>
        new SpriteSheet({ textureId: 1, textureSize: [32, 32], frames: [{ rect: [0, 0, -1, 1] }] })
    ).toThrow();
    expect(
      () =>
        new SpriteSheet({
          textureId: 1,
          textureSize: [32, 32],
          frames: [
            { name: 'a', rect: [0, 0, 1, 1] },
            { name: 'a', rect: [1, 0, 1, 1] }
          ]
        })
    ).toThrow();
    expect(
      () =>
        new SpriteSheet({
          textureId: 1,
          textureSize: [32, 32],
          grid: { columns: 2, rows: 2, frameSize: [16, 16], spacing: [1, 0] }
        })
    ).toThrow();
    expect(
      () =>
        new SpriteSheet({
          textureId: 1,
          textureSize: [32, 32],
          grid: { columns: 1, rows: 1, frameSize: [16, 16], names: { bad: 1 } }
        })
    ).toThrow();
    expect(
      () =>
        new SpriteSheet({
          textureId: 1,
          textureSize: [32, 32],
          grid: { columns: 1, rows: 1, frameSize: [16, 16], frameCount: 0 }
        })
    ).toThrow();
  });

  it('applies to multiple sprites and panels without owning the texture', () => {
    const destroyed: number[] = [];
    const engine = {
      realm2dCreate: () => {},
      realm2dDestroy: () => {},
      resourceCreateTexture: () => {},
      resourceDisposeTexture: (id: number) => destroyed.push(id)
    } as unknown as GalfusEngine;
    const resources = new ResourceManager();
    resources.bindEngine(engine);
    const texture = resources.createTexture(new Uint8Array(16), {
      width: 2,
      height: 2,
      format: 'rgba8Unorm'
    });
    const sheet = new SpriteSheet({
      textureId: texture,
      textureSize: [2, 2],
      grid: { columns: 2, rows: 2, frameSize: [1, 1], names: { last: 3 } }
    });
    const realm = new Realm2D(1);
    realm.bindEngine(engine);
    const first = realm.createSprite({ dimensions: [1, 1] });
    const second = realm.createSprite({ dimensions: [1, 1] });
    const panelUpdates: number[][] = [];
    sheet.applyToSprite(realm, first, 'last');
    sheet.applyToSprite(realm, second, 0);
    sheet.applyToPanel({ setSpriteUvRect: (uv) => panelUpdates.push(uv) }, 'last');
    sheet.applyToPanel({ setUvRect: (uv) => panelUpdates.push(uv) }, 0);
    expect(panelUpdates).toEqual([
      [0.5, 0.5, 1, 1],
      [0, 0, 0.5, 0.5]
    ]);
    expect(realm.world.getComponent<Sprite2DComponent>(first, 'Sprite2D')!.desc.uvRect).toEqual([
      0.5, 0.5, 1, 1
    ]);
    expect(realm.world.getComponent<Sprite2DComponent>(second, 'Sprite2D')!.desc.uvRect).toEqual([
      0, 0, 0.5, 0.5
    ]);
    expect(() => sheet.applyToSprite(realm, first, 4)).toThrow();
    realm.dispose();
    expect(destroyed).toEqual([]);
    resources.dispose();
    expect(destroyed).toEqual([texture]);
  });
});
