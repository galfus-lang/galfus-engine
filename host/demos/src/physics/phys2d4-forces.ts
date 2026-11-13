import { attachPhysics2D, isKey, mat2d, type Model2DComponent, vec2 } from '@galfus/engine';
import { UiRoot } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemoPhys2d4(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Phys2D-4 Forces, Torques & Point Impulses',
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

    const matBg = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.08, 0.1, 0.15, 1.0]
    });
    const matWall = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.2, 0.24, 0.32, 1.0]
    });
    const matRotor = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.45, 0.15, 1.0]
    });
    const matPivot = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.85, 0.88, 0.95, 1.0]
    });
    const matCrate = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.25, 0.75, 0.95, 1.0]
    });
    const matTarget = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.25, 0.65, 1.0]
    });

    // Background plane
    realm2d.createSprite(
      { dimensions: [36.0, 26.0], materialId: matBg, castShadow: false, receiveShadow: true },
      { position: [0, 0], zLayer: -10 }
    );

    // Arena walls (floor, left, right, ceiling)
    const walls: Array<{ pos: [number, number]; size: [number, number] }> = [
      { pos: [0, -9.5], size: [28.0, 1.0] },
      { pos: [0, 9.5], size: [28.0, 1.0] },
      { pos: [-13.5, 0], size: [1.0, 20.0] },
      { pos: [13.5, 0], size: [1.0, 20.0] }
    ];

    for (const w of walls) {
      const wallEnt = realm2d.createSprite(
        { dimensions: w.size, materialId: matWall, castShadow: true, receiveShadow: true },
        { position: w.pos, zLayer: 1 }
      );
      realm2d.addCollider(wallEnt, {
        type: 'rectangle',
        halfExtents: [w.size[0] * 0.5, w.size[1] * 0.5]
      });
      physics.addRigidBody(wallEnt, { type: 'fixed', friction: 0.6, restitution: 0.3 });
    }

    // Central Spinning Rotor (driven by continuous torque)
    const rotorPivot = realm2d.createShape(
      { kind: 'circle', radius: 0.5, segments: 24, materialId: matPivot },
      { position: [-3.5, 0], zLayer: 3 }
    );
    physics.addRigidBody(rotorPivot, { type: 'fixed' });

    const rotorBlade = realm2d.createSprite(
      { dimensions: [5.0, 0.45], materialId: matRotor },
      { position: [-3.5, 0], zLayer: 2 }
    );
    realm2d.addCollider(rotorBlade, { type: 'rectangle', halfExtents: [2.5, 0.225] });
    physics.addRigidBody(rotorBlade, {
      type: 'dynamic',
      mass: 1.5,
      angularDamping: 0.3,
      lockTranslations: true
    });

    // Dynamic Rocket Crate (driven by point forces)
    const crate = realm2d.createSprite(
      { dimensions: [2.2, 2.2], materialId: matCrate },
      { position: [4.0, -7.0], zLayer: 2 }
    );
    realm2d.addCollider(crate, { type: 'rectangle', halfExtents: [1.1, 1.1] });
    physics.addRigidBody(crate, {
      type: 'dynamic',
      mass: 2.0,
      linearDamping: 0.2,
      angularDamping: 0.5,
      friction: 0.4,
      restitution: 0.4
    });

    // Tumbler Baton (demonstrates off-center impulse creating both linear & angular motion)
    const baton = realm2d.createSprite(
      { dimensions: [3.4, 0.5], materialId: matTarget },
      { position: [4.0, 3.0], zLayer: 2 }
    );
    realm2d.addCollider(baton, { type: 'rectangle', halfExtents: [1.7, 0.25] });
    physics.addRigidBody(baton, {
      type: 'dynamic',
      mass: 1.2,
      linearDamping: 0.1,
      angularDamping: 0.2,
      restitution: 0.6
    });

    // Soft light
    realm2d.createLight(
      {
        color: [1.0, 0.95, 0.85],
        intensity: 2.0,
        range: 40.0,
        lightRadius: 0.4,
        castShadow: false,
        active: true
      },
      { position: [0, 4.0], zLayer: 2 }
    );

    // Telemetry UI HUD
    const uiRoot = new UiRoot(runtime, realm2d, {
      width: 400,
      height: 95,
      position: [0, 8.0],
      scale: [8.0 / 400, 1.9 / 95],
      zLayer: 10
    });
    uiRoot.rootPanel
      .setBackgroundColor([0.06, 0.09, 0.16, 0.92])
      .setBorderColor([0.22, 0.74, 0.97, 1.0])
      .setBorderWidth(2)
      .setBorderRadius(10);

    uiRoot.addText({
      text: 'PHYS2D-4: FORCES, TORQUES & POINT IMPULSES',
      fontSize: 13,
      color: [0.97, 0.98, 0.99, 1.0],
      x: 16,
      y: 18
    });

    const spinnerInfoText = uiRoot.addText({
      text: 'ROTOR ω: 0.00 rad/s | THRUSTER: OFF',
      fontSize: 11,
      color: [0.22, 0.74, 0.97, 1.0],
      x: 16,
      y: 38
    });

    const crateInfoText = uiRoot.addText({
      text: 'CRATE V: [0.00, 0.00] m/s | TORQUE: ON [T]',
      fontSize: 11,
      color: [0.65, 0.55, 0.98, 1.0],
      x: 16,
      y: 56
    });

    uiRoot.addText({
      text: '[T]: TORQUE | [F]: THRUSTER | [SPACE]: IMPULSE | [R]: RESET',
      fontSize: 10,
      color: [0.58, 0.64, 0.72, 1.0],
      x: 16,
      y: 76
    });

    let continuousTorque = true;
    let thrusterActive = false;

    const scratchPoint2D = vec2.create();

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;

      if (isKey(ev, 't', 'KeyT')) {
        continuousTorque = !continuousTorque;
        console.log(`[phys2d4] Rotor Torque: ${continuousTorque ? 'ON' : 'OFF'}`);
      } else if (isKey(ev, 'f', 'KeyF')) {
        thrusterActive = !thrusterActive;
        console.log(`[phys2d4] Rocket Crate Thruster: ${thrusterActive ? 'ACTIVE' : 'OFF'}`);
      } else if (isKey(ev, 'space', ' ')) {
        // Off-center impulse at the tip of the baton [1.5, 0] relative to world pos
        physics.applyImpulseAtPoint(baton, [-5.0, 14.0], [4.0 + 1.5, 3.0]);
        physics.applyImpulseAtPoint(crate, [4.0, 18.0], [4.0 - 0.9, -7.0]);
        console.log('[phys2d4] Point impulses applied to baton and crate.');
      } else if (isKey(ev, 'r', 'KeyR')) {
        // Reset positions and orientations
        const cModel = realm2d.world.getComponent<Model2DComponent>(crate, 'Model2D');
        cModel?.setRotation(0);
        physics.setPosition(crate, [4.0, -7.0]);
        physics.setLinearVelocity(crate, [0, 0]);
        physics.setAngularVelocity(crate, 0);

        const bModel = realm2d.world.getComponent<Model2DComponent>(baton, 'Model2D');
        bModel?.setRotation(0);
        physics.setPosition(baton, [4.0, 3.0]);
        physics.setLinearVelocity(baton, [0, 0]);
        physics.setAngularVelocity(baton, 0);

        physics.setAngularVelocity(rotorBlade, 0);
        console.log('[phys2d4] Simulation objects reset.');
      }
    });

    runtime.on('fixedTick', () => {
      if (continuousTorque) {
        physics.applyTorque(rotorBlade, 24.0);
      }
      if (thrusterActive) {
        const cModel = realm2d.world.getComponent<Model2DComponent>(crate, 'Model2D');
        if (cModel) {
          // Bottom-right corner at local [0.9, -0.9] transformed dynamically to world space
          vec2.transformMat2d(scratchPoint2D, [0.9, -0.9], cModel.localMatrix);

          // Local upward thrust [0, 42.0] rotated by crate angle
          const angle = mat2d.getRotation(cModel.localMatrix);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const fx = -sinA * 42.0;
          const fy = cosA * 42.0;

          physics.applyForceAtPoint(crate, [fx, fy], [scratchPoint2D[0], scratchPoint2D[1]]);
        }
      }
    });

    let frame = 0;
    runtime.on('tick', () => {
      frame++;
      if (frame % 6 === 0) {
        const w = physics.getAngularVelocity(rotorBlade) ?? 0;
        const vCrate = physics.getLinearVelocity(crate) ?? [0, 0];
        spinnerInfoText.setText(
          `ROTOR ω: ${w.toFixed(2)} rad/s | THRUSTER: ${thrusterActive ? 'ACTIVE [F]' : 'OFF [F]'}`
        );
        crateInfoText.setText(
          `CRATE V: [${vCrate[0].toFixed(2)}, ${vCrate[1].toFixed(2)}] m/s | TORQUE: ${continuousTorque ? 'ON [T]' : 'OFF [T]'}`
        );
      }
    });

    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.06, 0.09, 1.0]
    });

    console.log(
      '[phys2d4] Ready. [T]: toggle torque | [F]: toggle thruster | [Space]: point impulse | [R]: reset | [Esc]: exit.'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoPhys2d4();
}
