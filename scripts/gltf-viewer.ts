#!/usr/bin/env bun
/**
 * Galfus Engine - Real-Time glTF 2.0 / GLB / ZIP Asset Viewer
 *
 * Standalone interactive 3D model viewer supporting:
 * - Monolithic .glb binary files
 * - Standalone .gltf JSON files
 * - Multi-file .zip archives (containing .gltf, .bin buffers, and texture subfolders)
 *
 * Usage:
 *   bun gltf <path-to-model> [options]
 *   bun scripts/gltf-viewer.ts <path-to-model> [options]
 */

import { existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import {
  type AnimationPlayer3DComponent,
  type Camera3DComponent,
  createRuntime,
  getKey,
  type Mesh3DComponent,
  type Model3DComponent,
  quat,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { presets3D } from '@galfus/engine/realm3d';
import { loadGltfAsset } from '@galfus/gltf-loader';
import { createBunTransport } from '@galfus/transport-bun';
import { resolveViewerAlphaMode } from './gltf-alpha';
import { formatBytes, parseArgs, printUsage, resolveFilePath } from './gltf-viewer-cli';

async function runViewer(): Promise<void> {
  const opts = parseArgs();

  if (opts.help || !opts.filePath) {
    printUsage();
    if (!opts.filePath && !opts.help) {
      console.error('Error: No model file path specified.');
      process.exit(1);
    }
    return;
  }

  const resolvedPath = resolveFilePath(opts.filePath);
  if (!existsSync(resolvedPath)) {
    console.error(`\nError: File not found at path: "${resolvedPath}"\n`);
    process.exit(1);
  }

  const fileName = basename(resolvedPath);
  const fileStat = statSync(resolvedPath);
  const ext = resolvedPath.split('.').pop()?.toLowerCase() ?? '';

  console.log('\n=============================================================');
  console.log(`       Galfus glTF Viewer: "${fileName}"`);
  console.log('=============================================================\n');

  console.log(`[1/5] Initializing Galfus Bun Runtime...`);
  const transport = createBunTransport({ debug: false, headless: opts.isHeadless });
  const runtime = createRuntime(transport);

  // Use a dedicated Target ID outside the low range (1..50) reserved for asset textures
  const VIEWER_TARGET_ID = 100;
  let targetId: TargetId;
  let windowId: WindowId | null = null;

  if (!opts.isHeadless) {
    console.log(`[2/5] Creating Desktop Window (1280x720)...`);
    windowId = runtime.platform.window.create({
      title: `Galfus glTF Viewer - ${fileName}`,
      size: [1280, 720],
      resizable: true,
      decorations: true,
      initialState: 'windowed'
    });
    targetId = runtime.multiverse.createTarget(VIEWER_TARGET_ID, {
      kind: { type: 'window', windowId }
    });
  } else {
    console.log(`[2/5] Headless Mode: Allocating Offscreen Texture Target (1280x720)...`);
    targetId = runtime.multiverse.createTarget(VIEWER_TARGET_ID, {
      kind: { type: 'texture', width: 1280, height: 720 }
    });
  }

  console.log(`[3/5] Setting up 3D Realm & Loading Model Asset ("${ext.toUpperCase()}")...`);
  const realm = runtime.createRealm3D(1);

  const loadStart = performance.now();
  const factory = await loadGltfAsset(realm, resolvedPath, {
    resolveMaterialAlphaMode: opts.alphaMode === 'viewer' ? resolveViewerAlphaMode : undefined
  });
  const loadTimeMs = (performance.now() - loadStart).toFixed(1);

  console.log(`[4/5] Instantiating ECS Scene Graph & Binding Animations...`);
  const instance = factory.instantiate({
    transform: {
      scale: opts.scale !== undefined ? [opts.scale, opts.scale, opts.scale] : [1, 1, 1]
    }
  });

  // Auto-play first animation if present
  let isAnimationPlaying = false;
  let currentAnimIndex = 0;
  const animPlayer = instance.animationPlayer as AnimationPlayer3DComponent | undefined;
  if (animPlayer && factory.animationNames.length > 0) {
    const firstClipName = factory.animationNames[0]!;
    animPlayer.play(firstClipName, 'repeat');
    isAnimationPlaying = true;
  }

  // Auto-frame camera based on computed model bounds
  const scale = opts.scale ?? 1;
  const sourceBounds = factory.bounds;
  const bounds = sourceBounds
    ? {
        ...sourceBounds,
        center: sourceBounds.center.map((value) => value * scale) as [number, number, number],
        min: sourceBounds.min.map((value, i) =>
          Math.min(value * scale, sourceBounds.max[i]! * scale)
        ) as [number, number, number],
        max: sourceBounds.max.map((value, i) =>
          Math.max(value * scale, sourceBounds.min[i]! * scale)
        ) as [number, number, number],
        radius: sourceBounds.radius * Math.abs(scale),
        size: sourceBounds.size.map((value) => value * Math.abs(scale)) as [number, number, number]
      }
    : undefined;
  const initialOrbitTarget: [number, number, number] = bounds ? [...bounds.center] : [0, 0.8, 0];
  const orbitTarget: [number, number, number] = [...initialOrbitTarget];

  // Standard framing formula with margin: R / sin(fov/2) * 1.35
  const initialOrbitRadius = bounds
    ? Math.max((bounds.radius / Math.sin((45 * Math.PI) / 360)) * 1.35, 2.0)
    : 5.0;
  const initialOrbitYaw = 0.75;
  const initialOrbitPitch = 0.35;

  let orbitRadius = initialOrbitRadius;
  let orbitYaw = initialOrbitYaw;
  let orbitPitch = initialOrbitPitch;
  let autoRotate = true;

  console.log(`[5/5] Configuring Dynamic Studio Lighting & Auto-Framed Camera...`);

  // Ambient lighting & studio environment
  realm.setEnvironment({
    ambientColor: [0.35, 0.38, 0.45, 1.0]
  });

  // Setup 3-Point Studio Lighting
  const lightDist = bounds ? Math.max(bounds.radius * 3.0, 12.0) : 15.0;

  // 1. Key Light (warm, directional from front-right-top)
  const sunPos: [number, number, number] = [
    orbitTarget[0] + lightDist * 0.7,
    orbitTarget[1] + lightDist * 1.0,
    orbitTarget[2] + lightDist * 0.7
  ];
  const sunRot = quat.create();
  quat.fromLookAt(sunRot, sunPos, orbitTarget);
  realm.createLight(
    presets3D.createDirectionalLight3DPreset({
      color: [1.0, 0.98, 0.94],
      intensity: 1.8
    }),
    { position: sunPos, rotation: sunRot }
  );

  // 2. Fill Light (cool, point from front-left-mid)
  realm.createLight(
    presets3D.createPointLight3DPreset({
      color: [0.65, 0.75, 0.95],
      intensity: 1.2,
      range: lightDist * 3.0
    }),
    {
      position: [
        orbitTarget[0] - lightDist * 0.7,
        orbitTarget[1] + lightDist * 0.6,
        orbitTarget[2] - lightDist * 0.5
      ]
    }
  );

  // 3. Rim Light (subtle directional from rear-bottom to accent silhouette)
  const rimPos: [number, number, number] = [
    orbitTarget[0] - lightDist * 0.5,
    orbitTarget[1] + lightDist * 0.3,
    orbitTarget[2] - lightDist * 0.9
  ];
  const rimRot = quat.create();
  quat.fromLookAt(rimRot, rimPos, orbitTarget);
  realm.createLight(
    presets3D.createDirectionalLight3DPreset({
      color: [0.8, 0.85, 1.0],
      intensity: 0.9
    }),
    { position: rimPos, rotation: rimRot }
  );

  // Reference floor grid plane positioned slightly below the base of the model
  const floorY = bounds ? bounds.min[1] - 0.02 : -0.01;
  const floorSize = bounds ? Math.max(bounds.radius * 8.0, 30.0) : 30.0;
  const { materialId: floorMat } = realm.createMaterial(
    presets3D.createPbrMaterialPreset({
      baseColor: [0.12, 0.14, 0.18, 1.0],
      roughness: 0.85,
      metallic: 0.15
    })
  );
  const floorPlane = realm.createPlane(floorSize, floorSize, floorMat, {
    position: [orbitTarget[0], floorY, orbitTarget[2]]
  });
  let isFloorVisible = true;

  // Setup Camera (fovY in degrees, e.g. 45.0)
  const cameraEntity = realm.createCamera(
    presets3D.createPerspectiveCamera3DPreset({
      fovY: 45.0,
      near: 0.05,
      far: Math.max(2000, initialOrbitRadius * 20 + (bounds?.radius ?? 0) * 2)
    }),
    { position: [orbitTarget[0], orbitTarget[1] + 1, orbitTarget[2] + orbitRadius] }
  );

  realm.setCameraLookAt(cameraEntity, { target: orbitTarget });

  runtime.multiverse.createInvocation({
    realmId: realm.realmId,
    targetId,
    cameraSlot: 0,
    clearColor: [0.08, 0.1, 0.14, 1.0],
    viewport: { width: { vw: 100 }, height: { vh: 100 } }
  });

  // Print summary dashboard
  console.log('\n-------------------------------------------------------------');
  console.log('              ASSET LOADED SUCCESSFULLY                      ');
  console.log('-------------------------------------------------------------');
  console.log(`  • File:        ${fileName} (${formatBytes(fileStat.size)})`);
  console.log(`  • Load Time:   ${loadTimeMs} ms`);
  console.log(`  • Entities:    ${instance.entities.length} ECS Nodes`);
  console.log(`  • Geometries:  ${factory.createdGeometryIds.length} uploaded to VRAM`);
  console.log(`  • Materials:   ${factory.createdMaterialIds.length} PBR Materials`);
  console.log(`  • Alpha mode:  ${opts.alphaMode}`);
  console.log(`  • Textures:    ${factory.createdTextureIds.length} GPU Textures`);
  console.log(
    `  • Animations:  ${factory.animationNames.length} Clips (${factory.animationNames.join(', ') || 'None'})${isAnimationPlaying ? ` [Playing: "${factory.animationNames[0]}"]` : ''}`
  );
  if (bounds) {
    console.log(
      `  • Bounds:      ${bounds.size.map((s) => s.toFixed(2)).join(' x ')} m (radius ${bounds.radius.toFixed(2)} m)`
    );
  }
  console.log('-------------------------------------------------------------\n');

  if (!opts.isHeadless) {
    console.log('Interactive Viewer is live on your display! Press [ESC] to exit.');
    if (factory.animationNames.length > 0) {
      console.log('  [SPACE]: Pause / Resume Animation  |  [N]: Next Animation Clip');
    }
  }

  // Camera updater helper
  const cameraModel = realm.world.getComponent<Model3DComponent>(cameraEntity.entityId, 'Model3D');
  const cameraComponent = realm.world.getComponent<Camera3DComponent>(
    cameraEntity.entityId,
    'Camera3D'
  );
  function updateCamera(): void {
    if (!cameraModel) return;
    const cx = orbitTarget[0] + orbitRadius * Math.cos(orbitPitch) * Math.sin(orbitYaw);
    const cy = orbitTarget[1] + orbitRadius * Math.sin(orbitPitch);
    const cz = orbitTarget[2] + orbitRadius * Math.cos(orbitPitch) * Math.cos(orbitYaw);

    const camRot = quat.create();
    quat.fromLookAt(camRot, [cx, cy, cz], orbitTarget);
    cameraModel.setPosition([cx, cy, cz]);
    cameraModel.setRotation(camRot);
    const requiredFar = (orbitRadius + (bounds?.radius ?? 1) * 2) * 1.5;
    if (cameraComponent && requiredFar > (cameraComponent.desc.far ?? 0)) {
      cameraComponent.desc = {
        ...cameraComponent.desc,
        far: requiredFar,
        lookAt: { target: [...orbitTarget] }
      };
      cameraComponent.isDirty = true;
    }
    realm.setCameraLookAt(cameraEntity, { target: orbitTarget });
  }
  updateCamera();

  let isExiting = false;
  let totalFrames = 0;

  function shutdown(reason: string): void {
    if (isExiting) return;
    isExiting = true;
    console.log(`\n==> Exiting viewer (${reason})...`);
    try {
      runtime.stop();
    } catch {}
    if (windowId !== null) {
      try {
        runtime.platform.window.close(windowId);
      } catch {}
    }
    try {
      runtime.dispose();
    } catch {}
    console.log('✔ Cleanup completed successfully.\n');
    process.exit(0);
  }

  // Continuous keyboard input tracking
  const pressedKeys = new Set<string>();

  function resolveKeyVariants(event: { logicalKey?: string; physicalKey?: string }): string[] {
    const list: string[] = [];
    const main = getKey(event);
    if (main) list.push(main);
    if (typeof event.logicalKey === 'string' && event.logicalKey.length > 0) {
      list.push(event.logicalKey.toLowerCase());
    }
    let phys = String(event.physicalKey ?? '').toLowerCase();
    const codeMatch = /^code\((.+)\)$/.exec(phys);
    if (codeMatch) phys = codeMatch[1]!;
    if (phys.startsWith('key') && phys.length === 4) phys = phys.slice(3);
    if (phys) list.push(phys);
    return list;
  }

  runtime.on('keyboard', (event) => {
    if (event.type === 'input') {
      const keys = resolveKeyVariants(event);

      if (event.state === 'pressed') {
        for (const k of keys) pressedKeys.add(k);

        if (keys.includes('escape') || keys.includes('esc')) {
          shutdown(`Exit key '${event.logicalKey}' pressed`);
        } else if (keys.includes('space')) {
          if (animPlayer && factory.animationNames.length > 0) {
            isAnimationPlaying = !isAnimationPlaying;
            const clipName = factory.animationNames[currentAnimIndex]!;
            if (isAnimationPlaying) {
              const state = animPlayer.activeStates.get(clipName);
              if (state) state.isPlaying = true;
              else animPlayer.play(clipName, 'repeat');
              console.log(`[Animation] Resumed '${clipName}'`);
            } else {
              const state = animPlayer.activeStates.get(clipName);
              if (state) state.isPlaying = false;
              console.log(`[Animation] Paused`);
            }
          } else {
            autoRotate = !autoRotate;
            console.log(`[Turntable] ${autoRotate ? 'Enabled' : 'Paused'}`);
          }
        } else if (keys.includes('n')) {
          if (animPlayer && factory.animationNames.length > 0) {
            currentAnimIndex = (currentAnimIndex + 1) % factory.animationNames.length;
            const nextClip = factory.animationNames[currentAnimIndex]!;
            animPlayer.stop();
            animPlayer.play(nextClip, 'repeat');
            isAnimationPlaying = true;
            console.log(
              `[Animation] Switched to clip '${nextClip}' (${currentAnimIndex + 1}/${factory.animationNames.length})`
            );
          }
        } else if (keys.includes('t')) {
          autoRotate = !autoRotate;
          console.log(`[Turntable] ${autoRotate ? 'Enabled' : 'Paused'}`);
        } else if (keys.includes('r')) {
          orbitRadius = initialOrbitRadius;
          orbitYaw = initialOrbitYaw;
          orbitPitch = initialOrbitPitch;
          orbitTarget[0] = initialOrbitTarget[0];
          orbitTarget[1] = initialOrbitTarget[1];
          orbitTarget[2] = initialOrbitTarget[2];
          console.log('[Camera] Reset to initial framing');
        } else if (keys.includes('g')) {
          isFloorVisible = !isFloorVisible;
          const floorMesh = realm.world.getComponent<Mesh3DComponent>(
            floorPlane.entityId,
            'Mesh3D'
          );
          if (floorMesh) {
            floorMesh.active = isFloorVisible;
            floorMesh.isDirty = true;
          }
          console.log(`[Ground Grid] ${isFloorVisible ? 'Shown' : 'Hidden'}`);
        }
      } else if (event.state === 'released') {
        for (const k of keys) pressedKeys.delete(k);
      }
    }
  });

  // Pointer drag & wheel orbit
  let isPointerDown = false;

  runtime.on('pointer', (event) => {
    if (event.type === 'button') {
      if (event.button === 'primary') {
        isPointerDown = event.state === 'pressed';
      }
    } else if (event.type === 'move' && isPointerDown) {
      const [dx, dy] = event.delta;
      orbitYaw -= dx * 0.008;
      orbitPitch = Math.max(
        -Math.PI / 2 + 0.05,
        Math.min(Math.PI / 2 - 0.05, orbitPitch + dy * 0.008)
      );
    } else if (event.type === 'scroll') {
      const scrollY =
        'lines' in event.delta
          ? event.delta.lines[1]
          : 'pixels' in event.delta
            ? event.delta.pixels[1] * 0.05
            : 0;
      orbitRadius = Math.max(0.1, orbitRadius * (scrollY > 0 ? 1.08 : 0.92));
    }
  });

  // Handle window lifecycle & focus
  runtime.on('window', (event) => {
    if (event.type === 'closeRequested') {
      shutdown('Window close requested');
    } else if (event.type === 'focusChanged' && !event.focused) {
      pressedKeys.clear();
    }
  });

  process.on('SIGINT', () => shutdown('SIGINT received'));

  // Main frame loop tick
  runtime.on('tick', ({ dt }) => {
    if (isExiting) return;
    totalFrames++;

    const isShift =
      pressedKeys.has('shift') || pressedKeys.has('shiftleft') || pressedKeys.has('shiftright');
    const speedMult = isShift ? 2.5 : 1.0;
    const orbitSpeed = 2.0 * speedMult;
    const zoomSpeed = 2.2 * speedMult;

    let hasUserInput = isPointerDown;

    // Horizontal Orbit: A / D or Left / Right
    if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) {
      orbitYaw -= orbitSpeed * dt;
      hasUserInput = true;
    }
    if (pressedKeys.has('d') || pressedKeys.has('arrowright')) {
      orbitYaw += orbitSpeed * dt;
      hasUserInput = true;
    }

    // Vertical Orbit: W / S or Up / Down
    if (pressedKeys.has('w') || pressedKeys.has('arrowup')) {
      orbitPitch = Math.min(Math.PI / 2 - 0.05, orbitPitch + orbitSpeed * dt);
      hasUserInput = true;
    }
    if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) {
      orbitPitch = Math.max(-Math.PI / 2 + 0.05, orbitPitch - orbitSpeed * dt);
      hasUserInput = true;
    }

    // Smooth Zoom In: E, +, =, PageUp
    if (
      pressedKeys.has('e') ||
      pressedKeys.has('+') ||
      pressedKeys.has('=') ||
      pressedKeys.has('pageup')
    ) {
      orbitRadius = Math.max(0.1, orbitRadius * Math.exp(-zoomSpeed * dt));
      hasUserInput = true;
    }

    // Smooth Zoom Out: Z, -, _, PageDown
    if (
      pressedKeys.has('z') ||
      pressedKeys.has('-') ||
      pressedKeys.has('_') ||
      pressedKeys.has('pagedown')
    ) {
      orbitRadius = Math.max(0.1, orbitRadius * Math.exp(zoomSpeed * dt));
      hasUserInput = true;
    }

    // Auto-rotate smoothly only when user is idle and turntable is active
    if (autoRotate && !hasUserInput) {
      orbitYaw += dt * 0.22;
    }

    updateCamera();

    if (opts.maxFrames !== undefined && totalFrames >= opts.maxFrames) {
      shutdown(`Reached target frame count of ${opts.maxFrames}`);
    }
  });

  runtime.start({ targetFps: 60 });

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (isExiting || !runtime.isRunning) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

runViewer().catch((err) => {
  console.error('\n✖ Fatal glTF Viewer Error:', err);
  process.exit(1);
});
