import { describe, expect, it } from 'bun:test';
import { EcsWorld } from '../src/ecs/world';
import { createMetadata, createName } from '../src/ecs/metadata';
import { Realm3D } from '../src/realm3d/realm';

describe('@galfus/engine > ECS Name & Metadata', () => {
  it('assigns, queries, and updates entity names in EcsWorld', () => {
    const world = new EcsWorld();
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const e3 = world.createEntity();

    world.setEntityName(e1, 'Player_Root');
    world.setEntityName(e2, 'Player_Head');
    world.setEntityName(e3, 'Enemy_Goblin');

    expect(world.getEntityName(e1)).toBe('Player_Root');
    expect(world.getEntityName(e2)).toBe('Player_Head');
    expect(world.getEntityName(e3)).toBe('Enemy_Goblin');

    // Single exact match
    expect(world.findEntityByName('Player_Head')).toBe(e2);
    expect(world.findEntityByName('NonExistent')).toBeUndefined();

    // Pattern matching (string and regex)
    expect(world.findEntitiesByName('Player_Head')).toEqual([e2]);
    expect(world.findEntitiesByName(/^Player_/)).toEqual([e1, e2]);

    // Updating existing name
    world.setEntityName(e2, 'Player_Neck');
    expect(world.getEntityName(e2)).toBe('Player_Neck');
    expect(world.findEntityByName('Player_Head')).toBeUndefined();
    expect(world.findEntityByName('Player_Neck')).toBe(e2);
  });

  it('stores, queries, and filters key-value metadata in EcsWorld', () => {
    const world = new EcsWorld();
    const e1 = world.createEntity();
    const e2 = world.createEntity();

    world.setMetadataKV(e1, 'isCollider', true);
    world.setMetadataKV(e1, 'hp', 100);
    world.setMetadataKV(e1, 'tags', ['player', 'hero']);

    world.setMetadataKV(e2, 'isCollider', false);
    world.setMetadataKV(e2, 'hp', 100);
    world.setMetadataKV(e2, 'type', 'ghost');

    expect(world.getMetadataKV(e1, 'isCollider')).toBe(true);
    expect(world.getMetadataKV<number>(e1, 'hp')).toBe(100);
    expect(world.getMetadataKV<string[]>(e1, 'tags')).toEqual(['player', 'hero']);
    expect(world.getMetadataKV(e1, 'unknown')).toBeUndefined();

    // Query by key presence
    expect(world.findEntitiesByMetadata('isCollider')).toEqual([e1, e2]);
    expect(world.findEntitiesByMetadata('tags')).toEqual([e1]);

    // Query by key and matching value
    expect(world.findEntitiesByMetadata('isCollider', true)).toEqual([e1]);
    expect(world.findEntitiesByMetadata('isCollider', false)).toEqual([e2]);
    expect(world.findEntitiesByMetadata('hp', 100)).toEqual([e1, e2]);
    expect(world.findEntitiesByMetadata('hp', 50)).toEqual([]);
  });

  it('delegates name and metadata helpers through Realm3D', () => {
    const realm = new Realm3D(10);
    const box = realm.createCube(1.0, 1);

    realm.setEntityName(box.entityId, 'Crate_A');
    realm.setMetadataKV(box.entityId, 'destructible', true);

    expect(realm.getEntityName(box.entityId)).toBe('Crate_A');
    expect(realm.findEntityByName('Crate_A')).toBe(box.entityId);
    expect(realm.getMetadataKV(box.entityId, 'destructible')).toBe(true);
    expect(realm.findEntitiesByMetadata('destructible', true)).toEqual([box.entityId]);
  });
});
