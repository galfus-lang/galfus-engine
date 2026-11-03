import { isKey, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const SVG_HUD = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 120" width="500" height="120">
  <rect x="0" y="0" width="500" height="120" rx="10" fill="#111827" fill-opacity="0.85" stroke="#374151" stroke-width="2"/>
  <text x="20" y="32" font-family="sans-serif" font-size="16" font-weight="bold" fill="#F9FAFB">Galfus Animation System</text>
  <text x="20" y="55" font-family="sans-serif" font-size="12" fill="#9CA3AF">[Space]: Retarget Position  |  [R]: Reset  |  [Esc]: Exit</text>
  <rect x="20" y="75" width="460" height="20" rx="4" fill="#1F2937"/>
  <rect id="progressBar" x="20" y="75" width="50" height="20" rx="4" fill="#3B82F6"/>
  <text id="progressText" x="250" y="90" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">0%</text>
</svg>
`;

export async function runDemoAnim1(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Anim-1 Transitions, Easing & Reactive SVG',
    options,
    [1024, 768]
  );

  try {
    const realm3d = runtime.createRealm3D();
    const realm2d = runtime.createRealm2D();

    const camPos: [number, number, number] = [0, 4.5, 10.5];
    realm3d.createCamera(
      { fovY: 60, near: 0.1, far: 1000, cameraSlot: 0 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, [0, 1.2, 0]) }
    );

    const lightPos: [number, number, number] = [10, 20, 10];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.95, 0.85], intensity: 2.5, castShadow: false },
      { position: lightPos, rotation: utils3D.quatFromLookAt(lightPos, [0, 0, 0]) }
    );

    realm3d.setEnvironment({
      ambientColor: [0.15, 0.18, 0.22, 1.0],
      exposure: 1.0,
      skybox: {
        mode: 'procedural',
        skyColor: [0.2, 0.35, 0.65, 1.0],
        horizonColor: [0.55, 0.65, 0.75, 1.0],
        groundColor: [0.05, 0.05, 0.08, 1.0],
        sunDirection: [0.6, 0.8, 0.3, 0.0],
        sunColor: [1.0, 0.95, 0.8, 2.0],
        intensity: 1.0
      }
    });

    const matBlue = realm3d.createMaterial({
      baseColor: [0.2, 0.6, 1.0, 1.0],
      roughness: 0.3,
      metallic: 0.1
    }).materialId;
    const matRed = realm3d.createMaterial({
      baseColor: [1.0, 0.3, 0.4, 1.0],
      roughness: 0.2,
      metallic: 0.8
    }).materialId;
    const matGreen = realm3d.createMaterial({
      baseColor: [0.3, 0.9, 0.4, 1.0],
      roughness: 0.4,
      metallic: 0.2
    }).materialId;
    const matFloor = realm3d.createMaterial({
      baseColor: [0.15, 0.15, 0.18, 1.0],
      roughness: 0.8,
      metallic: 0.1
    }).materialId;

    realm3d.createPlane(25, 25, matFloor, { position: [0, -0.75, 0] });
    const cube1 = realm3d.createCube(1.5, matBlue, { position: [-3.5, 0, 0] }).entityId;
    const sphere2 = realm3d.createSphere(1.0, 12, 24, matRed, {
      position: [0, 0.5, 0],
      scale: [0.8, 0.8, 0.8]
    }).entityId;
    const cube3 = realm3d.createCube(1.5, matGreen, { position: [3.5, 0, 0] }).entityId;

    realm2d.createCamera({ orthoScale: 768, cameraSlot: 0 }, { position: [0, 0] });
    const hudSvg = realm2d.createSvg({ source: SVG_HUD }, { position: [0, 270] });

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 0,
      zIndex: 0,
      clearColor: [0.06, 0.08, 0.12, 1.0]
    });
    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 0,
      zIndex: 1,
      clearColor: [0, 0, 0, 0]
    });

    realm3d.flush();
    realm2d.flush();

    realm3d.animateModel(
      cube1,
      { position: [-3.5, 4.0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      { duration: 1.6, delay: 0.2, easing: 'easeOutBounce', loopMode: 'pingPong' },
      runtime.animation
    );
    realm3d.animateModel(
      sphere2,
      { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1.6, 1.6, 1.6] },
      { duration: 1.2, delay: 0, easing: 'easeInOutCubic', loopMode: 'pingPong' },
      runtime.animation
    );
    realm3d.animateModel(
      cube3,
      { position: [3.5, 2.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      { duration: 1.4, delay: 0.1, easing: 'easeInOutSine', loopMode: 'pingPong' },
      runtime.animation
    );

    const barConfig = {
      duration: 2.0,
      delay: 0,
      easing: 'easeInOutQuad' as const,
      loopMode: 'pingPong' as const
    };
    const barWidthTransition = runtime.animation.createTransition(
      { type: 'scalar', value: 50 },
      barConfig,
      {
        kind: 'svgAttributeScalar',
        realmId: realm2d.realmId,
        svgId: hudSvg.svgId,
        elementId: 'progressBar',
        attribute: 'width'
      }
    );
    runtime.animation.transitionTo(barWidthTransition, { type: 'scalar', value: 460 }, barConfig);

    const barColorTransition = runtime.animation.createTransition(
      { type: 'vec4', value: [0.2, 0.5, 1.0, 1.0] },
      barConfig,
      {
        kind: 'svgAttributeColor',
        realmId: realm2d.realmId,
        svgId: hudSvg.svgId,
        elementId: 'progressBar',
        attribute: 'fill'
      }
    );
    runtime.animation.transitionTo(
      barColorTransition,
      { type: 'vec4', value: [0.2, 0.9, 0.4, 1.0] },
      barConfig
    );

    let targetIndex = 0;
    const retargetPoints: [number, number, number][] = [
      [3.5, 3.5, 0],
      [3.5, 0, 3.5],
      [3.5, -0.5, -2.0],
      [2.0, 4.0, 2.0],
      [3.5, 0, 0]
    ];

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed') {
        if (isKey(ev, 'space', ' ')) {
          targetIndex = (targetIndex + 1) % retargetPoints.length;
          const pt = retargetPoints[targetIndex]!;
          realm3d.animateModel(
            cube3,
            { position: pt, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
            { duration: 1.2, delay: 0, easing: 'easeOutBack', loopMode: 'once' },
            runtime.animation
          );
        } else if (isKey(ev, 'r')) {
          realm3d.animateModel(
            cube3,
            { position: [3.5, 2.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
            { duration: 1.4, delay: 0, easing: 'easeInOutSine', loopMode: 'pingPong' },
            runtime.animation
          );
        }
      }
    });

    runtime.on('tick', () => {
      const barVal = runtime.animation.getValue(barWidthTransition);
      if (barVal && barVal.type === 'scalar') {
        const pct = Math.round(((barVal.value - 50) / (460 - 50)) * 100);
        realm2d.setSvgText(hudSvg, 'progressText', `${pct}%`);
      }
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoAnim1();
}
