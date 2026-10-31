/**
 * Test suite verifying Phases F09 and F10:
 * - F09: Anchor graph origin/target terminology, O(1) reverse index, cycle prevention, and world-transform preservation upon target loss.
 * - F10: Incremental topological solver, pure translation strategy, observable anchor mutations, and SpatialDirtyFlags propagation.
 */
import { describe, expect, it } from 'bun:test';
import { EcsWorld } from '../src/ecs/world';
import { mat4, quat, vec3 } from '../src/math/index';
import { HierarchyCoordinator } from '../src/anchors/hierarchy';
import { AnchorSolveSystem } from '../src/anchors/solver';
import {
  setAnchorDistance,
  setAnchorStrategy,
  type AnchorComponent
} from '../src/anchors/component';
import { createModel3D, Model3DComponent } from '../src/realm3d/components';
import { createModel2D, Model2DComponent } from '../src/realm2d/components';
import { SpatialDirtyFlags } from '../src/spatial/flags';

describe('Phase F09 & F10 — Anchor Graph, Reverse Lookup & Incremental Solver', () => {
  describe('F09: Origin/Target Terminology & O(1) Reverse Index', () => {
    it('manages origin/target relationships and queries dependents in O(1) time', () => {
      const world = new EcsWorld();
      const hierarchy = new HierarchyCoordinator(world, '3d');

      const sun = world.createEntity();
      const earth = world.createEntity();
      const moon = world.createEntity();

      world.attachComponent(sun, createModel3D(1));
      world.attachComponent(earth, createModel3D(2));
      world.attachComponent(moon, createModel3D(3));

      hierarchy.attach(earth, sun);
      hierarchy.attach(moon, earth);

      expect(hierarchy.getTarget(earth)).toBe(sun);
      expect(hierarchy.getTarget(moon)).toBe(earth);
      expect(hierarchy.isAttached(earth)).toBe(true);
      expect(hierarchy.isAttached(moon)).toBe(true);

      const sunDependents = hierarchy.getDependents(sun);
      expect(sunDependents).toEqual([earth]);

      const earthDependents = hierarchy.getDependents(earth);
      expect(earthDependents).toEqual([moon]);
    });

    it('prohibits self-anchoring and proactively rejects cyclical connections', () => {
      const world = new EcsWorld();
      const hierarchy = new HierarchyCoordinator(world, '3d');

      const a = world.createEntity();
      const b = world.createEntity();
      const c = world.createEntity();

      world.attachComponent(a, createModel3D(1));
      world.attachComponent(b, createModel3D(2));
      world.attachComponent(c, createModel3D(3));

      // Self-anchoring rejected
      expect(() => hierarchy.attach(a, a)).toThrow(/cannot anchor to itself/);

      // Direct cycle: A -> B then B -> A
      hierarchy.attach(b, a);
      expect(() => hierarchy.attach(a, b)).toThrow(/Anchor cycle detected/);

      // Multi-hop cycle: A -> B -> C then C -> A
      hierarchy.detach(b);
      hierarchy.attach(b, a);
      hierarchy.attach(c, b);
      expect(() => hierarchy.attach(a, c)).toThrow(/Anchor cycle detected/);
    });

    it('preserves worldMatrix into localMatrix when detaching an origin (HOST-020 acceptance)', () => {
      const world = new EcsWorld();
      const hierarchy = new HierarchyCoordinator(world, '3d');
      const solver = new AnchorSolveSystem();

      const target = world.createEntity();
      const origin = world.createEntity();

      const targetModel = createModel3D(1);
      targetModel.setPosition(100, 50, 0);
      world.attachComponent(target, targetModel);

      const originModel = createModel3D(2);
      originModel.setPosition(10, 0, 0);
      world.attachComponent(origin, originModel);

      hierarchy.attach(origin, target);
      solver.solve(world, { time: 0, dt: 0.016, frameId: 1, engine: null as any });

      // Before detach: origin's resolved worldMatrix X is 110 (100 + 10)
      expect(originModel.worldMatrix[12]).toBeCloseTo(110);
      expect(originModel.localMatrix[12]).toBeCloseTo(10);

      // Detach with world preservation
      hierarchy.detach(origin, true);
      expect(hierarchy.isAttached(origin)).toBe(false);

      // After detach: origin's localMatrix now holds 110, preserving its pose in world space
      expect(originModel.localMatrix[12]).toBeCloseTo(110);
      expect((originModel.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(true);

      // Subsequent solve maintains world position without target
      solver.solve(world, { time: 0, dt: 0.016, frameId: 2, engine: null as any });
      expect(originModel.worldMatrix[12]).toBeCloseTo(110);
    });

    it('safely detaches dependents and preserves transforms when target is destroyed', () => {
      const world = new EcsWorld();
      const hierarchy = new HierarchyCoordinator(world, '2d');
      const solver = new AnchorSolveSystem();

      const target = world.createEntity();
      const origin = world.createEntity();

      const targetModel = createModel2D(10);
      targetModel.setPosition(200, 300);
      world.attachComponent(target, targetModel);

      const originModel = createModel2D(20);
      originModel.setPosition(5, 10);
      world.attachComponent(origin, originModel);

      hierarchy.attach(origin, target);
      solver.solve(world, { time: 0, dt: 0.016, frameId: 1, engine: null as any });

      expect(originModel.worldMatrix[4]).toBeCloseTo(205);
      expect(originModel.worldMatrix[5]).toBeCloseTo(310);

      // Simulate target destruction
      hierarchy.handleTargetDestroyed(target);
      world.destroyEntity(target);

      expect(hierarchy.isAttached(origin)).toBe(false);
      expect(originModel.localMatrix[4]).toBeCloseTo(205);
      expect(originModel.localMatrix[5]).toBeCloseTo(310);
    });
  });

  describe('F10: Translation Strategy & Incremental Solving', () => {
    it('pure translation strategy 3D inherits target position without inheriting rotation or scale', () => {
      const world = new EcsWorld();
      const hierarchy = new HierarchyCoordinator(world, '3d');
      const solver = new AnchorSolveSystem();

      const parent = world.createEntity();
      const child = world.createEntity();

      const parentModel = createModel3D(1);
      // Parent is rotated 90 degrees around Z and translated to (50, 0, 0)
      const q = quat.create();
      quat.setAxisAngle(q, [0, 0, 1], Math.PI / 2);
      mat4.fromRotationTranslationScale(parentModel.localMatrix, q, [50, 0, 0], [1, 1, 1]);
      parentModel.markLocalDirty();
      world.attachComponent(parent, parentModel);

      const childModel = createModel3D(2);
      childModel.setPosition(0, 10, 0);
      world.attachComponent(child, childModel);

      // Attach with pure 'translation' strategy
      hierarchy.attach(child, parent, 'translation');
      solver.solve(world, { time: 0, dt: 0.016, frameId: 1, engine: null as any });

      // Child world X should be parent.X (50) + child.local.X (0) = 50
      // Child world Y should be parent.Y (0) + child.local.Y (10) = 10
      expect(childModel.worldMatrix[12]).toBeCloseTo(50);
      expect(childModel.worldMatrix[13]).toBeCloseTo(10);

      // Child orientation is NOT rotated (child's rot[1] should be 0, while parent's has sin(pi/4))
      expect(childModel.worldMatrix[0]).toBeCloseTo(1); // identity orientation X basis
      expect(childModel.worldMatrix[5]).toBeCloseTo(1); // identity orientation Y basis
    });

    it('pure translation strategy 2D inherits target position only', () => {
      const world = new EcsWorld();
      const hierarchy = new HierarchyCoordinator(world, '2d');
      const solver = new AnchorSolveSystem();

      const parent = world.createEntity();
      const child = world.createEntity();

      const parentModel = createModel2D(1);
      parentModel.setPosition(100, 200);
      world.attachComponent(parent, parentModel);

      const childModel = createModel2D(2);
      childModel.setPosition(15, 25);
      world.attachComponent(child, childModel);

      hierarchy.attach(child, parent, 'translation');
      solver.solve(world, { time: 0, dt: 0.016, frameId: 1, engine: null as any });

      expect(childModel.worldMatrix[4]).toBeCloseTo(115);
      expect(childModel.worldMatrix[5]).toBeCloseTo(225);
    });

    it('observable anchor parameter changes invalidate origin spatial flags immediately', () => {
      const world = new EcsWorld();
      const hierarchy = new HierarchyCoordinator(world, '3d');

      const parent = world.createEntity();
      const child = world.createEntity();

      world.attachComponent(parent, createModel3D(1));
      const childModel = createModel3D(2);
      world.attachComponent(child, childModel);

      hierarchy.attach(child, parent);

      // Clean flags
      childModel.flags = SpatialDirtyFlags.Clean;
      expect((childModel.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(false);

      // Mutate anchor distance
      setAnchorDistance(world, child, 15);
      expect((childModel.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(true);

      // Clean flags
      childModel.flags = SpatialDirtyFlags.Clean;
      setAnchorStrategy(world, child, 'translation');
      expect((childModel.flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(true);
    });

    it('incremental solving skips calculations on static hierarchies and propagates dirty when target changes', () => {
      const world = new EcsWorld();
      const hierarchy = new HierarchyCoordinator(world, '3d');
      const solver = new AnchorSolveSystem();

      const root = world.createEntity();
      const branch = world.createEntity();
      const leaf = world.createEntity();

      const rootModel = createModel3D(1);
      rootModel.setPosition(10, 0, 0);
      world.attachComponent(root, rootModel);

      const branchModel = createModel3D(2);
      branchModel.setPosition(5, 0, 0);
      world.attachComponent(branch, branchModel);

      const leafModel = createModel3D(3);
      leafModel.setPosition(2, 0, 0);
      world.attachComponent(leaf, leafModel);

      hierarchy.attach(branch, root);
      hierarchy.attach(leaf, branch);

      // Frame 1: resolve all
      solver.solve(world, { time: 0, dt: 0.016, frameId: 1, engine: null as any });
      expect(leafModel.worldMatrix[12]).toBeCloseTo(17); // 10 + 5 + 2

      // Simulate Sync clearing WorldDirty
      rootModel.flags = SpatialDirtyFlags.Clean;
      branchModel.flags = SpatialDirtyFlags.Clean;
      leafModel.flags = SpatialDirtyFlags.Clean;

      // Frame 2: Static scene - solver runs without any local dirty
      solver.solve(world, { time: 0.016, dt: 0.016, frameId: 2, engine: null as any });
      // Flags remain Clean (zero dirty writes!)
      expect(rootModel.flags).toBe(SpatialDirtyFlags.Clean);
      expect(branchModel.flags).toBe(SpatialDirtyFlags.Clean);
      expect(leafModel.flags).toBe(SpatialDirtyFlags.Clean);

      // Frame 3: Move root by +10 (from 10 to 20)
      rootModel.setPosition(20, 0, 0); // triggers LocalDirty on root
      solver.solve(world, { time: 0.032, dt: 0.016, frameId: 3, engine: null as any });

      // Root, branch, and leaf all receive updated world matrices and WorldDirty flags
      expect(rootModel.worldMatrix[12]).toBeCloseTo(20);
      expect(branchModel.worldMatrix[12]).toBeCloseTo(25);
      expect(leafModel.worldMatrix[12]).toBeCloseTo(27); // 20 + 5 + 2

      expect((rootModel.flags & SpatialDirtyFlags.WorldDirty) !== 0).toBe(true);
      expect((branchModel.flags & SpatialDirtyFlags.WorldDirty) !== 0).toBe(true);
      expect((leafModel.flags & SpatialDirtyFlags.WorldDirty) !== 0).toBe(true);
    });
  });
});
