import {
  type EntityId,
  isKey,
  type Light3DComponent,
  type Model3DComponent,
  utils3D
} from '@galfus/engine';
import { attachPhysics3D } from '@galfus/physics-3d';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoPhys3d1(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Phys3D-1 RigidBodies, Colliders & Sensors',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    const physics = await attachPhysics3D(runtime, realm3d, {
      gravity: [0, -9.81, 0],
      interpolate: true
    });

    const camPos: [number, number, number] = [0, 8.5, 14.5];
    const camTarget: [number, number, number] = [0, 2.0, 0];
    const camera = realm3d.createCamera(
      { fovY: 50, near: 0.1, far: 200, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.16, 0.18, 0.25, 0.35],
      exposure: 1.15,
      ssao: { radius: 0.6, bias: 0.025, intensity: 1.35, power: 1.8 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.05, 0.1, 0.22, 1.0],
        horizonColor: [0.28, 0.48, 0.78, 1.0],
        groundColor: [0.06, 0.06, 0.08, 1.0],
        sunDirection: [0.4, 0.85, 0.35, 0.0],
        sunColor: [1.0, 0.95, 0.85, 2.8],
        intensity: 1.0
      }
    });

    const sunPos: [number, number, number] = [8, 18, 10];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.96, 0.88], intensity: 2.8, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );

    const floorMat = realm3d.createMaterial({
      baseColor: [0.15, 0.17, 0.22, 1.0],
      metallic: 0.2,
      roughness: 0.65
    }).materialId;
    const wallMat = realm3d.createMaterial({
      baseColor: [0.24, 0.28, 0.36, 1.0],
      metallic: 0.3,
      roughness: 0.5
    }).materialId;
    const sensorMat = realm3d.createMaterial({
      surfaceType: 'transparent',
      baseColor: [0.15, 0.9, 0.55, 0.28],
      metallic: 0.1,
      roughness: 0.2,
      emissiveColor: [0.05, 0.45, 0.25, 1.0]
    }).materialId;
    const cubeMat = realm3d.createMaterial({
      baseColor: [1.0, 0.55, 0.15, 1.0],
      metallic: 0.35,
      roughness: 0.3
    }).materialId;
    const sphereMat = realm3d.createMaterial({
      baseColor: [0.2, 0.8, 1.0, 1.0],
      metallic: 0.75,
      roughness: 0.18
    }).materialId;
    const cylMat = realm3d.createMaterial({
      baseColor: [0.95, 0.35, 0.75, 1.0],
      metallic: 0.4,
      roughness: 0.25
    }).materialId;

    const ground = realm3d.createCube(1, floorMat, {
      position: [0, -0.5, 0],
      scale: [16, 1, 16]
    }).entityId;
    realm3d.addCollider(ground, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(ground, { type: 'fixed', friction: 0.7, restitution: 0.3 });

    const wallSpecs: Array<{ pos: [number, number, number]; size: [number, number, number] }> = [
      { pos: [0, 1.0, -8.15], size: [16.6, 2.0, 0.3] },
      { pos: [0, 1.0, 8.15], size: [16.6, 2.0, 0.3] },
      { pos: [-8.15, 1.0, 0], size: [0.3, 2.0, 16.0] },
      { pos: [8.15, 1.0, 0], size: [0.3, 2.0, 16.0] }
    ];
    for (const w of wallSpecs) {
      const wall = realm3d.createCube(1, wallMat, {
        position: w.pos,
        scale: w.size
      }).entityId;
      realm3d.addCollider(wall, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
      physics.addRigidBody(wall, { type: 'fixed', friction: 0.5, restitution: 0.5 });
    }

    const sensorZone = realm3d.createCylinder(2.2, 1.6, 24, sensorMat, {
      position: [0, 0.8, 0]
    }).entityId;
    realm3d.addCollider(
      sensorZone,
      { type: 'cylinder', radius: 2.2, halfHeight: 0.8 },
      { sensor: true }
    );
    physics.addRigidBody(sensorZone, { type: 'fixed' });

    const sensorLight = realm3d.createLight(
      { kind: 'point', color: [0.15, 1.0, 0.55], intensity: 8.0, range: 10.0, castShadow: false },
      { position: [0, 2.2, 0] }
    );

    let activeInSensor = 0;
    const syncSensorLight = () => {
      const lc = realm3d.world.getComponent<Light3DComponent>(sensorLight, 'Light3D');
      if (lc) {
        lc.desc = {
          kind: 'point',
          color: activeInSensor > 0 ? [1.0, 0.25, 0.65] : [0.15, 1.0, 0.55],
          intensity: activeInSensor > 0 ? 22.0 : 8.0,
          range: 12.0,
          castShadow: false
        };
        lc.isDirty = true;
      }
    };

    physics.on('sensorEnter', () => {
      activeInSensor++;
      syncSensorLight();
    });
    physics.on('sensorExit', () => {
      activeInSensor = Math.max(0, activeInSensor - 1);
      syncSensorLight();
    });

    const dynamicBodies: Array<{ entityId: EntityId; initialPos: [number, number, number] }> = [];
    for (let i = 0; i < 15; i++) {
      const shapeKind = i % 3;
      const angle = (i / 15) * Math.PI * 2;
      const radius = 1.2 + (i % 3) * 1.1;
      const initialPos: [number, number, number] = [
        Math.cos(angle) * radius,
        3.5 + i * 0.9,
        Math.sin(angle) * radius
      ];

      if (shapeKind === 0) {
        const entityId = realm3d.createSphere(0.55, 20, 28, sphereMat, {
          position: initialPos
        }).entityId;
        realm3d.addCollider(entityId, { type: 'sphere', radius: 0.55 });
        physics.addRigidBody(entityId, {
          type: 'dynamic',
          mass: 1.2,
          restitution: 0.65,
          friction: 0.35
        });
        dynamicBodies.push({ entityId, initialPos });
      } else if (shapeKind === 1) {
        const entityId = realm3d.createCube(0.95, cubeMat, { position: initialPos }).entityId;
        realm3d.addCollider(entityId, { type: 'box', halfExtents: [0.475, 0.475, 0.475] });
        physics.addRigidBody(entityId, {
          type: 'dynamic',
          mass: 1.5,
          restitution: 0.35,
          friction: 0.55
        });
        dynamicBodies.push({ entityId, initialPos });
      } else {
        const entityId = realm3d.createCylinder(0.45, 1.0, 20, cylMat, {
          position: initialPos
        }).entityId;
        realm3d.addCollider(entityId, { type: 'cylinder', radius: 0.45, halfHeight: 0.5 });
        physics.addRigidBody(entityId, {
          type: 'dynamic',
          mass: 1.3,
          restitution: 0.4,
          friction: 0.45
        });
        dynamicBodies.push({ entityId, initialPos });
      }
    }

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed') {
        if (isKey(ev, 'space', ' ')) {
          for (let i = 0; i < dynamicBodies.length; i++) {
            const b = dynamicBodies[i]!;
            const angle = (i / dynamicBodies.length) * Math.PI * 2;
            physics.applyImpulse(b.entityId, [Math.cos(angle) * 5.5, 9.5, Math.sin(angle) * 5.5]);
            physics.applyTorqueImpulse(b.entityId, [
              Math.sin(angle) * 1.8,
              1.5,
              Math.cos(angle) * 1.8
            ]);
          }
        } else if (isKey(ev, 'r')) {
          for (const b of dynamicBodies) {
            realm3d.world
              .getComponent<Model3DComponent>(b.entityId, 'Model3D')
              ?.setTRS(b.initialPos, [0, 0, 0, 1], [1, 1, 1]);
            physics.setLinearVelocity(b.entityId, [0, 0, 0]);
            physics.setAngularVelocity(b.entityId, [0, 0, 0]);
          }
        }
      }
    });

    let elapsed = 0;
    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      const cx = Math.sin(elapsed * 0.25) * 14.5;
      const cz = Math.cos(elapsed * 0.25) * 14.5;
      realm3d.world
        .getComponent<Model3DComponent>(camera.entityId, 'Model3D')
        ?.setPosition(cx, 8.5, cz);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoPhys3d1();
}
