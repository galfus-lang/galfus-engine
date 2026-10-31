/**
 * Test suite verifying Phases F04 to F08:
 * - F04: Public logical ID bounds, FIFO IntentStore with recursion cap & error isolation, RegExp /g stability, ECS integrity.
 * - F05 & F06: Spatial Model3D with contiguous dual 4x4 matrices, Mesh3D component, and external geometry/material registries.
 * - F07 & F08: Spatial Model2D with contiguous dual affine matrices, visual attachment requirements, and 2D/3D parity.
 */
import { describe, expect, it } from 'bun:test';
import { EcsWorld } from '../src/ecs/world';
import { IdAllocator } from '../src/types';
import { IntentStore } from '../src/ecs/intent';
import { SpatialDirtyFlags } from '../src/spatial/flags';
import { Realm3D } from '../src/realm3d/realm';
import { createModel3D, createMesh3D, Model3DComponent } from '../src/realm3d/components';
import { Realm2D } from '../src/realm2d/realm';
import { createModel2D, createSprite2D, Model2DComponent } from '../src/realm2d/components';
import { createAnchor } from '../src/anchors/component';

describe('Phase F04 to F08 — Compact Spatial Models & ECS Integrity', () => {
  describe('F04: IdAllocator & Logical ID Boundary Enforcement', () => {
    it('strictly prohibits logical IDs in the core-reserved range (4294901761..=4294967295)', () => {
      const allocator = new IdAllocator(4294901760);
      // Valid ID right before boundary
      const id1 = allocator.allocate();
      expect(id1).toBe(4294901760);

      // Attempting to allocate inside reserved range throws
      expect(() => allocator.allocate()).toThrow(/reserved for internal engine resources/);
    });

    it('markUsed() registers manual IDs and avoids collisions with allocate()', () => {
      const allocator = new IdAllocator(1);
      allocator.markUsed(10);
      allocator.markUsed(2);

      expect(allocator.allocate()).toBe(1);
      // 2 was marked used, should allocate 3
      expect(allocator.allocate()).toBe(3);

      // Allocating up to 10 should skip 10
      for (let i = 4; i <= 9; i++) {
        expect(allocator.allocate()).toBe(i);
      }
      expect(allocator.allocate()).toBe(11);
    });

    it('markUsed() rejects reserved IDs', () => {
      const allocator = new IdAllocator(1);
      expect(() => allocator.markUsed(4294901761)).toThrow(
        /reserved for internal engine resources/
      );
    });
  });

  describe('F04: FIFO IntentStore, Error Isolation & Recursion Bounds', () => {
    it('executes intents in strict FIFO order and continues execution after a failing intent', () => {
      const world = new EcsWorld();
      const store = new IntentStore();
      const executed: string[] = [];

      store.queueCustom(() => executed.push('first'));
      store.queueCustom(() => {
        throw new Error('Simulated failure in middle intent');
      });
      store.queueCustom(() => executed.push('third'));

      const errors = store.flush(world);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('Simulated failure');
      expect(executed).toEqual(['first', 'third']);
    });

    it('caps recursive intent flushes to prevent infinite loops (maxFlushDepth = 100)', () => {
      const world = new EcsWorld();
      const store = new IntentStore();
      let iterationCount = 0;

      const queueNext = () => {
        iterationCount++;
        store.queueCustom(queueNext);
      };

      store.queueCustom(queueNext);
      const errors = store.flush(world, 50);

      expect(iterationCount).toBe(50);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('Max flush depth (50) exceeded');
      expect(store.pendingCount).toBe(0);
    });

    it('findEntitiesByName() remains reliable when queried repeatedly with global RegExp (/g)', () => {
      const world = new EcsWorld();
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      world.setEntityName(e1, 'HeroTank');
      world.setEntityName(e2, 'EnemyTank');

      const regex = /Tank$/g;
      // First execution
      const res1 = world.findEntitiesByName(regex);
      expect(res1.length).toBe(2);

      // Second execution: without lastIndex=0 fix, /g would fail on subsequent calls
      const res2 = world.findEntitiesByName(regex);
      expect(res2.length).toBe(2);
      expect(res1).toEqual(res2);
    });
  });

  describe('F04, F06, F08: Structural ECS Integrity Enforcement', () => {
    it('prohibits attaching Mesh3D to an entity without Model3DComponent', () => {
      const world = new EcsWorld();
      const entity = world.createEntity();
      const mesh = createMesh3D(1, 1, { geometryId: 10, materialId: 20 });

      expect(() => {
        world.attachComponent(entity, mesh);
      }).toThrow(/Entity \d+ cannot have Mesh3D attached without a Model3D spatial component/);
    });

    it('allows attaching Mesh3D once Model3D is present on the entity', () => {
      const world = new EcsWorld();
      const entity = world.createEntity();
      const model = createModel3D(1);
      const mesh = createMesh3D(1, 1, { geometryId: 10, materialId: 20 });

      world.attachComponent(entity, model);
      expect(() => {
        world.attachComponent(entity, mesh);
      }).not.toThrow();
    });

    it('prohibits attaching 2D visuals (Sprite2D, Shape2D, Svg2D) without Model2DComponent', () => {
      const world = new EcsWorld();
      const entity = world.createEntity();
      const sprite = createSprite2D(1, { dimensions: [32, 32] });

      expect(() => {
        world.attachComponent(entity, sprite);
      }).toThrow(/Entity \d+ cannot have Sprite2D attached without a Model2D spatial component/);
    });

    it('allows attaching Sprite2D once Model2D is present on the entity', () => {
      const world = new EcsWorld();
      const entity = world.createEntity();
      const model = createModel2D(1);
      const sprite = createSprite2D(1, { dimensions: [32, 32] });

      world.attachComponent(entity, model);
      expect(() => {
        world.attachComponent(entity, sprite);
      }).not.toThrow();
    });
  });

  describe('F05 & F06: 3D Spatial Models & Independent Resource Management', () => {
    it('Model3DComponent encapsulates contiguous local and world 4x4 matrices with SpatialDirtyFlags', () => {
      const model = new Model3DComponent(1);
      expect(model.localMatrix.length).toBe(16);
      expect(model.worldMatrix.length).toBe(16);
      expect((model.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(true);

      model.setPosition(10, 20, 30);
      expect(model.localMatrix[12]).toBe(10);
      expect(model.localMatrix[13]).toBe(20);
      expect(model.localMatrix[14]).toBe(30);
      expect((model.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(true);
    });

    it('Realm3D creates pure spatial nodes without Mesh attachment', () => {
      const realm = new Realm3D(100);
      const nodeEntity = realm.createSpatialNode({ position: [5, 10, 15] });

      expect(realm.world.hasComponent(nodeEntity, 'Model3D')).toBe(true);
      expect(realm.world.hasComponent(nodeEntity, 'Mesh3D')).toBe(false);

      const model = realm.world.getComponent<Model3DComponent>(nodeEntity, 'Model3D');
      expect(model?.localMatrix[12]).toBe(5);
      expect(model?.localMatrix[13]).toBe(10);
      expect(model?.localMatrix[14]).toBe(15);
    });

    it('Geometries and Materials are stored in Realm resources outside ECS and survive entity destruction (HOST-024)', () => {
      const realm = new Realm3D(101);
      const { geometryId } = realm.createGeometry({ kind: 'cube', size: 2.0 });
      const { materialId } = realm.createMaterial({ baseColor: [1, 0, 0, 1] });

      // Create two distinct models sharing the same geometry and material
      const e1 = realm.createModel({ geometryId, materialId });
      const e2 = realm.createModel({ geometryId, materialId });

      // Ensure geometries/materials are NOT entities in the ECS world
      expect(realm.world.query('Geometry3D').length).toBe(0);
      expect(realm.world.query('Material3D').length).toBe(0);

      // Destroying e1 should not remove the shared geometry or material
      realm.world.destroyEntity(e1);
      expect(realm.world.isAlive(e1)).toBe(false);
      expect(realm.world.isAlive(e2)).toBe(true);

      // Resources remain registered in the realm
      const geometries = Array.from(realm.getGeometries());
      const materials = Array.from(realm.getMaterials());
      expect(geometries.some((g) => g.geometryId === geometryId)).toBe(true);
      expect(materials.some((m) => m.materialId === materialId)).toBe(true);
    });
  });

  describe('F07 & F08: 2D Spatial Models & Parity with 3D', () => {
    it('Model2DComponent encapsulates contiguous affine matrices with SpatialDirtyFlags', () => {
      const model = new Model2DComponent(1);
      expect(model.localMatrix.length).toBe(6);
      expect(model.worldMatrix.length).toBe(6);
      expect((model.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(true);

      model.setPosition(50, 100);
      expect(model.localMatrix[4]).toBe(50);
      expect(model.localMatrix[5]).toBe(100);
      expect((model.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(true);
    });

    it('Realm2D creates pure 2D spatial nodes without visuals', () => {
      const realm = new Realm2D(200);
      const nodeEntity = realm.createSpatialNode({ position: [15, 25] });

      expect(realm.world.hasComponent(nodeEntity, 'Model2D')).toBe(true);
      expect(realm.world.hasComponent(nodeEntity, 'Sprite2D')).toBe(false);

      const model = realm.world.getComponent<Model2DComponent>(nodeEntity, 'Model2D');
      expect(model?.localMatrix[4]).toBe(15);
      expect(model?.localMatrix[5]).toBe(25);
    });

    it('Anchor solver updates worldMatrix directly in Model3D and Model2D with state transitions', () => {
      const realm3D = new Realm3D(300);
      const parent3D = realm3D.createSpatialNode({ position: [100, 0, 0] });
      const child3D = realm3D.createSpatialNode({ position: [10, 0, 0] });
      realm3D.hierarchy.attach(child3D, parent3D);

      realm3D.preRender({ time: 0, dt: 0.016, frameId: 1, engine: null as any });

      const childModel3D = realm3D.world.getComponent<Model3DComponent>(child3D, 'Model3D')!;
      // Resolved worldMatrix X position should be 110 (100 + 10)
      expect(childModel3D.worldMatrix[12]).toBeCloseTo(110);
      // LocalDirty flag is cleared, WorldDirty is set for Core sync
      expect((childModel3D.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(false);
      expect((childModel3D.flags & SpatialDirtyFlags.WorldDirty) !== 0).toBe(true);

      const realm2D = new Realm2D(301);
      const parent2D = realm2D.createSpatialNode({ position: [200, 300] });
      const child2D = realm2D.createSpatialNode({ position: [20, 30] });
      realm2D.hierarchy.attach(child2D, parent2D);

      realm2D.preRender({ time: 0, dt: 0.016, frameId: 1, engine: null as any });

      const childModel2D = realm2D.world.getComponent<Model2DComponent>(child2D, 'Model2D')!;
      // Resolved worldMatrix X and Y positions: 220 and 330
      expect(childModel2D.worldMatrix[4]).toBeCloseTo(220);
      expect(childModel2D.worldMatrix[5]).toBeCloseTo(330);
      expect((childModel2D.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(false);
      expect((childModel2D.flags & SpatialDirtyFlags.WorldDirty) !== 0).toBe(true);
    });
  });
});
