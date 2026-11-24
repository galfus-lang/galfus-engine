/**
 * Realm 2D Demo 2D-3: Viewport AABB Culling, Dynamic Zoom-Aware Distance LOD & Debug Observer Camera
 *
 * Split-screen layout:
 * - Left viewport (50%): Main 2D camera panning & pulsing zoom (`orthoScale` 8..28).
 * - Right viewport (50%): Zoomed-out Debug Observer 2D camera (`orthoScale: 46`) with `cullCameraSlot: 0`,
 *   showing ONLY sprites that survive the main camera's viewport AABB, `cullMargin`,
 *   dynamic distance `hypot(dx, dy, orthoScale)` LOD bands, and `cullingMode: 'alwaysRender'`.
 *
 * Controls:
 * - [Space] Pause / resume camera motion & zoom pulse
 * - [C] Toggle Debug Observer culling lock (`cullCameraSlot: 0` vs own viewport)
 * - [Esc] / [Q] Exit
 */
import { type Camera2DComponent, isKey, type Model2DComponent } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export async function runDemo2d3(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames, size } = createDemoSession(
    'Galfus Host Demo: 2D-3 Viewport Culling, Zoom-LOD & Debug Observer',
    options,
    [1280, 720]
  );

  try {
    const realm2d = runtime.createRealm2D();

    const mainCam = realm2d.createCamera(
      { orthoScale: 12, near: -100, far: 100, cameraSlot: 0, active: true },
      { position: [0, 0] }
    );
    const debugCam = realm2d.createCamera(
      { orthoScale: 52, near: -100, far: 100, cameraSlot: 1, active: true, cullCameraSlot: 0 },
      { position: [0, 0] }
    );

    // Opaque materials exercise Reverse-Z Early-Z front-to-back rejection
    const matLod0 = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.2, 0.92, 0.42, 1.0] // Green: effective dist [0, 15)
    });
    const matLod1 = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.98, 0.82, 0.2, 1.0] // Yellow: effective dist [15, 24)
    });
    const matLod2 = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.35, 0.25, 1.0] // Red: effective dist [24, 34)
    });
    const matMargin = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.15, 0.92, 0.96, 1.0] // Cyan: cullMargin 4.0
    });
    const matAlways = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.2, 0.9, 1.0] // Magenta: alwaysRender
    });
    const matBorder = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.95, 0.98, 1.0, 1.0] // White wireframe border of Main Camera viewport
    });
    const matOccluder = realm2d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.22, 0.26, 0.34, 1.0] // Solid opaque 2D occluder panel (culls sprites behind it)
    });

    // 9x9 grid of 2D LOD sprites driven by dynamic effective distance hypot(dx, dy, orthoScale)
    for (let gx = -4; gx <= 4; gx++) {
      for (let gy = -4; gy <= 4; gy++) {
        const pos: [number, number] = [gx * 3.5, gy * 3.5];
        realm2d.createSprite(
          {
            dimensions: [2.2, 2.2],
            materialId: matLod0,
            castShadow: false,
            receiveShadow: false,
            distanceRange: [0, 15]
          },
          { position: pos, zLayer: 1 }
        );
        realm2d.createSprite(
          {
            dimensions: [1.8, 1.8],
            materialId: matLod1,
            castShadow: false,
            receiveShadow: false,
            distanceRange: [15, 24]
          },
          { position: pos, zLayer: 1 }
        );
        realm2d.createSprite(
          {
            dimensions: [1.3, 1.3],
            materialId: matLod2,
            castShadow: false,
            receiveShadow: false,
            distanceRange: [24, 34]
          },
          { position: pos, zLayer: 1 }
        );
      }
    }

    // Ring of cyan sprites with cullMargin: 4.0 (stay visible outside main viewport border)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      realm2d.createSprite(
        {
          dimensions: [1.6, 1.6],
          materialId: matMargin,
          castShadow: false,
          receiveShadow: false,
          cullMargin: 4.0
        },
        { position: [Math.cos(a) * 18, Math.sin(a) * 18], zLayer: 2 }
      );
    }

    // 4 magenta corner beacons with alwaysRender
    for (const pos of [
      [-19, -19],
      [19, -19],
      [-19, 19],
      [19, 19]
    ] as [number, number][]) {
      realm2d.createSprite(
        {
          dimensions: [2.0, 2.0],
          materialId: matAlways,
          castShadow: false,
          receiveShadow: false,
          cullingMode: 'alwaysRender',
          distanceRange: [0, 0.1] // Ignored because alwaysRender
        },
        { position: pos, zLayer: 3 }
      );
    }

    // Solid opaque occluder panel at zLayer 5 (culls zLayer 1 sprites completely behind it)
    realm2d.createSprite(
      {
        dimensions: [7.5, 7.5],
        materialId: matOccluder,
        castShadow: false,
        receiveShadow: false
      },
      { position: [0, 0], zLayer: 5 }
    );

    // 4 thin white bars visualizing the Main Camera's viewport rectangle in the Debug view
    const borderTop = realm2d.createSprite(
      {
        dimensions: [1, 0.25],
        materialId: matBorder,
        castShadow: false,
        receiveShadow: false,
        cullingMode: 'alwaysRender'
      },
      { position: [0, 0], zLayer: 10 }
    );
    const borderBottom = realm2d.createSprite(
      {
        dimensions: [1, 0.25],
        materialId: matBorder,
        castShadow: false,
        receiveShadow: false,
        cullingMode: 'alwaysRender'
      },
      { position: [0, 0], zLayer: 10 }
    );
    const borderLeft = realm2d.createSprite(
      {
        dimensions: [0.25, 1],
        materialId: matBorder,
        castShadow: false,
        receiveShadow: false,
        cullingMode: 'alwaysRender'
      },
      { position: [0, 0], zLayer: 10 }
    );
    const borderRight = realm2d.createSprite(
      {
        dimensions: [0.25, 1],
        materialId: matBorder,
        castShadow: false,
        receiveShadow: false,
        cullingMode: 'alwaysRender'
      },
      { position: [0, 0], zLayer: 10 }
    );

    // Split-screen Multiverse invocations
    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 0,
      viewport: { anchorX: 'left', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      filters: [],
      zIndex: 0,
      enabled: true,
      clearColor: [0.06, 0.08, 0.12, 1.0]
    });
    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { anchorX: 'right', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      filters: [],
      zIndex: 1,
      enabled: true,
      clearColor: [0.04, 0.05, 0.08, 1.0]
    });

    let paused = false;
    let debugCullLock = true;
    let t = 0;

    runtime.on('keyboard', (e) => {
      if (e.type !== 'input' || e.state !== 'pressed') return;
      if (isKey(e, 'Space')) paused = !paused;
      if (isKey(e, 'KeyC')) {
        debugCullLock = !debugCullLock;
        const camComp = realm2d.world.getComponent<Camera2DComponent>(
          debugCam.entityId,
          'Camera2D'
        );
        if (camComp) {
          camComp.desc.cullCameraSlot = debugCullLock ? 0 : undefined;
          camComp.isDirty = true;
        }
        console.log(
          `[2D-3] Debug Observer culling lock: ${debugCullLock ? 'SLOT 0 (Main Viewport)' : 'OWN VIEWPORT'}`
        );
      }
    });

    const halfAspect = (size[0] * 0.5) / Math.max(1, size[1]);

    runtime.on('tick', ({ dt }) => {
      if (!paused) t += dt;
      const cx = Math.sin(t * 0.5) * 9.0;
      const cy = Math.cos(t * 0.35) * 7.0;
      const orthoScale = 18.0 + Math.sin(t * 0.7) * 10.0; // Pulses between 8 and 28!

      const mainModel = realm2d.world.getComponent<Model2DComponent>(mainCam.entityId, 'Model2D');
      mainModel?.setPosition(cx, cy);

      const mainCamComp = realm2d.world.getComponent<Camera2DComponent>(
        mainCam.entityId,
        'Camera2D'
      );
      if (mainCamComp) {
        mainCamComp.desc.orthoScale = orthoScale;
        mainCamComp.isDirty = true;
      }

      // Update Main Camera viewport rectangle bars
      const halfH = orthoScale * 0.5;
      const halfW = halfH * halfAspect;
      const mTop = realm2d.world.getComponent<Model2DComponent>(borderTop, 'Model2D');
      const mBot = realm2d.world.getComponent<Model2DComponent>(borderBottom, 'Model2D');
      const mLeft = realm2d.world.getComponent<Model2DComponent>(borderLeft, 'Model2D');
      const mRight = realm2d.world.getComponent<Model2DComponent>(borderRight, 'Model2D');
      mTop?.setTRS([cx, cy + halfH], 0, [halfW * 2, 1]);
      mBot?.setTRS([cx, cy - halfH], 0, [halfW * 2, 1]);
      mLeft?.setTRS([cx - halfW, cy], 0, [1, halfH * 2]);
      mRight?.setTRS([cx + halfW, cy], 0, [1, halfH * 2]);
    });

    console.log(
      '[2D-3] Left: Main Camera (panning + zoom pulse) | Right: Debug Observer (cullCameraSlot: 0). Green=LOD0 [0,15), Yellow=LOD1 [15,24), Red=LOD2 [24,34), Cyan=cullMargin 4, Magenta=alwaysRender. Press [C] to toggle cull lock, [Space] to pause.'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['Escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
