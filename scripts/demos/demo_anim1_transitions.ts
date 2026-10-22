import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { extractKey, quatFromLookAt } from './utils.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const REALM_2D = 20;
const INVOCATION_3D = 100;
const INVOCATION_2D = 101;

export async function runDemoAnim1(): Promise<void> {
  console.log('=== Galfus Engine - Demo Anim1: Transitions, Easing & Reactive Properties ===\n');

  const galfus = new GalfusBun();

  console.log('==> Initializing Platform Context...');
  try {
    galfus.platformInit();
  } catch (err) {
    console.error('Failed to initialize platform context:', err);
    process.exit(1);
  }

  const windowId = 1;
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo Anim1: Transitions, Delay & Reactive SVG',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created (Logical ID: ${windowId})`);

  galfus.multiverseAttachWindow(windowId);
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });

  // Setup 3D Realm
  galfus.realm3dCreate(REALM_3D);
  const camPos: [number, number, number] = [0, 4.5, 10.5];
  const camRot = quatFromLookAt(camPos, [0, 1.2, 0]);
  galfus.realm3dCreateCamera(
    REALM_3D,
    1,
    { fovY: 60.0, near: 0.1, far: 1000.0, cameraSlot: 0 },
    { position: camPos, rotation: camRot, scale: [1, 1, 1] }
  );

  // Lighting & Environment
  const lightPos: [number, number, number] = [10, 20, 10];
  galfus.realm3dCreateLight(
    REALM_3D,
    1,
    { kind: 'directional', color: [1.0, 0.95, 0.85], intensity: 2.5, castShadow: false },
    { position: lightPos, rotation: quatFromLookAt(lightPos, [0, 0, 0]), scale: [1, 1, 1] }
  );

  galfus.realm3dSetEnvironment(REALM_3D, {
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

  // Materials & Geometries
  galfus.realm3dCreateGeometry(REALM_3D, 1, { primitive: 'cube', size: 1.5 });
  galfus.realm3dCreateGeometry(REALM_3D, 2, { primitive: 'sphere', radius: 1.0, subdivisions: 24 });
  galfus.realm3dCreateGeometry(REALM_3D, 3, { primitive: 'plane', size: 25.0 });

  galfus.realm3dCreateMaterial(REALM_3D, 1, {
    baseColor: [0.2, 0.6, 1.0, 1.0],
    roughness: 0.3,
    metallic: 0.1
  });
  galfus.realm3dCreateMaterial(REALM_3D, 2, {
    baseColor: [1.0, 0.3, 0.4, 1.0],
    roughness: 0.2,
    metallic: 0.8
  });
  galfus.realm3dCreateMaterial(REALM_3D, 3, {
    baseColor: [0.3, 0.9, 0.4, 1.0],
    roughness: 0.4,
    metallic: 0.2
  });
  galfus.realm3dCreateMaterial(REALM_3D, 10, {
    baseColor: [0.15, 0.15, 0.18, 1.0],
    roughness: 0.8,
    metallic: 0.1
  });

  // Ground plane
  galfus.realm3dCreateModel(
    REALM_3D,
    100,
    { geometryId: 3, materialId: 10 },
    { position: [0, -0.75, 0], scale: [1, 1, 1] }
  );

  // Model 1: Bouncing Cube (PingPong + Bounce easing)
  galfus.realm3dCreateModel(
    REALM_3D,
    1,
    { geometryId: 1, materialId: 1 },
    { position: [-3.5, 0, 0], scale: [1, 1, 1] }
  );

  // Model 2: Elastic Pulsing Sphere (Loop + Elastic easing)
  galfus.realm3dCreateModel(
    REALM_3D,
    2,
    { geometryId: 2, materialId: 2 },
    { position: [0, 0, 0], scale: [1, 1, 1] }
  );

  // Model 3: Interactive Smooth Retargeting Cube
  galfus.realm3dCreateModel(
    REALM_3D,
    3,
    { geometryId: 1, materialId: 3 },
    { position: [3.5, 0, 0], scale: [1, 1, 1] }
  );

  // Setup 2D Realm for Vector SVG HUD
  galfus.realm2dCreate(REALM_2D);
  galfus.realm2dCreateCamera(REALM_2D, 1, { orthoScale: 768, cameraSlot: 0 }, { position: [0, 0] });

  const SVG_HUD = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 120" width="500" height="120">
      <rect x="0" y="0" width="500" height="120" rx="10" fill="#111827" fill-opacity="0.85" stroke="#374151" stroke-width="2"/>
      <text x="20" y="32" font-family="sans-serif" font-size="16" font-weight="bold" fill="#F9FAFB">Galfus Animation System</text>
      <text x="20" y="55" font-family="sans-serif" font-size="12" fill="#9CA3AF">[Space]: Retarget Position  |  [R]: Reset  |  [Esc]: Exit</text>
      <!-- Reactive Progress Bar -->
      <rect x="20" y="75" width="460" height="20" rx="4" fill="#1F2937"/>
      <rect id="progressBar" x="20" y="75" width="50" height="20" rx="4" fill="#3B82F6"/>
      <text id="progressText" x="250" y="90" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">0%</text>
    </svg>
  `;

  galfus.realm2dCreateSvg(REALM_2D, 1, { source: SVG_HUD }, { position: [0, 270] });

  // Multiverse Invocations
  galfus.multiverseCreateInvocation(INVOCATION_3D, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 0,
    zIndex: 0,
    clearColor: [0.06, 0.08, 0.12, 1.0]
  });

  galfus.multiverseCreateInvocation(INVOCATION_2D, {
    realmId: REALM_2D,
    targetId: TARGET_WINDOW,
    cameraSlot: 0,
    zIndex: 1,
    clearColor: [0.0, 0.0, 0.0, 0.0]
  });

  // =========================================================================
  // SETUP ANIMATIONS & TRANSITIONS
  // =========================================================================

  console.log('\n==> Configuring Animation Transitions...');

  // 1. Transition 1: Bouncing Cube (PingPong vertical translation with EaseOutBounce)
  galfus.animationCreateTransition(
    1,
    { type: 'transform3D', value: [-3.5, 0, 0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 1.6, delay: 0.2, easing: 'easeOutBounce', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(1, { kind: 'modelTransform3D', realmId: REALM_3D, modelId: 1 });
  galfus.animationTransitionTo(1, {
    type: 'transform3D',
    value: [-3.5, 4.0, 0, 0, 0, 0, 1, 1, 1, 1]
  });

  // 2. Transition 2: Pulsing Sphere Scale (PingPong with EaseInOutCubic)
  galfus.animationCreateTransition(
    2,
    { type: 'transform3D', value: [0, 0.5, 0, 0, 0, 0, 1, 0.8, 0.8, 0.8] },
    { duration: 1.2, delay: 0.0, easing: 'easeInOutCubic', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(2, { kind: 'modelTransform3D', realmId: REALM_3D, modelId: 2 });
  galfus.animationTransitionTo(2, {
    type: 'transform3D',
    value: [0, 0.5, 0, 0, 0, 0, 1, 1.6, 1.6, 1.6]
  });

  // 3. Transition 3: Interactive Smooth Retargeting Cube (PingPong initially, retargetable with Space)
  galfus.animationCreateTransition(
    3,
    { type: 'transform3D', value: [3.5, 0, 0, 0, 0, 0, 1, 1, 1, 1] },
    { duration: 1.4, delay: 0.1, easing: 'easeInOutSine', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(3, { kind: 'modelTransform3D', realmId: REALM_3D, modelId: 3 });
  galfus.animationTransitionTo(3, {
    type: 'transform3D',
    value: [3.5, 2.5, 0, 0, 0, 0, 1, 1, 1, 1]
  });

  // 4. Transition 4: Reactive SVG Progress Bar width (Scalar attribute)
  galfus.animationCreateTransition(
    4,
    { type: 'scalar', value: 50.0 },
    { duration: 2.0, delay: 0.0, easing: 'easeInOutQuad', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(4, {
    kind: 'svgAttributeScalar',
    realmId: REALM_2D,
    svgId: 1,
    elementId: 'progressBar',
    attribute: 'width'
  });
  galfus.animationTransitionTo(4, { type: 'scalar', value: 460.0 });

  // 5. Transition 5: Reactive SVG Progress Bar color (Color attribute)
  galfus.animationCreateTransition(
    5,
    { type: 'vec4', value: [0.2, 0.5, 1.0, 1.0] },
    { duration: 2.0, delay: 0.0, easing: 'easeInOutQuad', loopMode: 'pingPong' }
  );
  galfus.animationBindTarget(5, {
    kind: 'svgAttributeColor',
    realmId: REALM_2D,
    svgId: 1,
    elementId: 'progressBar',
    attribute: 'fill'
  });
  galfus.animationTransitionTo(5, { type: 'vec4', value: [0.2, 0.9, 0.4, 1.0] });

  console.log('✔ All animation transitions bound and active!');
  console.log(
    '\nStarting Main Loop (Press Space to retarget Cube #3 mid-flight, ESC to quit)...\n'
  );

  let running = true;
  let targetIndex = 0;
  const retargetPoints = [
    [3.5, 3.5, 0],
    [3.5, 0, 3.5],
    [3.5, -0.5, -2.0],
    [2.0, 4.0, 2.0],
    [3.5, 0, 0]
  ];

  let lastTime = performance.now();
  let frameCount = 0;

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // Advance animation system by dt and apply to Multiverse
    galfus.animationStep(dt);

    // Synchronize reactive SVG HUD percentage text with progress bar transition
    const barState = galfus.animationGetState(4);
    if (barState && 'value' in (barState.currentValue as any)) {
      const curW = (barState.currentValue as any).value as number;
      const pct = Math.round(((curW - 50) / (460 - 50)) * 100);
      galfus.realm2dSetSvgText(REALM_2D, 1, 'progressText', `${pct}%`);
    }

    // Drain lifecycle events
    const events = galfus.animationPumpEvents();
    for (const ev of events) {
      if (ev.eventType === 'completed') {
        console.log(
          `[Event] Transition #${ev.transitionId} Completed! (elapsed: ${ev.elapsed.toFixed(2)}s)`
        );
      } else if (ev.eventType === 'started') {
        console.log(`[Event] Transition #${ev.transitionId} Started after delay!`);
      } else if (ev.eventType === 'looped') {
        // Log loop events periodically
        if (ev.transitionId === 1) {
          console.log(`[Event] Transition #1 Bounced / Looped!`);
        }
      }
    }

    // Pump window events
    const windowEvents = galfus.platformPumpEvents();
    for (const ev of windowEvents) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          running = false;
          break;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        if (ev.state === 'pressed') {
          const key = extractKey(ev);
          if (key === 'escape') {
            running = false;
            break;
          }
          if (key === ' ' || key === 'space') {
            targetIndex = (targetIndex + 1) % retargetPoints.length;
            const pt = retargetPoints[targetIndex]!;
            console.log(
              `--> [Space] Retargeting Cube #3 smoothly to [${pt.join(', ')}] in 1.2s...`
            );
            galfus.animationTransitionTo(
              3,
              { type: 'transform3D', value: [pt[0]!, pt[1]!, pt[2]!, 0, 0, 0, 1, 1, 1, 1] },
              { duration: 1.2, delay: 0.0, easing: 'easeOutBack', loopMode: 'once' }
            );
          } else if (key === 'r') {
            console.log('--> [R] Resetting Cube #3 to ping-pong animation...');
            galfus.animationTransitionTo(
              3,
              { type: 'transform3D', value: [3.5, 2.5, 0, 0, 0, 0, 1, 1, 1, 1] },
              { duration: 1.4, delay: 0.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
            );
          }
        }
      }
    }

    galfus.multiverseResolve();
    galfus.multiverseDispatch(frameCount, dt);
    frameCount++;

    await Bun.sleep(16);
  }

  galfus.platformShutdown();
  console.log('\n✔ Demo Anim1 completed gracefully.');
}

if (import.meta.main) {
  runDemoAnim1();
}
