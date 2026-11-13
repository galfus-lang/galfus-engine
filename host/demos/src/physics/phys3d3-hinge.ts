import {
  attachPhysics3D,
  type EntityId,
  isKey,
  type Model3DComponent,
  presetsAnchor,
  utils3D
} from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoPhys3d3(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Phys3D-3 3D Hinge Joints & Angular Limits',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    const physics = await attachPhysics3D(runtime, realm3d, {
      gravity: [0, -9.81, 0],
      interpolate: true
    });

    let camAngle = 0.35;
    let autoOrbit = true;
    const camDistance = 14.5;
    const camHeight = 6.2;
    const camTarget: [number, number, number] = [0, 2.5, 0];

    const camera = realm3d.createCamera(
      { fovY: 50, near: 0.1, far: 200, cameraSlot: 1 },
      {
        position: [Math.sin(camAngle) * camDistance, camHeight, Math.cos(camAngle) * camDistance],
        rotation: utils3D.quatFromLookAt(
          [Math.sin(camAngle) * camDistance, camHeight, Math.cos(camAngle) * camDistance],
          camTarget
        )
      }
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

    // Materials
    const floorMat = realm3d.createMaterial({
      baseColor: [0.15, 0.17, 0.22, 1.0],
      metallic: 0.2,
      roughness: 0.65
    }).materialId;
    const frameMat = realm3d.createMaterial({
      baseColor: [0.28, 0.3, 0.36, 1.0],
      metallic: 0.5,
      roughness: 0.35
    }).materialId;
    const doorLeftMat = realm3d.createMaterial({
      baseColor: [0.95, 0.52, 0.15, 1.0],
      metallic: 0.4,
      roughness: 0.3
    }).materialId;
    const doorRightMat = realm3d.createMaterial({
      baseColor: [0.18, 0.75, 0.95, 1.0],
      metallic: 0.4,
      roughness: 0.3
    }).materialId;
    const hatchMat = realm3d.createMaterial({
      baseColor: [0.85, 0.25, 0.55, 1.0],
      metallic: 0.6,
      roughness: 0.25
    }).materialId;
    const ballMat = realm3d.createMaterial({
      baseColor: [0.95, 0.85, 0.2, 1.0],
      metallic: 0.7,
      roughness: 0.2
    }).materialId;

    // Static Floor
    const ground = realm3d.createCube(1, floorMat, {
      position: [0, -0.5, 0],
      scale: [20, 1, 20]
    }).entityId;
    realm3d.addCollider(ground, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(ground, { type: 'fixed', friction: 0.6, restitution: 0.3 });

    // Saloon Door Frame Pillars
    const postLeft = realm3d.createCylinder(0.3, 4.0, 24, frameMat, {
      position: [-2.2, 2.0, 0]
    }).entityId;
    realm3d.addCollider(postLeft, { type: 'cylinder', radius: 0.3, halfHeight: 2.0 });
    physics.addRigidBody(postLeft, { type: 'fixed' });

    const postRight = realm3d.createCylinder(0.3, 4.0, 24, frameMat, {
      position: [2.2, 2.0, 0]
    }).entityId;
    realm3d.addCollider(postRight, { type: 'cylinder', radius: 0.3, halfHeight: 2.0 });
    physics.addRigidBody(postRight, { type: 'fixed' });

    // Top Beam
    const topBeam = realm3d.createCube(1, frameMat, {
      position: [0, 4.15, 0],
      scale: [4.7, 0.3, 0.6]
    }).entityId;
    realm3d.addCollider(topBeam, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(topBeam, { type: 'fixed' });

    // Left Saloon Door: width 1.8, height 2.6, depth 0.15
    const doorLeft = realm3d.createCube(1, doorLeftMat, {
      position: [-1.1, 2.0, 0],
      scale: [1.8, 2.6, 0.15]
    }).entityId;
    realm3d.addCollider(doorLeft, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(doorLeft, {
      type: 'dynamic',
      mass: 2.5,
      angularDamping: 1.2,
      linearDamping: 0.4
    });

    // Attach Left Door to postLeft with hinge around Y-axis, limits [-80°, 80°]
    realm3d.hierarchy.attach(
      doorLeft,
      postLeft,
      presetsAnchor.angularSpring({
        axis: [0, 1, 0],
        limits: [-1.4, 1.4], // -80° to +80°
        targetAngle: 0,
        stiffness: 40,
        damping: 5,
        localAnchorOrigin: [-0.9, 0, 0],
        localAnchorTarget: [0, 0, 0]
      })
    );

    // Right Saloon Door: width 1.8, height 2.6, depth 0.15
    const doorRight = realm3d.createCube(1, doorRightMat, {
      position: [1.1, 2.0, 0],
      scale: [1.8, 2.6, 0.15]
    }).entityId;
    realm3d.addCollider(doorRight, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(doorRight, {
      type: 'dynamic',
      mass: 2.5,
      angularDamping: 1.2,
      linearDamping: 0.4
    });

    // Attach Right Door to postRight with hinge around Y-axis, limits [-80°, 80°]
    realm3d.hierarchy.attach(
      doorRight,
      postRight,
      presetsAnchor.angularSpring({
        axis: [0, 1, 0],
        limits: [-1.4, 1.4], // -80° to +80°
        targetAngle: 0,
        stiffness: 40,
        damping: 5,
        localAnchorOrigin: [0.9, 0, 0],
        localAnchorTarget: [0, 0, 0]
      })
    );

    // Overhead Trapdoor Hatch Frame (at y = 5.0, z = -3.0)
    const hatchFrame = realm3d.createCube(1, frameMat, {
      position: [0, 5.0, -3.0],
      scale: [3.4, 0.2, 0.3]
    }).entityId;
    realm3d.addCollider(hatchFrame, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(hatchFrame, { type: 'fixed' });

    // Trapdoor Plate rotating around X-axis (pitch), limits [0, 90°]
    const hatch = realm3d.createCube(1, hatchMat, {
      position: [0, 5.0, -1.8],
      scale: [3.0, 0.15, 2.4]
    }).entityId;
    realm3d.addCollider(hatch, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(hatch, {
      type: 'dynamic',
      mass: 3.0,
      angularDamping: 1.5
    });

    realm3d.hierarchy.attach(
      hatch,
      hatchFrame,
      presetsAnchor.angularSpring({
        axis: [1, 0, 0], // X-axis horizontal hinge
        limits: [0, 1.57], // 0° (flat) to 90° (downwards drop)
        targetAngle: 0,
        stiffness: 35,
        damping: 4,
        localAnchorOrigin: [0, 0, -1.2],
        localAnchorTarget: [0, 0, 0]
      })
    );

    // Dynamic projectile / falling spheres
    const spawnedBalls: EntityId[] = [];
    const spawnBall = (x: number, y: number, z: number, vz = 0): void => {
      const radius = 0.55;
      const ball = realm3d.createSphere(radius, 16, 24, ballMat, {
        position: [x, y, z]
      }).entityId;
      realm3d.addCollider(ball, { type: 'sphere', radius });
      physics.addRigidBody(ball, {
        type: 'dynamic',
        mass: 3.5,
        restitution: 0.5,
        friction: 0.4,
        linearVelocity: [0, 0, vz]
      });
      spawnedBalls.push(ball);
      if (spawnedBalls.length > 15) {
        const old = spawnedBalls.shift();
        if (old) {
          physics.removeRigidBody(old);
          realm3d.world.destroyEntity(old);
        }
      }
    };

    // Initial sphere on top of the hatch
    spawnBall(0, 6.5, -1.8);

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'space')) {
        // Fire wrecking ball straight through the saloon doors
        spawnBall((Math.random() - 0.5) * 0.8, 2.0, 6.0, -12.0);
      } else if (isKey(ev, 'f')) {
        // Kick doors with torque impulse
        physics.applyTorqueImpulse(doorLeft, [0, -35.0, 0]);
        physics.applyTorqueImpulse(doorRight, [0, 35.0, 0]);
        physics.applyTorqueImpulse(hatch, [25.0, 0, 0]);
      } else if (isKey(ev, 'o')) {
        autoOrbit = !autoOrbit;
      }
    });

    runtime.on('tick', ({ dt }) => {
      if (autoOrbit) {
        camAngle += dt * 0.35;
        const cx = Math.sin(camAngle) * camDistance;
        const cz = Math.cos(camAngle) * camDistance;
        const camModel = realm3d.world.getComponent<Model3DComponent>(camera.entityId, 'Model3D');
        if (camModel) {
          camModel.setPosition(cx, camHeight, cz);
          realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });
        }
      }
    });

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });

    console.log(
      '[phys3d3] Ready. Space: launch ball | F: kick doors open | O: auto-orbit | Esc: exit.'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoPhys3d3();
}
