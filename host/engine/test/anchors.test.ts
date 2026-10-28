import { describe, expect, it } from 'bun:test';
import { EcsWorld } from '../src/ecs/index';
import {
  AnchorSolveSystem,
  createAnchor,
  createTransform2D,
  createTransform3D,
  type AnchorStrategy3D
} from '../src/anchors/index';
import { mat4, vec3 } from '../src/math/index';

describe('@galfus/engine > Anchors', () => {
  it('reuses pre-allocated Float32Array buffers in AnchorMatrixCache without reallocations', () => {
    const solver = new AnchorSolveSystem();
    const world = new EcsWorld();
    const e1 = world.createEntity();

    world.attachComponent(e1, createTransform2D({ position: [10, 20] }));

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

    world.attachComponent(parent, createTransform2D({ position: [100, 200] }));
    world.attachComponent(child, createTransform2D({ position: [10, 20] }));
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

    world.attachComponent(root, createTransform3D({ position: [10, 0, 0] }));
    world.attachComponent(nodeA, createTransform3D({ position: [0, 20, 0] }));
    world.attachComponent(nodeA, createAnchor({ targetEntityId: root }));

    world.attachComponent(nodeB, createTransform3D({ position: [0, 0, 30] }));
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

    world.attachComponent(a, createTransform3D({ position: [1, 0, 0] }));
    world.attachComponent(b, createTransform3D({ position: [0, 1, 0] }));

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

    world.attachComponent(parent, createTransform3D({ position: [5, 0, 0] }));
    world.attachComponent(child, createTransform3D({ position: [2, 0, 0] }));
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
});
