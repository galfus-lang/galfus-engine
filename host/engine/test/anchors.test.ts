import { describe, expect, it } from 'bun:test';
import { EcsWorld } from '../src/ecs/index';
import { AnchorSolveSystem, createAnchor, type AnchorStrategy3D } from '../src/anchors/index';
import { mat4, vec3 } from '../src/math/index';
import { createModel2D } from '../src/realm2d/components';
import { createModel3D } from '../src/realm3d/components';

function makeModel2D(id: number, pos?: [number, number]) {
  const m = createModel2D(id);
  if (pos) m.setPosition(pos[0], pos[1]);
  return m;
}

function makeModel3D(id: number, pos?: [number, number, number]) {
  const m = createModel3D(id);
  if (pos) m.setPosition(pos[0], pos[1], pos[2]);
  return m;
}

describe('@galfus/engine > Anchors', () => {
  it('reuses pre-allocated Float32Array buffers in AnchorMatrixCache without reallocations', () => {
    const solver = new AnchorSolveSystem();
    const world = new EcsWorld();
    const e1 = world.createEntity();

    world.attachComponent(e1, makeModel2D(1, [10, 20]));

    // Run solver on frame 1
    solver.solve(world, { time: 0, dt: 0.016, frameId: 1 });
    const buf1 = solver.cache.getWorld2D(e1);
    expect(buf1).toBeDefined();

    // Run solver on frame 2
    solver.solve(world, { time: 0.016, dt: 0.016, frameId: 2 });
    const buf2 = solver.cache.getWorld2D(e1);

    // EXACT same buffer reference in memory (no GC allocation)
    expect(buf1).toBe(buf2);
  });

  it('2D: resolves parent-child anchor transformation correctly', () => {
    const solver = new AnchorSolveSystem();
    const world = new EcsWorld();

    const parent = world.createEntity();
    const child = world.createEntity();

    world.attachComponent(parent, makeModel2D(1, [100, 200]));
    world.attachComponent(child, makeModel2D(2, [10, 20]));
    world.attachComponent(child, createAnchor({ targetEntityId: parent }));

    solver.solve(world, { time: 0, dt: 0.016, frameId: 1 });

    const childWorld = solver.cache.getWorld2D(child);
    expect(childWorld).toBeDefined();
    // tx = 100 + 10 = 110, ty = 200 + 20 = 220
    expect(childWorld![4]).toBeCloseTo(110);
    expect(childWorld![5]).toBeCloseTo(220);
  });

  it('3D: resolves chained 3D anchors correctly', () => {
    const solver = new AnchorSolveSystem();
    const world = new EcsWorld();

    const root = world.createEntity();
    const nodeA = world.createEntity();
    const nodeB = world.createEntity();

    world.attachComponent(root, makeModel3D(1, [10, 0, 0]));
    world.attachComponent(nodeA, makeModel3D(2, [0, 20, 0]));
    world.attachComponent(nodeA, createAnchor({ targetEntityId: root }));

    world.attachComponent(nodeB, makeModel3D(3, [0, 0, 30]));
    world.attachComponent(nodeB, createAnchor({ targetEntityId: nodeA }));

    solver.solve(world, { time: 0, dt: 0.016, frameId: 1 });

    const worldB = solver.cache.getWorld3D(nodeB);
    expect(worldB).toBeDefined();

    const trans = vec3.create();
    mat4.getTranslation(trans, worldB!);
    expect(trans[0]).toBeCloseTo(10);
    expect(trans[1]).toBeCloseTo(20);
    expect(trans[2]).toBeCloseTo(30);
  });

  it('handles cyclical dependencies gracefully with fallback and warnings', () => {
    const solver = new AnchorSolveSystem();
    const world = new EcsWorld();

    const a = world.createEntity();
    const b = world.createEntity();

    world.attachComponent(a, makeModel3D(1, [1, 0, 0]));
    world.attachComponent(b, makeModel3D(2, [0, 1, 0]));

    // A anchors to B, and B anchors to A (Cycle!)
    world.attachComponent(a, createAnchor({ targetEntityId: b }));
    world.attachComponent(b, createAnchor({ targetEntityId: a }));

    // Must not throw or infinite loop
    expect(() => {
      solver.solve(world, { time: 0, dt: 0.016, frameId: 1 });
    }).not.toThrow();

    expect(solver.cache.getWorld3D(a)).toBeDefined();
    expect(solver.cache.getWorld3D(b)).toBeDefined();
  });

  it('allows registering and executing custom anchor strategies', () => {
    const solver = new AnchorSolveSystem();
    const world = new EcsWorld();

    const customStrategy: AnchorStrategy3D = {
      name: 'double-offset',
      apply(targetWorld, local, outWorld) {
        // Multiplies parent * local and then translates an extra [100, 0, 0]
        mat4.multiply(outWorld, targetWorld, local);
        const extra = mat4.create();
        mat4.fromTranslation(extra, [100, 0, 0]);
        mat4.multiply(outWorld, outWorld, extra);
      }
    };
    solver.strategies.register3D(customStrategy);

    const parent = world.createEntity();
    const child = world.createEntity();

    world.attachComponent(parent, makeModel3D(1, [5, 0, 0]));
    world.attachComponent(child, makeModel3D(2, [2, 0, 0]));
    world.attachComponent(
      child,
      createAnchor({ targetEntityId: parent, strategy: 'double-offset' })
    );

    solver.solve(world, { time: 0, dt: 0.016, frameId: 1 });

    const childWorld = solver.cache.getWorld3D(child);
    expect(childWorld).toBeDefined();

    const trans = vec3.create();
    mat4.getTranslation(trans, childWorld!);
    // 5 + 2 + 100 = 107
    expect(trans[0]).toBeCloseTo(107);
  });

  it('HierarchyCoordinator: attaches, queries target/dependents, and detaches entities cleanly', () => {
    const world = new EcsWorld();
    const solver = new AnchorSolveSystem();
    const { HierarchyCoordinator } = require('../src/anchors/hierarchy');
    const hierarchy = new HierarchyCoordinator(world, '3d');

    const tank = { entityId: world.createEntity() };
    const turret = { entityId: world.createEntity() };
    const barrel = { entityId: world.createEntity() };

    world.attachComponent(tank.entityId, makeModel3D(1, [10, 0, 0]));
    world.attachComponent(turret.entityId, makeModel3D(2, [0, 2, 0]));
    world.attachComponent(barrel.entityId, makeModel3D(3, [0, 0, 5]));

    // Attach using object handles
    hierarchy.attach(turret, tank);
    hierarchy.attach(barrel, turret);

    expect(hierarchy.isAttached(turret)).toBe(true);
    expect(hierarchy.isAttached(barrel)).toBe(true);
    expect(hierarchy.getTarget(turret)).toBe(tank.entityId);
    expect(hierarchy.getTarget(barrel)).toBe(turret.entityId);
    expect(hierarchy.getDependents(tank)).toEqual([turret.entityId]);
    expect(hierarchy.getDependents(turret)).toEqual([barrel.entityId]);

    // Solve and verify world transforms
    solver.solve(world, { time: 0, dt: 0.016, frameId: 1 });
    const barrelWorld = solver.cache.getWorld3D(barrel.entityId);
    expect(barrelWorld).toBeDefined();

    const pos = vec3.create();
    mat4.getTranslation(pos, barrelWorld!);
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBeCloseTo(2);
    expect(pos[2]).toBeCloseTo(5);

    // Detach barrel
    hierarchy.detach(barrel);
    expect(hierarchy.isAttached(barrel)).toBe(false);
    expect(hierarchy.getDependents(turret)).toEqual([]);
  });

  it('HierarchyCoordinator: executes functional in-place callback using mat4.copyPosition and setTranslation', () => {
    const world = new EcsWorld();
    const solver = new AnchorSolveSystem();
    const { HierarchyCoordinator } = require('../src/anchors/hierarchy');
    const hierarchy = new HierarchyCoordinator(world, '3d');

    const parent = world.createEntity();
    const child = world.createEntity();

    world.attachComponent(parent, makeModel3D(1, [50, 20, -10]));
    world.attachComponent(child, makeModel3D(2, [1, 2, 3]));

    // Custom functional constraint: copy position from parent and override Y to 999
    hierarchy.attach(child, parent, (targetWorld: any, local: any, outWorld: any) => {
      mat4.copy(outWorld, local);
      mat4.copyPosition(outWorld, targetWorld);
      mat4.setTranslation(outWorld, 50, 999, -10);
    });

    solver.solve(world, { time: 0, dt: 0.016, frameId: 1 });

    const childWorld = solver.cache.getWorld3D(child);
    expect(childWorld).toBeDefined();

    const pos = vec3.create();
    mat4.getTranslation(pos, childWorld!);
    expect(pos[0]).toBeCloseTo(50);
    expect(pos[1]).toBeCloseTo(999);
    expect(pos[2]).toBeCloseTo(-10);
  });
});
