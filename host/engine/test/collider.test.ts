import { describe, expect, it } from 'bun:test';
import { createAnchor } from '../src/anchors';
import { Collider2DComponent, Collider3DComponent } from '../src/collision';
import { EcsWorld } from '../src/ecs/world';
import type { GalfusEngine } from '@galfus/transport-types';
import { Realm2D } from '../src/realm2d/realm';
import { createModel2D, type Model2DComponent } from '../src/realm2d/components';
import { Realm3D } from '../src/realm3d/realm';

describe('host collider components and spatial queries', () => {
  it('transforms hit normals through rotated non-uniform collider transforms', () => {
    const realm = new Realm2D(1);
    const entity = realm.createSpatialNode({ rotation: Math.PI / 2, scale: [2, 1] });
    realm.addCollider(entity, { type: 'rectangle', halfExtents: [1, 1] });
    const hit = realm.raycast([0, -5], [0, 1], 10)[0]!;
    expect(hit.distance).toBeCloseTo(3);
    expect(hit.normal[0]).toBeCloseTo(0);
    expect(hit.normal[1]).toBeCloseTo(-1);
    realm.dispose();
  });

  it('does not call the renderer when querying a bound realm', () => {
    const calls: string[] = [];
    const engine = new Proxy(
      {
        realm2dCreate: () => {},
        realm2dDestroy: () => {}
      },
      {
        get(target, key) {
          if (key in target) return target[key as keyof typeof target];
          return () => calls.push(String(key));
        }
      }
    ) as unknown as GalfusEngine;
    const realm = new Realm2D(1);
    realm.bindEngine(engine);
    const entity = realm.createSpatialNode();
    realm.addCollider(entity, { type: 'circle', radius: 1 });
    expect(realm.queryPoint([0, 0])).toHaveLength(1);
    expect(realm.raycast([-3, 0], [1, 0], 10)).toHaveLength(1);
    expect(calls).toEqual([]);
    realm.dispose();
  });

  it('handles concave polygons, boundaries and invalid geometry', () => {
    const realm = new Realm2D(1);
    const entity = realm.createSpatialNode();
    const id = realm.addCollider(entity, {
      type: 'polygon',
      vertices: [
        [0, 0],
        [3, 0],
        [3, 1],
        [1, 1],
        [1, 3],
        [0, 3]
      ]
    });
    expect(realm.queryPoint([1, 2])[0]?.colliderId).toBe(id);
    expect(realm.queryPoint([2, 2])).toEqual([]);
    expect(realm.raycast([-2, 2], [1, 0], 1)).toEqual([]);
    expect(realm.raycast([-2, 2], [1, 0], 3)[0]?.distance).toBeCloseTo(2);
    expect(() =>
      realm.addCollider(entity, {
        type: 'polygon',
        vertices: [
          [0, 0],
          [1, 1],
          [1, 0],
          [0, 1]
        ]
      })
    ).toThrow();
    realm.dispose();
  });

  it('handles 3D box rays under non-uniform scaling', () => {
    const realm = new Realm3D(2);
    const entity = realm.createSpatialNode({ position: [5, 0, 0], scale: [2, 1, 1] });
    const id = realm.addCollider(entity, { type: 'box', halfExtents: [1, 1, 1] });
    const hit = realm.raycast([0, 0, 0], [1, 0, 0], 10)[0]!;
    expect(hit.colliderId).toBe(id);
    expect(hit.distance).toBeCloseTo(3);
    expect(hit.normal[0]).toBeCloseTo(-1);
    realm.dispose();
  });

  it('excludes singular transforms and restores them without an engine', () => {
    const realm = new Realm2D(9);
    const entity = realm.createSpatialNode();
    const id = realm.addCollider(entity, { type: 'circle', radius: 1 });
    expect(realm.queryPoint([0, 0])[0]?.colliderId).toBe(id);
    realm.world.getComponent<Model2DComponent>(entity, 'Model2D')!.setTRS([0, 0], 0, [0, 1]);
    expect(realm.queryPoint([0, 0])).toEqual([]);
    realm.world.getComponent<Model2DComponent>(entity, 'Model2D')!.setTRS();
    expect(realm.queryPoint([0, 0])[0]?.colliderId).toBe(id);
    realm.dispose();
  });

  it('requires a matching Model and prevents detaching it while a collider exists', () => {
    const world = new EcsWorld();
    const entity = world.createEntity();
    expect(() => world.attachComponent(entity, new Collider2DComponent())).toThrow();
    expect(() => world.attachComponent(entity, new Collider3DComponent())).toThrow();
    world.attachComponent(entity, createModel2D(1));
    world.attachComponent(entity, new Collider2DComponent());
    expect(() => world.detachComponent(entity, 'Model2D')).toThrow();
    expect(world.detachComponent(entity, 'Collider2D')).toBe(true);
    expect(world.detachComponent(entity, 'Model2D')).toBe(true);
  });

  it('queries multiple 2D and 3D colliders, hierarchies and removal without transport', () => {
    const realm = new Realm2D(1);
    const parent = realm.createSpatialNode({ position: [10, 2] });
    const entity = realm.createSpatialNode({ position: [2, 0] });
    realm.world.attachComponent(entity, createAnchor({ targetEntityId: parent }));
    const circle = realm.addCollider(
      entity,
      { type: 'circle', radius: 1 },
      { layer: 2, sensor: true }
    );
    const rect = realm.addCollider(
      entity,
      { type: 'rectangle', halfExtents: [1, 2] },
      { matrix: [1, 0, 0, 1, 4, 0], layer: 4 }
    );
    expect(realm.queryPoint([12, 2]).map((h) => h.colliderId)).toEqual([circle]);
    expect(realm.queryPoint([16, 2], 2)).toEqual([]);
    expect(realm.queryPoint([16, 2], 4)[0]?.colliderId).toBe(rect);
    const hits = realm.raycast([8, 2], [1, 0], 20);
    expect(hits.map((h) => h.colliderId)).toEqual([circle, rect]);
    expect(hits[0]?.distance).toBeCloseTo(3);
    expect(hits[0]?.normal[0]).toBeCloseTo(-1);
    expect(hits[0]?.sensor).toBe(true);
    realm.world.getComponent<Model2DComponent>(parent, 'Model2D')!.setPosition(20, 2);
    expect(realm.queryPoint([22, 2])[0]?.colliderId).toBe(circle);
    expect(realm.queryPoint([12, 2])).toEqual([]);
    realm.world.destroyEntity(entity);
    expect(realm.queryPoint([22, 2])).toEqual([]);

    const realm3d = new Realm3D(2);
    const model = realm3d.createSpatialNode({ position: [0, 0, 3] });
    const sphere = realm3d.addCollider(model, { type: 'sphere', radius: 1 });
    const plane = realm3d.addCollider(
      model,
      { type: 'plane', halfExtents: [2, 2] },
      { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 2, 1] }
    );
    const hits3d = realm3d.raycast([0, 0, 0], [0, 0, 1], 10);
    expect(hits3d.map((h) => h.colliderId)).toEqual([sphere, plane]);
    expect(hits3d[0]?.distance).toBeCloseTo(2);
    expect(hits3d[1]?.distance).toBeCloseTo(5);
    realm3d.reset();
    expect(realm3d.raycast([0, 0, 0], [0, 0, 1], 10)).toEqual([]);
    realm.dispose();
    realm3d.dispose();
  });
});
