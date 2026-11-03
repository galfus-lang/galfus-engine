import { describe, expect, it } from 'bun:test';
import {
  type AnchorComponent,
  createRuntime,
  type Model3DComponent,
  presetsAnchor,
  Realm3D
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import {
  attachPhysics3D,
  initPhysics3D,
  type PhysicsCollisionEvent,
  RapierPhysicsWorld3D
} from '../src/index';

describe('@galfus/physics-3d (Rapier 3D Integration & Anchor Joint Handoff)', () => {
  it('simulates gravity, box/sphere collisions, and emits collisionStart events', async () => {
    await initPhysics3D();
    const realm = new Realm3D(1);
    const physics = new RapierPhysicsWorld3D(realm, { gravity: [0, -9.81, 0] });

    const floor = realm.createSpatialNode({ position: [0, 0, 0] });
    realm.addCollider(floor, { type: 'box', halfExtents: [10, 0.5, 10] });
    physics.addRigidBody(floor, { type: 'fixed' });

    const ball = realm.createSpatialNode({ position: [0, 3, 0] });
    realm.addCollider(ball, { type: 'sphere', radius: 0.5 });
    physics.addRigidBody(ball, { type: 'dynamic', mass: 1, restitution: 0.1 });

    const collisions: PhysicsCollisionEvent[] = [];
    physics.on('collisionStart', (ev) => collisions.push(ev));

    for (let i = 0; i < 90; i++) {
      physics.step(1 / 60);
    }

    const ballModel = realm.world.getComponent<Model3DComponent>(ball, 'Model3D')!;
    // Ball (radius 0.5) rests on top of floor (top surface at y = 0.5) -> y ≈ 1.0
    expect(ballModel.localMatrix[13]).toBeGreaterThan(0.8);
    expect(ballModel.localMatrix[13]).toBeLessThan(1.3);
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(collisions[0]!.sensor).toBe(false);

    physics.dispose();
  });

  it('emits sensorEnter and sensorExit when a dynamic body passes through a sensor', async () => {
    await initPhysics3D();
    const realm = new Realm3D(1);
    const physics = new RapierPhysicsWorld3D(realm, { gravity: [0, 0, 0] });

    const zone = realm.createSpatialNode({ position: [0, 0, 0] });
    realm.addCollider(zone, { type: 'box', halfExtents: [1, 1, 1] }, { sensor: true });
    physics.addRigidBody(zone, { type: 'fixed' });

    const mover = realm.createSpatialNode({ position: [-3, 0, 0] });
    realm.addCollider(mover, { type: 'sphere', radius: 0.4 });
    physics.addRigidBody(mover, { type: 'dynamic', linearVelocity: [6, 0, 0] });

    const events: string[] = [];
    physics.on('sensorEnter', () => events.push('enter'));
    physics.on('sensorExit', () => events.push('exit'));

    for (let i = 0; i < 90; i++) {
      physics.step(1 / 60);
    }

    expect(events).toContain('enter');
    expect(events).toContain('exit');

    physics.dispose();
  });

  it('applies forces, impulses, and torque impulses immediately after addRigidBody', async () => {
    await initPhysics3D();
    const realm = new Realm3D(1);
    const physics = new RapierPhysicsWorld3D(realm, { gravity: [0, 0, 0] });

    const body = realm.createSpatialNode({ position: [0, 0, 0] });
    physics.addRigidBody(body, { type: 'dynamic', mass: 2 });

    physics.applyImpulse(body, [10, 0, 0]);
    physics.applyTorqueImpulse(body, [0, 4, 0]);
    physics.step(1 / 60);

    const vel = physics.getLinearVelocity(body)!;
    const angVel = physics.getAngularVelocity(body)!;
    expect(vel[0]).toBeCloseTo(5, 2);
    expect(angVel[1]).toBeGreaterThan(1);

    physics.dispose();
  });

  it('adopts rope, chain, and spring Anchors as Rapier ImpulseJoints with managedByPhysics=true and updates visual children', async () => {
    await initPhysics3D();
    const realm = new Realm3D(1);
    const physics = new RapierPhysicsWorld3D(realm, { gravity: [0, -9.81, 0] });

    const ceiling = realm.createSpatialNode({ position: [0, 10, 0] });
    const weight = realm.createSpatialNode({ position: [0, 9, 0] });
    const spark = realm.createSpatialNode({ position: [0, -0.5, 0] });

    // Attach weight to ceiling via rope (maxLength: 3)
    realm.hierarchy.attach(weight, ceiling, {
      strategy: presetsAnchor.rope({ maxLength: 3 })
    });
    // Attach visual child (spark) to weight without RigidBody
    realm.hierarchy.attach(spark, weight, {
      strategy: presetsAnchor.static()
    });

    physics.addRigidBody(ceiling, { type: 'fixed' });
    physics.addRigidBody(weight, { type: 'dynamic', mass: 1, linearDamping: 2.0 });

    const weightAnchor = realm.world.getComponent<AnchorComponent>(weight, 'Anchor')!;
    expect(weightAnchor.managedByPhysics).toBe(false);

    for (let i = 1; i <= 120; i++) {
      physics.step(1 / 60);
      realm.preRender({ time: i / 60, dt: 1 / 60, frameId: i });
    }

    // JointSync3D automatically sets managedByPhysics = true
    expect(weightAnchor.managedByPhysics).toBe(true);

    const weightModel = realm.world.getComponent<Model3DComponent>(weight, 'Model3D')!;
    const sparkModel = realm.world.getComponent<Model3DComponent>(spark, 'Model3D')!;

    // Rope constrains weight at ~3m below ceiling (y ≈ 7)
    expect(weightModel.worldMatrix[13]).toBeGreaterThan(6.7);
    expect(weightModel.worldMatrix[13]).toBeLessThan(7.3);
    // Visual child spark is 0.5m below weight (y ≈ 6.5)
    expect(sparkModel.worldMatrix[13]).toBeCloseTo(weightModel.worldMatrix[13] - 0.5, 3);

    // Removing RigidBody3D restores managedByPhysics = false
    physics.removeRigidBody(weight);
    expect(weightAnchor.managedByPhysics).toBe(false);

    physics.dispose();
  });

  it('integrates with MultiverseRuntime fixedTick and interpolates visual transforms on tick', async () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport, { fixedDt: 0.02 });
    const realm = runtime.createRealm3D();
    const physics = await attachPhysics3D(runtime, realm, {
      gravity: [0, 0, 0],
      interpolate: true
    });

    const mover = realm.createSpatialNode({ position: [0, 0, 0] });
    physics.addRigidBody(mover, { type: 'dynamic', linearVelocity: [10, 0, 0] });

    physics.step(0.02);
    const moverModel = realm.world.getComponent<Model3DComponent>(mover, 'Model3D')!;
    expect(moverModel.localMatrix[12]).toBeCloseTo(0.2, 4);

    // Interpolate halfway between prev (0.0) and curr (0.2)
    physics.interpolate(0.5);
    expect(moverModel.localMatrix[12]).toBeCloseTo(0.1, 4);

    physics.dispose();
    runtime.dispose();
  });
});
