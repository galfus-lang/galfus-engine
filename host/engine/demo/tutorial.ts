/**
 * Galfus Engine - Host Layer Tutorial Demo
 *
 * Visual, interactive demonstration of `@galfus/engine` host orchestration:
 * - Creates an OS desktop window with high-precision frame loop
 * - Assembles a 3D Realm with a floor plane, vibrant PBR materials, directional and point lighting
 * - Builds a Tank hierarchy (Base Cube + Rotating Turret Cylinder + Cannon Capsule + Constrained Floating Indicator)
 * - Employs a zero-GC persistent matrix cache with in-place anchor constraint callbacks
 * - Overlays a responsive 2D Realm HUD with dynamic SVG scoreboard and instructions
 * - Keeps the window open and alive, smoothly animated at 60 FPS until closed or ESC is pressed
 */
import { createBunTransport } from '@galfus/transport-bun';
import {
  createRuntime,
  isKey,
  mat4,
  quat,
  type TargetId,
  type Transform3DComponent,
  type WindowId
} from '@galfus/engine';
import { presets3D } from '@galfus/engine/realm3d';
import { presets2D } from '@galfus/engine/realm2d';

/** Synthesizes an audible, looping 16-bit PCM WAV audio waveform (sci-fi tank engine hum). */
function createSynthesizedWav(durationSecs = 1.0, freq = 180.0): Uint8Array {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSecs);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // 'RIFF' chunk
  view.setUint32(0, 0x52494646, false); // 'RIFF'
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // 'WAVE'

  // 'fmt ' subchunk (PCM 16-bit mono)
  view.setUint32(12, 0x666d7420, false); // 'fmt '
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // 'data' subchunk
  view.setUint32(36, 0x64617461, false); // 'data'
  view.setUint32(40, dataSize, true);

  // Periodic waveform: fundamental + octave harmonics for a smooth turbine drone
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const wave =
      0.6 * Math.sin(2.0 * Math.PI * freq * t) +
      0.3 * Math.sin(2.0 * Math.PI * (freq * 2.0) * t) +
      0.1 * Math.sin(2.0 * Math.PI * (freq * 0.5) * t);
    const sample = Math.max(-1.0, Math.min(1.0, wave));
    view.setInt16(44 + i * 2, Math.round(sample * 24000), true);
  }

  return new Uint8Array(buffer);
}

export interface TutorialDemoOptions {
  headless?: boolean;
  maxFrames?: number;
}

