import { type EntityId, isKey, presetsAnchor } from '@galfus/engine';
import { attachPhysics2D } from '@galfus/physics-2d';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const SVG_HINGE_HUD = `
<svg width="380" height="90" viewBox="0 0 380 90" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="376" height="86" rx="10" fill="#0f172a" fill-opacity="0.9" stroke="#38bdf8" stroke-width="2"/>
  <text x="16" y="26" font-family="monospace" font-size="13" font-weight="bold" fill="#f8fafc">PHYS2D-3: 2D HINGE JOINTS &amp; LIMITS</text>
  <text id="gate-info" x="16" y="48" font-family="monospace" font-size="11" fill="#38bdf8">LEFT GATE: 0.0° | RIGHT GATE: 0.0°</text>
  <text x="16" y="70" font-family="monospace" font-size="10" fill="#94a3b8">[SPACE]: DROP BALLS | [F]: IMPULSE | [ESC]: EXIT</text>
</svg>
`;

export async function runDemoPhys2d3(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Phys2D-3 Hinge Joints & Angular Limits',
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
      baseColor: [0.1, 0.12, 0.17, 1.0]
    });
    const matWall = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.22, 0.26, 0.35, 1.0]
    });
    const matPost = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.85, 0.88, 0.95, 1.0]
    });
    const matGateLeft = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.55, 0.15, 1.0]
    });
    const matGateRight = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.2, 0.75, 0.95, 1.0]
    });
    const matBall = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.25, 0.6, 1.0]
    });

    // Background plane
    realm2d.createSprite(
      { dimensions: [36.0, 26.0], materialId: matBg, castShadow: false, receiveShadow: true },
      { position: [0, 0], zLayer: -10 }
    );

    // Arena walls (funnel and floor)
    const walls: Array<{ pos: [number, number]; size: [number, number]; rot?: number }> = [
      { pos: [0, -9.0], size: [28.0, 1.0] },
      { pos: [-13.5, 0], size: [1.0, 19.0] },
      { pos: [13.5, 0], size: [1.0, 19.0] },
      { pos: [-8.0, 4.0], size: [10.0, 0.8], rot: -0.45 },
      { pos: [8.0, 4.0], size: [10.0, 0.8], rot: 0.45 }
    ];

    for (const w of walls) {
      const wallEnt = realm2d.createSprite(
        { dimensions: w.size, materialId: matWall, castShadow: true, receiveShadow: true },
        { position: w.pos, rotation: w.rot ?? 0, zLayer: 1 }
      );
      realm2d.addCollider(wallEnt, {
        type: 'rectangle',
        halfExtents: [w.size[0] * 0.5, w.size[1] * 0.5]
      });
      physics.addRigidBody(wallEnt, { type: 'fixed', friction: 0.5, restitution: 0.3 });
    }

    // Left and Right Hinge Posts (fixed anchors)
    const postLeft = realm2d.createShape(
      { kind: 'circle', radius: 0.45, segments: 24, materialId: matPost, castShadow: true },
      { position: [-3.2, 0], zLayer: 3 }
    );
    physics.addRigidBody(postLeft, { type: 'fixed' });

    const postRight = realm2d.createShape(
      { kind: 'circle', radius: 0.45, segments: 24, materialId: matPost, castShadow: true },
      { position: [3.2, 0], zLayer: 3 }
    );
    physics.addRigidBody(postRight, { type: 'fixed' });

    // Left Swinging Gate (hinge with limit: [-75°, 30°])
    const gateLeft = realm2d.createSprite(
      { dimensions: [2.8, 0.45], materialId: matGateLeft, castShadow: true, receiveShadow: true },
      { position: [-1.8, 0], zLayer: 2 }
    );
    realm2d.addCollider(gateLeft, { type: 'rectangle', halfExtents: [1.4, 0.225] });
    physics.addRigidBody(gateLeft, {
      type: 'dynamic',
      mass: 1.2,
      angularDamping: 0.8,
      linearDamping: 0.2
    });

    realm2d.hierarchy.attach(
      gateLeft,
      postLeft,
      presetsAnchor.hinge({
        limits: [-1.3, 0.5], // -75° to +28°
        targetAngle: 0,
        stiffness: 35,
        damping: 4,
        localAnchorOrigin: [-1.4, 0],
        localAnchorTarget: [0, 0],
        collideConnected: false
      })
    );

    // Right Swinging Gate (hinge with limit: [-30°, 75°])
    const gateRight = realm2d.createSprite(
      { dimensions: [2.8, 0.45], materialId: matGateRight, castShadow: true, receiveShadow: true },
      { position: [1.8, 0], zLayer: 2 }
    );
    realm2d.addCollider(gateRight, { type: 'rectangle', halfExtents: [1.4, 0.225] });
    physics.addRigidBody(gateRight, {
      type: 'dynamic',
      mass: 1.2,
      angularDamping: 0.8,
      linearDamping: 0.2
    });

    realm2d.hierarchy.attach(
      gateRight,
      postRight,
      presetsAnchor.hinge({
        limits: [-0.5, 1.3], // -28° to +75°
        targetAngle: 0,
        stiffness: 35,
        damping: 4,
        localAnchorOrigin: [1.4, 0],
        localAnchorTarget: [0, 0],
        collideConnected: false
      })
    );

    // Soft light and shadow caster
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

    // Dynamic spawned balls
    const spawnedBalls: EntityId[] = [];
    const spawnBall = (x: number, y: number): void => {
      const radius = 0.4 + Math.random() * 0.2;
      const ball = realm2d.createShape(
        { kind: 'circle', radius, segments: 24, materialId: matBall, castShadow: true },
        { position: [x, y], zLayer: 2 }
      );
      realm2d.addCollider(ball, { type: 'circle', radius });
      physics.addRigidBody(ball, {
        type: 'dynamic',
        mass: 0.8,
        restitution: 0.6,
        friction: 0.3
      });
      spawnedBalls.push(ball);
      if (spawnedBalls.length > 20) {
        const old = spawnedBalls.shift();
        if (old) {
          physics.removeRigidBody(old);
          realm2d.world.destroyEntity(old);
        }
      }
    };

    // Initial balls
    for (let i = 0; i < 5; i++) {
      spawnBall((Math.random() - 0.5) * 4.0, 7.0 + i * 1.2);
    }

    // Telemetry SVG HUD
    const hudSvg = realm2d.createSvg(
      { source: SVG_HINGE_HUD, dimensions: [7.6, 1.8] },
      { position: [0, 7.8], zLayer: 10 }
    );

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'space')) {
        for (let i = 0; i < 3; i++) {
          spawnBall((Math.random() - 0.5) * 3.0, 8.0 + i * 0.8);
        }
      } else if (isKey(ev, 'f')) {
        // Kick gates open with torque impulse
        physics.applyTorqueImpulse(gateLeft, -15.0);
        physics.applyTorqueImpulse(gateRight, 15.0);
      }
    });

    let frame = 0;
    runtime.on('tick', () => {
      frame++;
      if (frame % 6 === 0) {
        const wLeft = physics.getAngularVelocity(gateLeft) ?? 0;
        const wRight = physics.getAngularVelocity(gateRight) ?? 0;
        realm2d.setSvgText(
          hudSvg,
          'gate-info',
          `LEFT ω: ${wLeft.toFixed(2)} rad/s | RIGHT ω: ${wRight.toFixed(2)} rad/s`
        );
      }
    });

    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.06, 0.09, 1.0]
    });

    console.log('[phys2d3] Ready. Space: drop balls | F: kick gates open | Esc: exit.');

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoPhys2d3();
}
