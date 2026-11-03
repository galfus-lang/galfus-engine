import { describe, expect, it } from 'bun:test';
import {
  type AnchorComponent,
  type Model2DComponent,
  type Model3DComponent,
  presetsAnchor,
  Realm2D,
  Realm3D
} from '../src/index';

describe('Anchor Presets & Physics Handoff (Rope, Chain, Spring, managedByPhysics)', () => {
  it('3D rope strategy allows slack within maxLength and clamps beyond maxLength', () => {
    const realm = new Realm3D(1);
    const parent = realm.createSpatialNode({ position: [0, 0, 0] });
    const child = realm.createSpatialNode({ position: [2, 0, 0] });

    realm.hierarchy.attach(child, parent, {
      strategy: presetsAnchor.rope({ maxLength: 5 })
    });

    realm.preRender({ time: 0.016, dt: 0.016, frameId: 1 });
    const parentModel = realm.world.getComponent<Model3DComponent>(parent, 'Model3D')!;
    const childModel = realm.world.getComponent<Model3DComponent>(child, 'Model3D')!;
    // Within maxLength=5, child stays at x=2
    expect(childModel.worldMatrix[12]).toBeCloseTo(2, 4);

    // Move parent far away to x=10 -> distance is 8 > 5, child is pulled to x=5
    parentModel.setPosition(10, 0, 0);
    realm.preRender({ time: 0.032, dt: 0.016, frameId: 2 });
    expect(childModel.worldMatrix[12]).toBeCloseTo(5, 4);
  });

  it('3D chain strategy enforces exact rigid link distance', () => {
    const realm = new Realm3D(1);
    const a = realm.createSpatialNode({ position: [0, 0, 0] });
    const b = realm.createSpatialNode({ position: [0, -1, 0] });
    const c = realm.createSpatialNode({ position: [0, -2, 0] });

    realm.hierarchy.attachChain([a, b, c], {
      strategy: presetsAnchor.chain({ length: 3 })
    });

    realm.preRender({ time: 0.016, dt: 0.016, frameId: 1 });
    const bModel = realm.world.getComponent<Model3DComponent>(b, 'Model3D')!;
    const cModel = realm.world.getComponent<Model3DComponent>(c, 'Model3D')!;

    expect(bModel.worldMatrix[13]).toBeCloseTo(-3, 4);
    expect(cModel.worldMatrix[13]).toBeCloseTo(-6, 4);
  });

  it('3D spring strategy pulls toward restLength across frames via keepAwake', () => {
    const realm = new Realm3D(1);
    const anchor = realm.createSpatialNode({ position: [0, 10, 0] });
    const bob = realm.createSpatialNode({ position: [0, 0, 0] });

    realm.hierarchy.attach(bob, anchor, {
      strategy: presetsAnchor.spring({ restLength: 4, stiffness: 80, damping: 12 })
    });

    const bobModel = realm.world.getComponent<Model3DComponent>(bob, 'Model3D')!;
    for (let i = 1; i <= 60; i++) {
      realm.preRender({ time: i * 0.016, dt: 0.016, frameId: i });
    }

    // Rest position is 4 units below (0, 10, 0) => y ≈ 6
    expect(bobModel.worldMatrix[13]).toBeGreaterThan(5.0);
    expect(bobModel.worldMatrix[13]).toBeLessThan(7.0);
  });

  it('2D rope, chain, and spring strategies operate in 2D space', () => {
    const realm = new Realm2D(1);
    const parent = realm.createSpatialNode({ position: [0, 0] });
    const ropeChild = realm.createSpatialNode({ position: [10, 0] });
    const chainChild = realm.createSpatialNode({ position: [0, 1] });

    realm.hierarchy.attach(ropeChild, parent, {
      strategy: presetsAnchor.rope({ maxLength: 4 })
    });
    realm.hierarchy.attach(chainChild, parent, {
      strategy: presetsAnchor.chain({ length: 5 })
    });

    realm.preRender({ time: 0.016, dt: 0.016, frameId: 1 });
    const ropeModel = realm.world.getComponent<Model2DComponent>(ropeChild, 'Model2D')!;
    const chainModel = realm.world.getComponent<Model2DComponent>(chainChild, 'Model2D')!;

    expect(ropeModel.worldMatrix[4]).toBeCloseTo(4, 4);
    expect(chainModel.worldMatrix[5]).toBeCloseTo(5, 4);
  });

  it('managedByPhysics skips kinematic strategy on physics entity while updating visual children', () => {
    const realm = new Realm3D(1);
    const ceiling = realm.createSpatialNode({ position: [0, 10, 0] });
    const weight = realm.createSpatialNode({ position: [0, 2, 0] });
    const sparkEffect = realm.createSpatialNode({ position: [1, 0, 0] });

    realm.hierarchy.attach(weight, ceiling, {
      strategy: presetsAnchor.rope({ maxLength: 3 })
    });
    // Visual child attached statically to weight
    realm.hierarchy.attach(sparkEffect, weight, {
      strategy: presetsAnchor.static()
    });

    const weightAnchor = realm.world.getComponent<AnchorComponent>(weight, 'Anchor')!;
    weightAnchor.managedByPhysics = true;

    const weightModel = realm.world.getComponent<Model3DComponent>(weight, 'Model3D')!;
    const sparkModel = realm.world.getComponent<Model3DComponent>(sparkEffect, 'Model3D')!;

    // Simulate physics engine writing world pose (0, 2, 0) directly to weight.localMatrix
    weightModel.setPosition(0, 2, 0);
    realm.preRender({ time: 0.016, dt: 0.016, frameId: 1 });

    // Kinematic rope would have clamped y to 7 (10 - 3), but managedByPhysics preserves y = 2!
    expect(weightModel.worldMatrix[13]).toBeCloseTo(2, 4);
    // And visual child sparkEffect still resolves relative to weight -> (1, 2, 0)!
    expect(sparkModel.worldMatrix[12]).toBeCloseTo(1, 4);
    expect(sparkModel.worldMatrix[13]).toBeCloseTo(2, 4);
  });
});
