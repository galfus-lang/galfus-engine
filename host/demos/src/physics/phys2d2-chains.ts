import { type EntityId, isKey, presetsAnchor } from '@galfus/engine';
import { attachPhysics2D } from '@galfus/physics-2d';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const SVG_TELEMETRY_HUD = `
<svg width="360" height="90" viewBox="0 0 360 90" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="356" height="86" rx="10" fill="#0f172a" fill-opacity="0.88" stroke="#38bdf8" stroke-width="2"/>
  <text x="16" y="28" font-family="monospace" font-size="14" font-weight="bold" fill="#f8fafc">PHYS2D-2: CHAINS, ROPES &amp; SPRINGS</text>
  <text id="vel-text" x="16" y="52" font-family="monospace" font-size="12" fill="#38bdf8">TIP SPEED: 0.00 m/s</text>
  <text x="16" y="74" font-family="monospace" font-size="11" fill="#94a3b8">[SPACE]: IMPULSE BURST | [ESC]: QUIT</text>
</svg>
`;

export async function runDemoPhys2d2(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Phys2D-2 2D Physical Chains, Ropes & Springs',
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
      { orthoScale: 18.0, near: -100, far: 100, cameraSlot: 1, active: true },
      { position: [0, 0] }
    );

    const matBg = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.1, 0.12, 0.16, 1.0]
    });
    const matPivot = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.85, 0.88, 0.94, 1.0]
    });
    const matChain = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [1.0, 0.72, 0.2, 1.0]
    });
    const matRope = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.28, 0.58, 1.0]
    });
    const matSpring = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.2, 0.92, 0.55, 1.0]
    });

    realm2d.createSprite(
      { dimensions: [32.0, 22.0], materialId: matBg, castShadow: false, receiveShadow: true },
      { position: [0, 0], zLayer: -10 }
    );

    realm2d.createLight(
      {
        color: [1.0, 0.95, 0.85],
        intensity: 1.8,
        range: 40.0,
        lightRadius: 0.4,
        castShadow: false,
        active: true
      },
      { position: [0, 4.0], zLayer: 2 }
    );

    const chainPivot = realm2d.createShape(
      { kind: 'rectangle', size: [0.7, 0.7], materialId: matPivot },
      { position: [0, 5.5], zLayer: 1 }
    );
    physics.addRigidBody(chainPivot, { type: 'fixed' });

    const chainLinks: EntityId[] = [chainPivot];
    for (let i = 1; i <= 6; i++) {
      const link = realm2d.createShape(
        { kind: 'circle', radius: 0.36, segments: 24, materialId: matChain },
        { position: [i * 0.95, 5.5 - i * 0.35], zLayer: 1 }
      );
      realm2d.addCollider(link, { type: 'circle', radius: 0.36 });
      physics.addRigidBody(link, {
        type: 'dynamic',
        mass: 1.0,
        linearDamping: 0.1,
        angularDamping: 0.1
      });
      chainLinks.push(link);
    }
    realm2d.hierarchy.attachChain(chainLinks, {
      length: 1.02,
      strategy: 'chain'
    });
    const chainTip = chainLinks[chainLinks.length - 1]!;

    const ropePivot = realm2d.createShape(
      { kind: 'rectangle', size: [0.7, 0.7], materialId: matPivot },
      { position: [-5.5, 5.5], zLayer: 1 }
    );
    physics.addRigidBody(ropePivot, { type: 'fixed' });

    const ropeOrb = realm2d.createShape(
      { kind: 'circle', radius: 0.65, segments: 28, materialId: matRope },
      { position: [-8.0, 4.5], zLayer: 1 }
    );
    realm2d.addCollider(ropeOrb, { type: 'circle', radius: 0.65 });
    physics.addRigidBody(ropeOrb, { type: 'dynamic', mass: 1.8, linearDamping: 0.08 });
    realm2d.hierarchy.attach(ropeOrb, ropePivot, presetsAnchor.rope({ maxLength: 3.2 }));

    const springPivot = realm2d.createShape(
      { kind: 'rectangle', size: [0.7, 0.7], materialId: matPivot },
      { position: [5.5, 5.5], zLayer: 1 }
    );
    physics.addRigidBody(springPivot, { type: 'fixed' });

    const springBox = realm2d.createShape(
      { kind: 'rectangle', size: [1.3, 1.3], materialId: matSpring },
      { position: [5.5, 1.2], zLayer: 1 }
    );
    realm2d.addCollider(springBox, { type: 'rectangle', halfExtents: [0.65, 0.65] });
    physics.addRigidBody(springBox, { type: 'dynamic', mass: 1.5, linearDamping: 0.15 });
    realm2d.hierarchy.attach(
      springBox,
      springPivot,
      presetsAnchor.spring({ restLength: 2.5, stiffness: 48, damping: 2.8 })
    );

    const hudSvg = realm2d.createSvg(
      { source: SVG_TELEMETRY_HUD, dimensions: [7.2, 1.8] },
      { position: [0, -6.8], zLayer: 10 }
    );

    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.06, 0.09, 1.0]
    });
    realm2d.flush();

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed' && isKey(ev, 'space', ' ')) {
        physics.applyImpulse(chainTip, [14.0, 6.0]);
        physics.applyImpulse(ropeOrb, [16.0, 8.0]);
        physics.applyImpulse(springBox, [0.0, -14.0]);
      }
    });

    let frame = 0;
    runtime.on('tick', () => {
      frame++;
      if (frame % 4 === 0) {
        const v = physics.getLinearVelocity(chainTip) ?? [0, 0];
        const speed = Math.hypot(v[0], v[1]);
        realm2d.setSvgText(hudSvg, 'vel-text', `TIP SPEED: ${speed.toFixed(2)} m/s`);
      }
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoPhys2d2();
}
