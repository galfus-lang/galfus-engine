import { describe, expect, test } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { createUi } from '@galfus/ui';
import { attachPhysics2D, attachPhysics3D, createRuntime, presetsAnchor } from '../src/index';

// Run after building and syncing the native Bun library: GALFUS_TEST_NATIVE_PHYSICS=1 bun test host/engine/test/physics_native.test.ts
const native = process.env.GALFUS_TEST_NATIVE_PHYSICS === '1' ? describe : describe.skip;

native('native physics integration', () => {
  test('forces last one step and unsupported interpolation fails explicitly', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      await expect(attachPhysics2D(runtime, realm, { interpolate: true })).rejects.toThrow(
        'Physics interpolation is not implemented.'
      );
      const physics = await attachPhysics2D(runtime, realm, { gravity: [0, 0] });
      const materialId = realm.createMaterial({ baseColor: [1, 1, 1, 1] });
      const body = realm.createShape({ kind: 'rectangle', size: [1, 1], materialId });
      realm.addCollider(body, { type: 'rectangle', halfExtents: [0.5, 0.5] });
      physics.addRigidBody(body, { mass: 1 });
      realm.flush();
      physics.applyForce(body, [10, 0]);
      physics.step(0.1);
      expect(physics.getLinearVelocity(body)[0]).toBeCloseTo(1, 4);
      physics.step(0.1);
      expect(physics.getLinearVelocity(body)[0]).toBeCloseTo(1, 4);
      physics.applyForce(body, [10, 0]);
      physics.step(0.1);
      expect(physics.getLinearVelocity(body)[0]).toBeCloseTo(2, 4);
    } finally {
      runtime.dispose();
    }
  });

  test('reattaching physics replaces its tick subscription and disposing unsubscribes', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    const listeners = new Set<(event: { fixedDt: number }) => void>();
    const ticks = {
      on: (_: string, listener: (event: { fixedDt: number }) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    const realm = runtime.createRealm2D();
    const physics = await attachPhysics2D(ticks, realm);
    expect(await attachPhysics2D(ticks, realm)).toBe(physics);
    expect(listeners.size).toBe(1);
    realm.reset();
    expect(listeners.size).toBe(1);
    realm.dispose();
    expect(listeners.size).toBe(0);
    runtime.dispose();
  });

  test('scaled UI retains the visible click area', () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const root = createUi(runtime).createRoot(realm, {
        width: 100,
        height: 100,
        scale: [0.1, 0.1]
      });
      realm.flush();
      expect(realm.queryPoint([4, 0]).some((hit: any) => hit.entityId === root.entityId)).toBe(
        true
      );
      root.resizeViewport(100, 100);
      realm.flush();
      expect(realm.queryPoint([4, 0]).some((hit: any) => hit.entityId === root.entityId)).toBe(
        true
      );
    } finally {
      runtime.dispose();
    }
  });

  test('queries preserve collider matrices, plane geometry and host entity IDs', () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const materialId = realm.createMaterial({ baseColor: [1, 1, 1, 1] });
      const entity = realm.createShape({ kind: 'rectangle', size: [1, 1], materialId });
      const colliderId = realm.addCollider(
        entity,
        { type: 'rectangle', halfExtents: [2, 0.5] },
        {
          matrix: [0, 1, -1, 0, 3, 0],
          sensor: true
        }
      );
      realm.flush();
      const hit = realm.queryPoint([3, 1.5])[0];
      expect(hit).toMatchObject({ entityId: entity, colliderId, sensor: true, distance: 0 });
      expect(hit.modelId).toBeUndefined();
      expect(realm.queryPoint([4.5, 0])).toEqual([]);

      const realm3 = runtime.createRealm3D();
      const material = realm3.createMaterial({ baseColor: [1, 1, 1, 1] }).materialId;
      const entity3 = realm3.createCube(1, material).entityId;
      const collider3 = realm3.addCollider(
        entity3,
        { type: 'plane', halfExtents: [2, 1] },
        {
          matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1],
          sensor: true
        }
      );
      realm3.flush();
      const hit3 = realm3.raycast([3, 0, 2], [0, 0, -1], 4)[0];
      expect(hit3).toMatchObject({
        entityId: entity3,
        colliderId: collider3,
        sensor: true,
        distance: 2
      });
      expect(hit3.modelId).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });

  test('moving a fixed 2D model moves its physical body and reset clears physics state', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const physics = await attachPhysics2D(runtime, realm);
      const materialId = realm.createMaterial({ baseColor: [1, 1, 1, 1] });
      const floor = realm.createShape({ kind: 'rectangle', size: [20, 1], materialId });
      realm.addCollider(floor, { type: 'rectangle', halfExtents: [10, 0.5] });
      physics.addRigidBody(floor, { type: 'fixed' });
      realm.flush();
      realm.world.getComponent<any>(floor, 'Model2D')!.setPosition([0, 3]);
      realm.flush();
      const body = realm.createShape(
        { kind: 'rectangle', size: [1, 1], materialId },
        { position: [0, 8] }
      );
      realm.addCollider(body, { type: 'rectangle', halfExtents: [0.5, 0.5] });
      physics.addRigidBody(body, { mass: 1 });
      realm.flush();
      for (let i = 0; i < 180; i++) physics.step(1 / 60);
      expect(realm.world.getComponent<any>(body, 'Model2D')!.localMatrix[5]).toBeCloseTo(4, 1);
      realm.reset();
      expect(physics.hasRigidBody(body)).toBe(false);
      expect(await attachPhysics2D(runtime, realm)).toBe(physics);
    } finally {
      runtime.dispose();
    }
  });

  test('physics applies collider-local rotation, scale and translation', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const physics = await attachPhysics2D(runtime, realm);
      const materialId = realm.createMaterial({ baseColor: [1, 1, 1, 1] });
      const floor = realm.createShape({ kind: 'rectangle', size: [1, 1], materialId });
      realm.addCollider(
        floor,
        { type: 'rectangle', halfExtents: [1, 0.5] },
        {
          matrix: [0, 2, -1, 0, 3, 0]
        }
      );
      physics.addRigidBody(floor, { type: 'fixed' });
      const body = realm.createShape(
        { kind: 'rectangle', size: [1, 1], materialId },
        { position: [3, 6] }
      );
      realm.addCollider(body, { type: 'rectangle', halfExtents: [0.5, 0.5] });
      physics.addRigidBody(body, { mass: 1 });
      realm.flush();
      for (let i = 0; i < 180; i++) physics.step(1 / 60);
      expect(realm.world.getComponent<any>(body, 'Model2D')!.localMatrix[5]).toBeCloseTo(2.5, 1);
    } finally {
      runtime.dispose();
    }
  });

  test('3D physics applies collider-local rotation, scale and translation', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm3D();
      const physics = await attachPhysics3D(runtime, realm);
      const material = realm.createMaterial({ baseColor: [1, 1, 1, 1] }).materialId;
      const floor = realm.createCube(1, material).entityId;
      realm.addCollider(
        floor,
        { type: 'box', halfExtents: [1, 0.5, 0.5] },
        {
          matrix: [0, 2, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1]
        }
      );
      physics.addRigidBody(floor, { type: 'fixed' });
      const body = realm.createCube(1, material, { position: [3, 6, 0] }).entityId;
      realm.addCollider(body, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
      physics.addRigidBody(body, { mass: 1 });
      realm.flush();
      for (let i = 0; i < 180; i++) physics.step(1 / 60);
      expect(realm.world.getComponent<any>(body, 'Model3D')!.localMatrix[13]).toBeCloseTo(2.5, 1);
    } finally {
      runtime.dispose();
    }
  });

  test('2D bodies use model IDs, collide, reset and release joints', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const physics = await attachPhysics2D(runtime, realm);
      const materialId = realm.createMaterial({ baseColor: [1, 1, 1, 1] });
      const floor = realm.createShape(
        { kind: 'rectangle', size: [20, 1], materialId },
        { position: [0, 0] }
      );
      realm.addCollider(floor, { type: 'rectangle', halfExtents: [10, 0.5] });
      physics.addRigidBody(floor, { type: 'fixed' });
      const body = realm.createShape(
        { kind: 'rectangle', size: [1, 1], materialId },
        { position: [0, 4] }
      );
      realm.addCollider(body, { type: 'rectangle', halfExtents: [0.5, 0.5] });
      physics.addRigidBody(body, { mass: 1 });
      const model = realm.world.getComponent<any>(body, 'Model2D')!;
      expect(model.modelId).not.toBe(body);
      const contacts: Array<{ entityA: number; entityB: number }> = [];
      physics.on('collisionStart', (event) => contacts.push(event));
      realm.flush();
      for (let i = 0; i < 180; i++) physics.step(1 / 60);
      expect(
        contacts.some(
          (event) =>
            [event.entityA, event.entityB].includes(body) &&
            [event.entityA, event.entityB].includes(floor)
        )
      ).toBe(true);
      expect(model.localMatrix[5]).toBeCloseTo(1, 1);
      physics.setPosition(body, [0, 5]);
      physics.setLinearVelocity(body, [0, 0]);
      physics.applyImpulseAtPoint(body, [2, 0], [0, 6]);
      expect(Math.abs(physics.getAngularVelocity(body))).toBeGreaterThan(1);
      physics.setGravity([0, 0]);
      physics.step(1 / 60);
      expect(model.localMatrix[5]).toBeCloseTo(5, 1);
      expect(physics.hasRigidBody(body)).toBe(true);

      realm.destroyEntity(floor);
      realm.flush();
      const pivot = realm.createShape(
        { kind: 'circle', radius: 0.2, segments: 12, materialId },
        { position: [0, 4] }
      );
      physics.addRigidBody(pivot, { type: 'fixed' });
      physics.setPosition(body, [1, 4]);
      physics.setLinearVelocity(body, [0, 0]);
      physics.setAngularVelocity(body, 0);
      physics.setGravity([0, -9.81]);
      realm.hierarchy.attach(body, pivot, presetsAnchor.rope({ maxLength: 1.2 }));
      for (let i = 0; i < 180; i++) {
        physics.step(1 / 60);
        realm.flush();
      }
      expect(Math.hypot(model.worldMatrix[4], model.worldMatrix[5] - 4)).toBeLessThan(1.3);
      realm.hierarchy.attach(body, pivot, 'translation');
      realm.hierarchy.detach(body);
      for (let i = 0; i < 90; i++) {
        physics.step(1 / 60);
        realm.flush();
      }
      expect(model.worldMatrix[5]).toBeLessThan(0);
    } finally {
      runtime.dispose();
    }
  });

  test('3D collision preserves model scale', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm3D();
      const physics = await attachPhysics3D(runtime, realm);
      const material = realm.createMaterial({ baseColor: [1, 1, 1, 1] }).materialId;
      const floor = realm.createCube(1, material, {
        position: [0, -0.5, 0],
        scale: [20, 1, 20]
      }).entityId;
      realm.addCollider(floor, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
      physics.addRigidBody(floor, { type: 'fixed' });
      const body = realm.createCube(1, material, {
        position: [0, 4, 0],
        scale: [2, 2, 2]
      }).entityId;
      realm.addCollider(body, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
      physics.addRigidBody(body, { mass: 1 });
      realm.flush();
      for (let i = 0; i < 180; i++) {
        physics.step(1 / 60);
        realm.flush();
      }
      const model = realm.world.getComponent<any>(body, 'Model3D')!;
      expect(model.localMatrix[13]).toBeCloseTo(1, 1);
      expect(
        Math.hypot(model.localMatrix[0], model.localMatrix[1], model.localMatrix[2])
      ).toBeCloseTo(2, 1);
      realm.reset();
      expect(physics.hasRigidBody(body)).toBe(false);
      expect(await attachPhysics3D(runtime, realm)).toBe(physics);
    } finally {
      runtime.dispose();
    }
  });
  test('2D gate responds to an impulse away from its limit', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const physics = await attachPhysics2D(runtime, realm);
      const materialId = realm.createMaterial({ baseColor: [1, 1, 1, 1] });
      const post = realm.createShape(
        { kind: 'circle', radius: 0.45, segments: 24, materialId },
        { position: [-3.2, 0] }
      );
      physics.addRigidBody(post, { type: 'fixed' });
      const gate = realm.createSprite(
        { dimensions: [2.8, 0.45], materialId },
        { position: [-1.8, 0] }
      );
      realm.addCollider(gate, { type: 'rectangle', halfExtents: [1.4, 0.225] });
      physics.addRigidBody(gate, { mass: 1.2, angularDamping: 0.8, linearDamping: 0.2 });
      realm.hierarchy.attach(
        gate,
        post,
        presetsAnchor.angularSpring({
          limits: [-1.3, 0.5],
          targetAngle: 0,
          stiffness: 35,
          damping: 4,
          localAnchorOrigin: [-1.4, 0],
          localAnchorTarget: [0, 0]
        })
      );
      const rightPost = realm.createShape(
        { kind: 'circle', radius: 0.45, segments: 24, materialId },
        { position: [3.2, 0] }
      );
      physics.addRigidBody(rightPost, { type: 'fixed' });
      const rightGate = realm.createSprite(
        { dimensions: [2.8, 0.45], materialId },
        { position: [1.8, 0] }
      );
      realm.addCollider(rightGate, { type: 'rectangle', halfExtents: [1.4, 0.225] });
      physics.addRigidBody(rightGate, { mass: 1.2, angularDamping: 0.8, linearDamping: 0.2 });
      realm.hierarchy.attach(
        rightGate,
        rightPost,
        presetsAnchor.angularSpring({
          limits: [-0.5, 1.3],
          targetAngle: 0,
          stiffness: 35,
          damping: 4,
          localAnchorOrigin: [1.4, 0],
          localAnchorTarget: [0, 0]
        })
      );
      realm.flush();
      for (let i = 0; i < 60; i++) {
        physics.step(1 / 60);
        realm.flush();
      }
      const model = realm.world.getComponent<any>(gate, 'Model2D')!;
      const before = Math.atan2(model.localMatrix[1], model.localMatrix[0]);
      const rightModel = realm.world.getComponent<any>(rightGate, 'Model2D')!;
      const rightBefore = Math.atan2(rightModel.localMatrix[1], rightModel.localMatrix[0]);
      physics.applyTorqueImpulse(gate, 15);
      physics.applyTorqueImpulse(rightGate, -15);
      for (let i = 0; i < 6; i++) {
        physics.step(1 / 60);
        realm.flush();
      }
      expect(Math.atan2(model.localMatrix[1], model.localMatrix[0])).toBeGreaterThan(before + 0.2);
      expect(Math.atan2(rightModel.localMatrix[1], rightModel.localMatrix[0])).toBeLessThan(
        rightBefore - 0.2
      );
    } finally {
      runtime.dispose();
    }
  });

  test('3D joints disable connected collisions by default and honor explicit opt-in', async () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm3D();
      const physics = await attachPhysics3D(runtime, realm, { gravity: [0, 0, 0] });
      const material = realm.createMaterial({ baseColor: [1, 1, 1, 1] }).materialId;
      const createPair = (x: number, collideConnected?: boolean) => {
        const post = realm.createCube(1, material, { position: [x, 0, 0] }).entityId;
        realm.addCollider(post, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
        physics.addRigidBody(post, { type: 'fixed' });
        const door = realm.createCube(1, material, { position: [x, 0, 0] }).entityId;
        realm.addCollider(door, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
        physics.addRigidBody(door, { type: 'dynamic', mass: 1 });
        realm.hierarchy.attach(door, post, presetsAnchor.angularSpring({ collideConnected }));
        return [post, door];
      };
      const disabled = createPair(-4);
      const enabled = createPair(4, true);
      const contacts: Array<{ entityA: number; entityB: number }> = [];
      physics.on('collisionStart', (event) => contacts.push(event));
      realm.flush();
      for (let i = 0; i < 4; i++) physics.step(1 / 60);
      const hasPair = (pair: number[]) =>
        contacts.some((event) => pair.includes(event.entityA) && pair.includes(event.entityB));
      expect(hasPair(disabled)).toBe(false);
      expect(hasPair(enabled)).toBe(true);
    } finally {
      runtime.dispose();
    }
  });
});
