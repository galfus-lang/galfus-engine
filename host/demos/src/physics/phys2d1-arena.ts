import {
  attachPhysics2D,
  type EntityId,
  isKey,
  type Light2DComponent,
  type Model2DComponent
} from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoPhys2d1(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Phys2D-1 2D RigidBodies, Collisions & Polar Shadows',
    options,
    [1024, 768]
  );

  try {
    const realm2d = runtime.createRealm2D();
    const physics = await attachPhysics2D(runtime, realm2d, {
      gravity: [0, -9.81],
      interpolate: true
    });

    realm2d.createCamera(
      { orthoScale: 20.0, near: -100, far: 100, cameraSlot: 1, active: true },
      { position: [0, 0] }
    );

    const matFloor = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.42, 0.46, 0.54, 1.0]
    });
    const matBorder = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.2, 0.24, 0.32, 1.0]
    });
    const matBox = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.55, 0.18, 1.0]
    });
    const matBall = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.18, 0.85, 0.95, 1.0]
    });
    const matHex = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.92, 0.28, 0.62, 1.0]
    });
    const matSensor = realm2d.createMaterial({
      surfaceType: 'transparent',
      baseColor: [0.2, 0.95, 0.55, 0.25]
    });

    realm2d.createSprite(
      { dimensions: [32.0, 24.0], materialId: matFloor, castShadow: false, receiveShadow: true },
      { position: [0, 0], zLayer: -10 }
    );

    const walls: Array<{ pos: [number, number]; size: [number, number]; rot?: number }> = [
      { pos: [0, -8.5], size: [24.0, 1.0] },
      { pos: [0, 8.5], size: [24.0, 1.0] },
      { pos: [-11.5, 0], size: [1.0, 18.0] },
      { pos: [11.5, 0], size: [1.0, 18.0] },
      { pos: [-4.5, -2.5], size: [5.0, 0.6], rot: -0.28 },
      { pos: [4.5, 1.0], size: [5.0, 0.6], rot: 0.28 }
    ];
    for (const w of walls) {
      const entity = realm2d.createSprite(
        { dimensions: w.size, materialId: matBorder, castShadow: true, receiveShadow: true },
        { position: w.pos, rotation: w.rot ?? 0, zLayer: 1 }
      );
      realm2d.addCollider(entity, {
        type: 'rectangle',
        halfExtents: [w.size[0] * 0.5, w.size[1] * 0.5]
      });
      physics.addRigidBody(entity, { type: 'fixed', friction: 0.6, restitution: 0.4 });
    }

    const sensorEntity = realm2d.createShape(
      {
        kind: 'circle',
        radius: 2.0,
        segments: 32,
        materialId: matSensor,
        castShadow: false,
        receiveShadow: true
      },
      { position: [0, -5.8], zLayer: 0 }
    );
    realm2d.addCollider(sensorEntity, { type: 'circle', radius: 2.0 }, { sensor: true });
    physics.addRigidBody(sensorEntity, { type: 'fixed' });

    realm2d.setShadowConfig({ ambient: 0.22, lightRadius: 0.4, angularResolution: 1024 });

    const mainLight = realm2d.createLight(
      {
        color: [1.0, 0.9, 0.7],
        intensity: 2.2,
        range: 36.0,
        lightRadius: 0.4,
        castShadow: true,
        active: true
      },
      { position: [0, 5.5], zLayer: 2 }
    );
    const sensorLight = realm2d.createLight(
      {
        color: [0.2, 1.0, 0.6],
        intensity: 1.2,
        range: 18.0,
        lightRadius: 0.35,
        castShadow: false,
        active: true
      },
      { position: [0, -5.8], zLayer: 2 }
    );

    let sensorOverlapCount = 0;
    const syncSensorLight = () => {
      const lc = realm2d.world.getComponent<Light2DComponent>(sensorLight, 'Light2D');
      if (lc) {
        lc.desc = {
          color: sensorOverlapCount > 0 ? [1.0, 0.3, 0.7] : [0.2, 1.0, 0.6],
          intensity: sensorOverlapCount > 0 ? 2.6 : 1.2,
          range: 18.0,
          lightRadius: 0.35,
          castShadow: false,
          active: true
        };
        lc.isDirty = true;
      }
    };
    physics.on('sensorEnter', () => {
      sensorOverlapCount++;
      syncSensorLight();
    });
    physics.on('sensorExit', () => {
      sensorOverlapCount = Math.max(0, sensorOverlapCount - 1);
      syncSensorLight();
    });

    const hexR = 0.65;
    const hexVertices: [number, number][] = [
      [hexR, 0],
      [hexR * 0.5, hexR * 0.866],
      [-hexR * 0.5, hexR * 0.866],
      [-hexR, 0],
      [-hexR * 0.5, -hexR * 0.866],
      [hexR * 0.5, -hexR * 0.866]
    ];

    const dynamicEntities: Array<{ entityId: EntityId; initialPos: [number, number] }> = [];
    for (let i = 0; i < 15; i++) {
      const kindIdx = i % 3;
      const initialPos: [number, number] = [-6.0 + (i % 5) * 3.0, 3.0 + Math.floor(i / 5) * 1.6];

      if (kindIdx === 0) {
        const entityId = realm2d.createShape(
          {
            kind: 'rectangle',
            size: [1.1, 1.1],
            materialId: matBox,
            castShadow: true,
            receiveShadow: true
          },
          { position: initialPos, zLayer: 1 }
        );
        realm2d.addCollider(entityId, { type: 'rectangle', halfExtents: [0.55, 0.55] });
        physics.addRigidBody(entityId, {
          type: 'dynamic',
          mass: 1.2,
          restitution: 0.45,
          friction: 0.4
        });
        dynamicEntities.push({ entityId, initialPos });
      } else if (kindIdx === 1) {
        const entityId = realm2d.createShape(
          {
            kind: 'circle',
            radius: 0.58,
            segments: 24,
            materialId: matBall,
            castShadow: true,
            receiveShadow: true
          },
          { position: initialPos, zLayer: 1 }
        );
        realm2d.addCollider(entityId, { type: 'circle', radius: 0.58 });
        physics.addRigidBody(entityId, {
          type: 'dynamic',
          mass: 1.0,
          restitution: 0.72,
          friction: 0.25
        });
        dynamicEntities.push({ entityId, initialPos });
      } else {
        const entityId = realm2d.createShape(
          {
            kind: 'polygon',
            vertices: hexVertices,
            materialId: matHex,
            castShadow: true,
            receiveShadow: true
          },
          { position: initialPos, zLayer: 1 }
        );
        realm2d.addCollider(entityId, { type: 'polygon', vertices: hexVertices });
        physics.addRigidBody(entityId, {
          type: 'dynamic',
          mass: 1.1,
          restitution: 0.55,
          friction: 0.35
        });
        dynamicEntities.push({ entityId, initialPos });
      }
    }

    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.06, 0.09, 1.0]
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed') {
        if (isKey(ev, 'space', ' ')) {
          for (let i = 0; i < dynamicEntities.length; i++) {
            const b = dynamicEntities[i]!;
            const dir = (i % 2 === 0 ? 1 : -1) * (4.0 + (i % 4) * 1.5);
            physics.applyImpulse(b.entityId, [dir, 11.0]);
            physics.applyTorqueImpulse(b.entityId, dir * 0.6);
          }
        } else if (isKey(ev, 'r')) {
          for (const b of dynamicEntities) {
            realm2d.world
              .getComponent<Model2DComponent>(b.entityId, 'Model2D')
              ?.setTRS(b.initialPos, 0, [1, 1]);
            physics.setPosition(b.entityId, b.initialPos);
            physics.setLinearVelocity(b.entityId, [0, 0]);
            physics.setAngularVelocity(b.entityId, 0);
          }
        }
      }
    });

    let elapsed = 0;
    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      realm2d.world
        .getComponent<Model2DComponent>(mainLight, 'Model2D')
        ?.setPosition(Math.sin(elapsed * 0.7) * 6.5, 5.2 + Math.cos(elapsed * 1.1) * 1.5);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoPhys2d1();
}
