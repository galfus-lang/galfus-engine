import {
  attachPhysics3D,
  isKey,
  mat4,
  type Model3DComponent,
  quat,
  utils3D,
  vec3
} from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoPhys3d4(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Phys3D-4 Forces, Torques & Off-Center Impulses',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    const physics = await attachPhysics3D(runtime, realm3d, {
      gravity: [0, -9.81, 0],
      interpolate: true
    });

    let camAngle = 0.45;
    let autoOrbit = true;
    const camDistance = 16.0;
    const camHeight = 7.5;
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
      ambientColor: [0.15, 0.18, 0.25, 0.35],
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
      baseColor: [0.14, 0.16, 0.22, 1.0],
      metallic: 0.2,
      roughness: 0.7
    }).materialId;
    const postMat = realm3d.createMaterial({
      baseColor: [0.28, 0.32, 0.4, 1.0],
      metallic: 0.5,
      roughness: 0.35
    }).materialId;
    const rotorMat = realm3d.createMaterial({
      baseColor: [0.95, 0.45, 0.15, 1.0],
      metallic: 0.7,
      roughness: 0.25
    }).materialId;
    const droneMat = realm3d.createMaterial({
      baseColor: [0.2, 0.75, 0.95, 1.0],
      metallic: 0.6,
      roughness: 0.3
    }).materialId;
    const monolithMat = realm3d.createMaterial({
      baseColor: [0.92, 0.25, 0.55, 1.0],
      metallic: 0.5,
      roughness: 0.3
    }).materialId;

    // Static Ground
    const ground = realm3d.createCube(1, floorMat, {
      position: [0, -0.5, 0],
      scale: [24, 1, 24]
    }).entityId;
    realm3d.addCollider(ground, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(ground, { type: 'fixed', friction: 0.6, restitution: 0.3 });

    // 1. Central Turbine Column (Fixed Base)
    const turbineBase = realm3d.createCylinder(0.4, 3.0, 24, postMat, {
      position: [-4.0, 1.5, 0]
    }).entityId;
    realm3d.addCollider(turbineBase, { type: 'cylinder', radius: 0.4, halfHeight: 1.5 });
    physics.addRigidBody(turbineBase, { type: 'fixed' });

    // Turbine Rotor Blades (driven by continuous torque around Y)
    const turbineRotor = realm3d.createCube(1, rotorMat, {
      position: [-4.0, 3.2, 0],
      scale: [5.2, 0.25, 0.6]
    }).entityId;
    realm3d.addCollider(turbineRotor, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(turbineRotor, {
      type: 'dynamic',
      mass: 2.0,
      angularDamping: 0.6,
      lockTranslations: true,
      enabledRotations: [false, true, false]
    });

    // 2. Hover Drone Craft (driven by continuous forceAtPoint on left wing)
    const drone = realm3d.createCube(1, droneMat, {
      position: [3.5, 2.0, 0],
      scale: [3.6, 0.3, 1.8]
    }).entityId;
    realm3d.addCollider(drone, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(drone, {
      type: 'dynamic',
      mass: 3.0,
      linearDamping: 0.5,
      angularDamping: 1.0,
      restitution: 0.2
    });

    // 3. Tall Tumbler Monolith (demonstrates off-center corner impulse)
    const monolith = realm3d.createCube(1, monolithMat, {
      position: [0, 2.5, 4.0],
      scale: [1.2, 5.0, 1.2]
    }).entityId;
    realm3d.addCollider(monolith, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
    physics.addRigidBody(monolith, {
      type: 'dynamic',
      mass: 4.0,
      linearDamping: 0.1,
      angularDamping: 0.2,
      restitution: 0.4,
      friction: 0.5
    });

    let continuousTorque = true;
    let thrusterActive = false;

    const scratchPoint3D = vec3.create();
    const scratchRot = quat.create();
    const scratchForce3D = vec3.create();

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;

      if (isKey(ev, 't', 'KeyT')) {
        continuousTorque = !continuousTorque;
        console.log(
          `[phys3d4] Turbine Torque: ${continuousTorque ? 'ON (applying 40 N·m)' : 'OFF (coasting)'}`
        );
      } else if (isKey(ev, 'f', 'KeyF')) {
        thrusterActive = !thrusterActive;
        console.log(
          `[phys3d4] Wing Thruster: ${thrusterActive ? 'ACTIVE (lifting & banking)' : 'OFF'}`
        );
      } else if (isKey(ev, 'space', ' ')) {
        // Off-center impulse applied at the top corner of the monolith
        physics.applyImpulseAtPoint(monolith, [-6.0, 8.0, -12.0], [0.6, 4.8, 4.6]);
        console.log('[phys3d4] Monolith top-corner impulse triggered!');
      } else if (isKey(ev, 'r', 'KeyR')) {
        // Reset monolith and drone positions and orientations
        const mModel = realm3d.world.getComponent<Model3DComponent>(monolith, 'Model3D');
        mModel?.setRotation(0, 0, 0, 1);
        physics.setPosition(monolith, [0, 2.5, 4.0]);
        physics.setLinearVelocity(monolith, [0, 0, 0]);
        physics.setAngularVelocity(monolith, [0, 0, 0]);

        const dModel = realm3d.world.getComponent<Model3DComponent>(drone, 'Model3D');
        dModel?.setRotation(0, 0, 0, 1);
        physics.setPosition(drone, [3.5, 2.0, 0]);
        physics.setLinearVelocity(drone, [0, 0, 0]);
        physics.setAngularVelocity(drone, [0, 0, 0]);

        console.log('[phys3d4] Simulation objects reset.');
      } else if (isKey(ev, 'o', 'KeyO')) {
        autoOrbit = !autoOrbit;
        console.log(`[phys3d4] Camera Auto-Orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
      }
    });

    runtime.on('fixedTick', () => {
      if (continuousTorque) {
        // Continuous torque spinning the turbine around Y axis
        physics.applyTorque(turbineRotor, [0, 40.0, 0]);
      }
      if (thrusterActive) {
        const dModel = realm3d.world.getComponent<Model3DComponent>(drone, 'Model3D');
        if (dModel) {
          // Transform local wing tip [-1.6, 0.0, 0.0] dynamically to current world coordinates
          vec3.transformMat4(scratchPoint3D, [-1.6, 0.0, 0.0], dModel.localMatrix);

          // Local thrust vector: upward lift along the craft's local up vector [0, 36.0, -3.0]
          mat4.getRotation(scratchRot, dModel.localMatrix);
          vec3.transformQuat(scratchForce3D, [0, 36.0, -3.0], scratchRot);

          physics.applyForceAtPoint(
            drone,
            [scratchForce3D[0], scratchForce3D[1], scratchForce3D[2]],
            [scratchPoint3D[0], scratchPoint3D[1], scratchPoint3D[2]]
          );
        }
      }
    });

    runtime.on('tick', ({ dt }) => {
      if (autoOrbit) {
        camAngle += dt * 0.25;
        const cx = Math.sin(camAngle) * camDistance;
        const cz = Math.cos(camAngle) * camDistance;
        const camModel = realm3d.world.getComponent<Model3DComponent>(camera.entityId, 'Model3D');
        if (camModel) {
          camModel.setPosition(cx, camHeight, cz);
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
      '[phys3d4] Ready. [T]: toggle torque | [F]: toggle wing thruster | [Space]: corner impulse | [R]: reset | [O]: auto-orbit | [Esc]: exit.'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoPhys3d4();
}