export async function runTutorialDemo(options: TutorialDemoOptions = {}): Promise<void> {
  const isHeadless =
    options.headless ?? (process.argv.includes('--headless') || !process.env.DISPLAY);
  const framesIdx = process.argv.indexOf('--frames');
  const cliFrames =
    framesIdx !== -1 && process.argv[framesIdx + 1]
      ? parseInt(process.argv[framesIdx + 1]!, 10)
      : undefined;
  const maxFrames = options.maxFrames ?? cliFrames; // undefined = run continuously until user exits

  console.log('\n=============================================================');
  console.log('       Galfus Engine - Host Tutorial Demo (Interactive)      ');
  console.log('=============================================================\n');

  // 1. Choose platform transport and create unified runtime
  console.log('[1/7] Initializing BunTransport and MultiverseRuntime...');
  const transport = createBunTransport();
  const runtime = createRuntime(transport);

  await runtime.init({ debug: true, headless: isHeadless });
  console.log(`      ✓ Runtime ready (headless: ${isHeadless})`);

  let targetId: TargetId;
  let windowId: WindowId | null = null;

  // 2. Setup display surface (Native OS Window on desktop, or offscreen texture if headless)
  if (!isHeadless) {
    console.log('[2/7] Creating desktop OS Window...');
    windowId = runtime.platform.window.create({
      title: 'Galfus Engine - Host Tutorial Demo (ESC to exit)',
      size: [1280, 720],
      resizable: true,
      decorations: true,
      transparent: false,
      initialState: 'windowed'
    });

    runtime.platform.window.setTitle(windowId, 'Galfus Engine - Host Tutorial Demo (ESC to exit)');
    runtime.platform.window.setCursorGrab(windowId, 'none');
    runtime.platform.window.setCursorIcon(windowId, 'default');
    const [w, h] = runtime.platform.window.getSize(windowId);
    console.log(`      ✓ Window ${windowId} active (${w}x${h})`);

    targetId = runtime.multiverse.createTarget({
      kind: { type: 'window', windowId }
    });
  } else {
    console.log('[2/7] Running in headless mode: configuring Offscreen Texture Target...');
    targetId = runtime.multiverse.createTarget({
      kind: { type: 'texture', width: 1280, height: 720 }
    });
    console.log(`      ✓ Headless offscreen target registered (id: ${targetId})`);
  }

  // 3. Multiverse Invocations: Main 3D Viewport + 2D Minimap/HUD Overlay
  console.log('[3/7] Setting up Multiverse Invocations (3D Scene + 2D PiP HUD)...');
  const realm3D = runtime.createRealm3D();
  const realm2D = runtime.createRealm2D();

  // Fullscreen 3D Viewport
  const main3DInvocation = runtime.multiverse.createInvocation({
    realmId: realm3D.realmId,
    targetId,
    cameraSlot: 0,
    zIndex: 0,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    clearColor: [0.06, 0.08, 0.12, 1.0]
  });

  // Top-Right Picture-in-Picture 2D HUD overlay
  const pip2DInvocation = runtime.multiverse.createInvocation({
    realmId: realm2D.realmId,
    targetId,
    cameraSlot: 0,
    zIndex: 1,
    viewport: {
      anchorX: 'right',
      anchorY: 'top',
      offsetX: { px: -24 },
      offsetY: { px: 24 },
      width: { px: 320 },
      height: { px: 180 }
    },
    clearColor: [0.0, 0.0, 0.0, 0.0]
  });
  console.log(`      ✓ 3D Invocation: ${main3DInvocation}, 2D HUD Invocation: ${pip2DInvocation}`);

  // 4. Assemble 3D Scene: Floor Plane + Tank Cube + Rotating Turret + Barrel + Indicator
  console.log('[4/7] Assembling 3D Scene (Floor Plane, PBR Materials & Tank Hierarchy)...');

  // Procedural skybox, ambient lighting and exposure
  realm3D.setEnvironment({
    ambientColor: [0.15, 0.18, 0.22, 1.0],
    clearColor: [0.06, 0.08, 0.12, 1.0],
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

  // Perspective Camera: looking from elevated isometric angle down to the center
  const camPos: [number, number, number] = [0, 5, 10];
  const camRot = quat.create();
  quat.fromLookAt(camRot, camPos, [0, 1.0, 0]);
  const camera = realm3D.createCamera(presets3D.createPerspectiveCamera3DPreset(), {
    position: camPos,
    rotation: camRot
  });
  realm3D.setCameraLookAt(camera, { target: [0, 1.0, 0] });

  // Key directional light with warm sun color pointing downwards
  const lightPos: [number, number, number] = [10, 20, 10];
  const lightRot = quat.create();
  quat.fromLookAt(lightRot, lightPos, [0, 0, 0]);
  realm3D.createLight(presets3D.createDirectionalLight3DPreset({ color: [1.0, 0.95, 0.85] }), {
    position: lightPos,
    rotation: lightRot
  });

  // Soft ambient fill light
  realm3D.createLight(
    presets3D.createPointLight3DPreset({ color: [0.4, 0.6, 1.0], intensity: 3.0, range: 30.0 }),
    { position: [-6, 6, 6] }
  );

  // PBR Material: Floor (Chão) - Dark metallic grid-like slate
  const { materialId: floorMat } = realm3D.createMaterial(
    presets3D.createPbrMaterialPreset({
      baseColor: [0.12, 0.15, 0.2, 1.0],
      roughness: 0.85,
      metallic: 0.15
    })
  );

  // PBR Material: Tank Base Cube - Vibrant ruby/orange metallic
  const { materialId: tankMat } = realm3D.createMaterial(
    presets3D.createPbrMaterialPreset({
      baseColor: [0.92, 0.38, 0.12, 1.0],
      roughness: 0.25,
      metallic: 0.75
    })
  );

  // PBR Material: Turret Cylinder - Sleek gunmetal titanium
  const { materialId: turretMat } = realm3D.createMaterial(
    presets3D.createPbrMaterialPreset({
      baseColor: [0.22, 0.26, 0.32, 1.0],
      roughness: 0.3,
      metallic: 0.85
    })
  );

  // PBR Material: Barrel Cannon Capsule - Polished dark steel
  const { materialId: barrelMat } = realm3D.createMaterial(
    presets3D.createPbrMaterialPreset({
      baseColor: [0.08, 0.1, 0.14, 1.0],
      roughness: 0.15,
      metallic: 0.95
    })
  );

  // PBR Material: Floating Indicator Cube - Luminous gold accent
  const { materialId: indicatorMat } = realm3D.createMaterial(
    presets3D.createPbrMaterialPreset({
      baseColor: [1.0, 0.82, 0.15, 1.0],
      roughness: 0.2,
      metallic: 0.6
    })
  );

  // A) Ground Floor Plane (Chão)
  realm3D.createPlane(24.0, 24.0, floorMat, { position: [0, 0, 0] });

  // B) Tank Body Cube - Elevated to sit squarely on the floor
  const parentTank = realm3D.createCube(2.0, tankMat, { position: [0, 1.0, 0] });

  // C) Turret Cylinder mounted directly on top of the tank body
  const turret = realm3D.createCylinder(0.85, 0.55, 24, turretMat, {
    position: [0, 1.28, 0]
  });
  realm3D.hierarchy.attach(turret, parentTank);

  // D) Cannon Barrel Capsule mounted on the front face of the turret
  const barrel = realm3D.createCapsule(0.18, 1.6, 6, 24, barrelMat, {
    position: [0, 0.2, 0.85]
  });
  realm3D.hierarchy.attach(barrel, turret);

  // E) Floating Target Indicator using functional in-place constraint callback
  const indicator = realm3D.createCube(0.28, indicatorMat, { position: [0, 2.6, 0] });
  realm3D.hierarchy.attach(indicator, parentTank, (targetWorld, local, outWorld) => {
    mat4.copy(outWorld, local);
    mat4.copyPosition(outWorld, targetWorld);
  });

  // Debug gizmos on the floor
  realm3D.drawLine(-12, 0.02, 0, 12, 0.02, 0, 0.2, 0.6, 1.0, 0.7);
  realm3D.drawLine(0, 0.02, -12, 0, 0.02, 12, 0.2, 0.6, 1.0, 0.7);
  realm3D.drawAabb(-1.1, 0.01, -1.1, 1.1, 2.1, 1.1, 1.0, 0.4, 0.1, 0.4);

  // Spark Emitter
  const sparkEmitter = realm3D.createParticleEmitter(
    {
      maxParticles: 300,
      spawnRate: 40,
      startColor: [1, 0.8, 0.2, 1],
      endColor: [1, 0.1, 0, 0]
    },
    { position: [0, 1.5, 1.8] }
  );
  realm3D.particleEmitterBurst(sparkEmitter, 50);
  console.log('      ✓ Floor, Tank, Turret, Barrel, Indicator, and Gizmos created');

  // 5. Assemble 2D Realm HUD
  console.log('[5/7] Assembling 2D HUD Overlay Scene...');
  realm2D.createCamera(presets2D.createOrthoCamera2DPreset({ orthoScale: 180 }), {
    position: [0, 0]
  });
  realm2D.createLight(
    presets2D.createPointLight2DPreset({ color: [1, 1, 1], range: 1000, intensity: 1.0 }),
    { position: [0, 0] }
  );

  const hudSvg = realm2D.createSvg(
    {
      source: `
        <svg id="root" width="320" height="180" viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
          <rect width="320" height="180" rx="8" fill="#0d141e" stroke="#25384e" stroke-width="2"/>
          <text x="16" y="32" font-family="sans-serif" font-size="14" font-weight="bold" fill="#00d8ff">GALFUS ENGINE</text>
          <text x="16" y="52" font-family="sans-serif" font-size="11" fill="#7d9dbb">Host Layer Tutorial Demo</text>
          <line x1="16" y1="62" x2="304" y2="62" stroke="#25384e" stroke-width="1"/>
          <text id="txt-status" x="16" y="86" font-family="sans-serif" font-size="12" fill="#4ade80">● Status: Running (60 FPS)</text>
          <text id="txt-hierarchy" x="16" y="108" font-family="sans-serif" font-size="11" fill="#cbd5e1">Hierarchy: Tank → Turret → Barrel</text>
          <text id="txt-frame" x="16" y="130" font-family="sans-serif" font-size="11" fill="#94a3b8">Frame: 0</text>
          <text x="16" y="156" font-family="sans-serif" font-size="10" fill="#64748b">Press [ESC] to Exit Window</text>
        </svg>
      `,
      castShadow: false,
      receiveShadow: false
    },
    { position: [0, 0] }
  );
  console.log('      ✓ Live Interactive Vector SVG HUD registered');

  // 6. GPU Textures & Audio Setup
  console.log('[6/7] Initializing Shared Resources & Spatial Audio...');
  const rawPixelBytes = new Uint8Array(256 * 256 * 4);
  runtime.resources.createTexture(rawPixelBytes, { width: 256, height: 256, format: 'rgba8Unorm' });

  const rawAudioBytes = createSynthesizedWav(1.0, 180.0);
  const soundId = runtime.audio.loadSound(rawAudioBytes);
  const spatialVoice = runtime.audio.playSoundSpatial(soundId, [0, 1.5, 0], {
    volume: 0.85,
    minDistance: 2.0,
    maxDistance: 45.0,
    looping: true
  });
  runtime.audio.setListenerPosition(camPos[0], camPos[1], camPos[2]);

  // 7. Interactive Precision Frame Loop
  console.log('[7/7] Launching Interactive Precision Frame Loop...');
  console.log('\n-------------------------------------------------------------');
  console.log('   The demo window is now active on your display!');
  console.log('   - Floor & 3D Tank are rendered in real-time');
  console.log('   - The turret continuously rotates on the parent tank');
  console.log('   - Press [ESC] or close the window to gracefully exit.');
  console.log('-------------------------------------------------------------\n');

  let turretAngle = 0;
  let totalFrames = 0;
  let isShuttingDown = false;

  const shutdown = (reason: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n==> Exiting demo (${reason})...`);
    runtime.stop();
    if (windowId !== null) {
      try {
        runtime.platform.window.close(windowId);
      } catch {}
    }
    try {
      runtime.dispose();
    } catch {}
    console.log('✔ Clean shutdown complete.\n');
    process.exit(0);
  };

  // Listen to Window Close Event
  runtime.on('window', (event) => {
    if (event.type === 'closeRequested') {
      shutdown('Window close button clicked');
    }
  });

  // Listen to Keyboard Escape Event
  runtime.on('keyboard', (event) => {
    if (event.type === 'input' && event.state === 'pressed') {
      if (isKey(event, 'escape', 'esc', 'q')) {
        shutdown(`Key '${event.logicalKey}' pressed`);
      }
    }
  });

  // Listen to Platform Events for cross-system event routing
  runtime.on('platform', (event) => {
    if (event.kind === 'keyboard' && event.type === 'input' && event.state === 'pressed') {
      if (isKey(event, 'escape', 'esc', 'q')) {
        shutdown(`Key '${event.logicalKey}' pressed`);
      }
    } else if (event.kind === 'window' && event.type === 'closeRequested') {
      shutdown('Window close requested');
    }
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    shutdown('SIGINT received');
  });

  // Continuous Frame Loop Update
  const turretTransform = realm3D.world.getComponent<Transform3DComponent>(
    turret.entityId,
    'Transform3D'
  );

  const rotQuat = quat.create();

  runtime.on('tick', ({ frameId, dt }) => {
    if (isShuttingDown) return;
    totalFrames++;

    // A) Rotate turret smoothly relative to tank body
    if (turretTransform) {
      turretAngle += dt * 0.9;
      quat.setAxisAngle(rotQuat, [0, 1, 0], turretAngle);
      quat.copy(turretTransform.rotation, rotQuat);
      turretTransform.isDirty = true;
    }

    // B) Update 3D spatial audio emitter position in real-time
    runtime.audio.setVoiceEmitterPosition(spatialVoice, Math.sin(turretAngle) * 2, 1.5, 0);

    // C) Update HUD SVG text every 15 frames for high efficiency
    if (frameId % 15 === 0) {
      realm2D.setSvgText(
        hudSvg,
        'txt-frame',
        `Frame: ${frameId} | Time: ${(frameId * dt).toFixed(1)}s`
      );
    }

    // D) If bounded frame count requested (e.g. CI testing), terminate when reached
    if (maxFrames !== undefined && totalFrames >= maxFrames) {
      shutdown(`Reached target frame count of ${maxFrames}`);
    }
  });

  // 7. Precision Frame Loop driven internally by Galfus Transport
  runtime.start({ targetFps: 60 });

  // Await until demo completes or is shut down (ESC key, window close, or maxFrames reached)
  await new Promise<void>((resolve) => {
    const checkInterval = setInterval(() => {
      if (isShuttingDown || !runtime.isRunning) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 16);
  });
}

// Direct CLI execution
if (import.meta.main) {
  runTutorialDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n✖ Fatal error running tutorial demo:', err);
      process.exit(1);
    });
}
