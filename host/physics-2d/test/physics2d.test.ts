import { describe, expect, it } from 'bun:test';
import {
  type AnchorComponent,
  createRuntime,
  type Model2DComponent,
  presetsAnchor,
  Realm2D
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import {
  attachPhysics2D,
  initPhysics2D,
  type PhysicsCollisionEvent,
  RapierPhysicsWorld2D
} from '../src/index';

describe('@galfus/physics-2d (Rapier 2D Integration & Anchor Joint Handoff)', () => {
  it('simulates 2D gravity, rectangle/circle/polygon collisions, and emits collisionStart', async () => {
    await initPhysics2D();
    const realm = new Realm2D(1);
    const physics = new RapierPhysicsWorld2D(realm, { gravity: [0, -9.81] });

    const floor = realm.createSpatialNode({ position: [0, 0] });
    realm.addCollider(floor, { type: 'rectangle', halfExtents: [10, 0.5] });
    physics.addRigidBody(floor, { type: 'fixed' });

    const crate = realm.createSpatialNode({ position: [0, 3] });
    realm.addCollider(crate, {
      type: 'polygon',
      vertices: [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5]
      ]
    });
    physics.addRigidBody(crate, { type: 'dynamic', mass: 1, restitution: 0.0 });

    const collisions: PhysicsCollisionEvent[] = [];
    physics.on('collisionStart', (ev) => collisions.push(ev));

    for (let i = 0; i < 90; i++) {
      physics.step(1 / 60);
    }

    const crateModel = realm.world.getComponent<Model2DComponent>(crate, 'Model2D')!;
    expect(crateModel.localMatrix[5]).toBeGreaterThan(0.8);
    expect(crateModel.localMatrix[5]).toBeLessThan(1.3);
    expect(collisions.length).toBeGreaterThanOrEqual(1);

    physics.dispose();
  });

  it('adopts 2D chain and rope Anchors as Rapier 2D ImpulseJoints with managedByPhysics=true', async () => {
    await initPhysics2D();
    const realm = new Realm2D(1);
    const physics = new RapierPhysicsWorld2D(realm, { gravity: [0, -9.81] });

    const root = realm.createSpatialNode({ position: [0, 10] });
    const link1 = realm.createSpatialNode({ position: [0, 8] });
    const link2 = realm.createSpatialNode({ position: [0, 6] });

    realm.hierarchy.attachChain([root, link1, link2], {
      length: 2,
      strategy: 'rope'
    });

    physics.addRigidBody(root, { type: 'fixed' });
    physics.addRigidBody(link1, { type: 'dynamic', mass: 1, linearDamping: 2 });
    physics.addRigidBody(link2, { type: 'dynamic', mass: 1, linearDamping: 2 });

    for (let i = 1; i <= 120; i++) {
      physics.step(1 / 60);
      realm.preRender({ time: i / 60, dt: 1 / 60, frameId: i });
    }

    const anchor1 = realm.world.getComponent<AnchorComponent>(link1, 'Anchor')!;
    const anchor2 = realm.world.getComponent<AnchorComponent>(link2, 'Anchor')!;
    expect(anchor1.managedByPhysics).toBe(true);
    expect(anchor2.managedByPhysics).toBe(true);

    const m1 = realm.world.getComponent<Model2DComponent>(link1, 'Model2D')!;
    const m2 = realm.world.getComponent<Model2DComponent>(link2, 'Model2D')!;

    expect(m1.worldMatrix[5]).toBeGreaterThan(7.7);
    expect(m1.worldMatrix[5]).toBeLessThan(8.3);
    expect(m2.worldMatrix[5]).toBeGreaterThan(5.6);
    expect(m2.worldMatrix[5]).toBeLessThan(6.4);

    // Detaching link2 releases managedByPhysics
    realm.hierarchy.detach(link2);
    physics.step(1 / 60);
    expect(realm.world.hasComponent(link2, 'Anchor')).toBe(false);

    physics.dispose();
  });

  it('attaches to MultiverseRuntime and supports 2D spring joint + interpolation', async () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport, { fixedDt: 1 / 60 });
    const realm = runtime.createRealm2D(202);
    const physics = await attachPhysics2D(runtime, realm, {
      gravity: [0, -9.81],
      interpolate: true
    });

    const ceiling = realm.createSpatialNode({ position: [0, 10] });
    const bob = realm.createSpatialNode({ position: [0, 5] });
    realm.hierarchy.attach(
      bob,
      ceiling,
      presetsAnchor.spring({ restLength: 3, stiffness: 150, damping: 15 })
    );

    physics.addRigidBody(ceiling, { type: 'fixed' });
    physics.addRigidBody(bob, { type: 'dynamic', mass: 1, linearDamping: 1 });

    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60);
    }

    const bobModel = realm.world.getComponent<Model2DComponent>(bob, 'Model2D')!;
    // With gravity -9.81 and stiffness 150, equilibrium is slightly below y = 7
    expect(bobModel.localMatrix[5]).toBeGreaterThan(6.0);
    expect(bobModel.localMatrix[5]).toBeLessThan(7.5);

    physics.dispose();
    runtime.dispose();
  });

  it('supports 2D hinge joints with angular limits', async () => {
    await initPhysics2D();
    const realm = new Realm2D(1);
    const physics = new RapierPhysicsWorld2D(realm, { gravity: [0, -9.81] });

    const post = realm.createSpatialNode({ position: [0, 0] });
    const arm = realm.createSpatialNode({ position: [2, 0] });

    realm.hierarchy.attach(arm, post, {
      strategy: 'hinge',
      params: {
        limits: [-0.5, 0.5],
        localAnchorTarget: [0, 0],
        localAnchorOrigin: [-2, 0]
      }
    });

    physics.addRigidBody(post, { type: 'fixed' });
    physics.addRigidBody(arm, { type: 'dynamic', mass: 1 });

    for (let i = 1; i <= 60; i++) {
      physics.step(1 / 60);
      realm.preRender({ time: i / 60, dt: 1 / 60, frameId: i });
    }

    const anchor = realm.world.getComponent<AnchorComponent>(arm, 'Anchor')!;
    expect(anchor.managedByPhysics).toBe(true);

    const mArm = realm.world.getComponent<Model2DComponent>(arm, 'Model2D')!;
    const rot = Math.atan2(mArm.worldMatrix[1]!, mArm.worldMatrix[0]!);
    expect(rot).toBeGreaterThanOrEqual(-0.55);
    expect(rot).toBeLessThanOrEqual(0.55);

    physics.dispose();
  });

  it('supports 2D angularSpring with torsional motor restoring targetAngle', async () => {
    await initPhysics2D();
    const realm = new Realm2D(1);
    const physics = new RapierPhysicsWorld2D(realm, { gravity: [0, 0] });

    const post = realm.createSpatialNode({ position: [0, 0] });
    const arm = realm.createSpatialNode({ position: [2, 0] });

    realm.hierarchy.attach(
      arm,
      post,
      presetsAnchor.angularSpring({
        targetAngle: 0,
        stiffness: 150,
        damping: 25,
        localAnchorTarget: [0, 0],
        localAnchorOrigin: [-2, 0]
      })
    );

    physics.addRigidBody(post, { type: 'fixed' });
    physics.addRigidBody(arm, { type: 'dynamic', mass: 1 });

    physics.step(1 / 60);
    physics.applyTorqueImpulse(arm, 20.0);

    for (let i = 1; i <= 150; i++) {
      physics.step(1 / 60);
      realm.preRender({ time: i / 60, dt: 1 / 60, frameId: i });
    }

    const anchor = realm.world.getComponent<AnchorComponent>(arm, 'Anchor')!;
    expect(anchor.managedByPhysics).toBe(true);

    const mArm = realm.world.getComponent<Model2DComponent>(arm, 'Model2D')!;
    const rot = Math.atan2(mArm.worldMatrix[1]!, mArm.worldMatrix[0]!);
    expect(Math.abs(rot)).toBeLessThan(0.05);

    physics.dispose();
  });
});
