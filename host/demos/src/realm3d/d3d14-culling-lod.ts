/**
 * Realm 3D Demo 3D-14: Frustum/Distance Culling, Declarative LOD, Margins & Debug Observer Camera
 *
 * Split-screen layout:
 * - Left viewport (50%): Main perspective camera sweeping across the 3D arena.
 * - Right viewport (50%): Bird's-eye Debug Observer Camera with `cullCameraSlot: 0`,
 *   rendering ONLY what survives the main camera's frustum, `cullMargin`, `distanceRange` (LOD),
 *   and `cullingMode: 'alwaysRender'`.
 *
 * Controls:
 * - [Space] Pause / resume camera sweep
 * - [C] Toggle Debug Observer culling lock (`cullCameraSlot: 0` vs own frustum)
 * - [Esc] / [Q] Exit
 */
import { type Camera3DComponent, isKey, type Model3DComponent, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

function drawFrustumGizmo(
  drawLine: (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number, number]
  ) => void,
  camPos: [number, number, number],
  target: [number, number, number],
  fovDeg: number,
  aspect: number,
  nearDist: number,
  farDist: number
): void {
  const dx = target[0] - camPos[0];
  const dy = target[1] - camPos[1];
  const dz = target[2] - camPos[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const fx = dx / len,
    fy = dy / len,
    fz = dz / len;
  // right = normalize(cross(forward, up(0,1,0))) = (-fz, 0, fx)
  const rLen = Math.hypot(-fz, fx) || 1;
  const rx = -fz / rLen,
    ry = 0,
    rz = fx / rLen;
  // up = cross(right, forward)
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const tanHalf = Math.tan(((fovDeg * Math.PI) / 180) * 0.5);
  const corners = (d: number): [number, number, number][] => {
    const h = d * tanHalf;
    const w = h * aspect;
    const cx = camPos[0] + fx * d;
    const cy = camPos[1] + fy * d;
    const cz = camPos[2] + fz * d;
    return [
      [cx - rx * w + ux * h, cy - ry * w + uy * h, cz - rz * w + uz * h],
      [cx + rx * w + ux * h, cy + ry * w + uy * h, cz + rz * w + uz * h],
      [cx + rx * w - ux * h, cy + ry * w - uy * h, cz + rz * w - uz * h],
      [cx - rx * w - ux * h, cy - ry * w - uy * h, cz - rz * w - uz * h]
    ];
  };

  const n = corners(nearDist);
  const f = corners(farDist);
  const color: [number, number, number, number] = [0.2, 0.95, 1.0, 1.0];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    drawLine(n[i]!, n[j]!, color);
    drawLine(f[i]!, f[j]!, color);
    drawLine(n[i]!, f[i]!, color);
  }
}

function drawCircleGizmo(
  drawLine: (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number, number]
  ) => void,
  center: [number, number, number],
  radius: number,
  y: number,
  color: [number, number, number, number],
  segments = 48
): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    drawLine(
      [center[0] + Math.cos(a0) * radius, y, center[2] + Math.sin(a0) * radius],
      [center[0] + Math.cos(a1) * radius, y, center[2] + Math.sin(a1) * radius],
      color
    );
  }
}

export async function runDemo3d14(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames, size } = createDemoSession(
    'Galfus Host Demo: 3D-14 Culling, LOD & Debug Observer Camera',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    realm3d.setEnvironment({
      ambientColor: [0.28, 0.32, 0.4, 0.7],
      skybox: {
        mode: 'procedural',
        skyColor: [0.06, 0.1, 0.22, 1.0],
        horizonColor: [0.16, 0.22, 0.34, 1.0],
        groundColor: [0.05, 0.06, 0.08, 1.0]
      }
    });

    const mainFov = 50;
    const mainCam = realm3d.createCamera(
      { fovY: mainFov, near: 0.5, far: 120, cameraSlot: 0 },
      { position: [0, 3.0, 18] }
    );
    // True top-down overhead Debug Camera (orthographic, looking straight down -Y)
    const debugCam = realm3d.createCamera(
      {
        kind: 'orthographic',
        orthoScale: 62,
        near: 1.0,
        far: 120,
        cameraSlot: 1,
        cullCameraSlot: 0
      },
      {
        position: [0, 60, 0],
        // Rotate -90 deg around +X: forward (0,0,-1) -> (0,-1,0) straight down, up (0,1,0) -> (0,0,-1)
        rotation: utils3D.quatFromAxisAngle([1, 0, 0], -Math.PI / 2)
      }
    );

    // Lights
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.96, 0.9], intensity: 2.2, castShadow: true },
      { position: [12, 22, 14], rotation: utils3D.quatFromLookAt([12, 22, 14], [0, 0, 0]) }
    );

    // Geometries
    const geoFloor = realm3d.createGeometry({ kind: 'plane', width: 64, depth: 64 });
    const geoSphereHi = realm3d.createGeometry({
      kind: 'sphere',
      radius: 0.75,
      rings: 16,
      sectors: 24
    });
    const geoCubeMid = realm3d.createGeometry({ kind: 'cube', size: 1.25 });
    const geoPyramidLow = realm3d.createGeometry({
      kind: 'pyramid',
      width: 1.3,
      depth: 1.3,
      height: 1.5
    });
    const geoWall = realm3d.createGeometry({ kind: 'cube', size: 1.0 });

    // Materials
    const matFloor = realm3d.createMaterial({
      baseColor: [0.16, 0.18, 0.22, 1.0],
      roughness: 0.85
    });
    const matLod0 = realm3d.createMaterial({
      baseColor: [0.2, 0.92, 0.42, 1.0], // Green = LOD0 [0, 14)
      roughness: 0.35
    });
    const matLod1 = realm3d.createMaterial({
      baseColor: [0.98, 0.82, 0.2, 1.0], // Yellow = LOD1 [14, 26)
      roughness: 0.45
    });
    const matLod2 = realm3d.createMaterial({
      baseColor: [0.95, 0.32, 0.24, 1.0], // Red = LOD2 [26, 40)
      roughness: 0.6
    });
    const matMargin = realm3d.createMaterial({
      baseColor: [0.15, 0.92, 0.96, 1.0], // Cyan = cullMargin: 4.0
      roughness: 0.3
    });
    const matAlways = realm3d.createMaterial({
      baseColor: [0.95, 0.2, 0.9, 1.0], // Magenta = alwaysRender
      emissiveColor: [0.45, 0.08, 0.42, 1.0],
      roughness: 0.25
    });
    const matWall = realm3d.createMaterial({
      baseColor: [0.35, 0.4, 0.5, 1.0],
      roughness: 0.65
    });

    // Always-rendered floor reference
    realm3d.createModel(
      {
        geometryId: geoFloor.geometryId,
        materialId: matFloor.materialId,
        cullingMode: 'alwaysRender',
        isOccluder: true
      },
      { position: [0, 0, 0] }
    );

    // Central occluder wall demonstrating Depth Pre-Pass + GPU Hi-Z Occlusion Culling
    realm3d.createModel(
      {
        geometryId: geoWall.geometryId,
        materialId: matWall.materialId,
        isOccluder: true
      },
      { position: [0, 3.0, 0], scale: [12, 6.0, 1.0] }
    );

    // 7x7 grid of 3-band LOD objects: [0,14) sphere, [14,26) cube, [26,40) pyramid, >=40 culled
    for (let gx = -3; gx <= 3; gx++) {
      for (let gz = -3; gz <= 3; gz++) {
        if (gx === 0 && gz === 0) continue;
        const pos: [number, number, number] = [gx * 5.0, 0.85, gz * 5.0];
        realm3d.createModel(
          {
            geometryId: geoSphereHi.geometryId,
            materialId: matLod0.materialId,
            distanceRange: [0, 14]
          },
          { position: pos }
        );
        realm3d.createModel(
          {
            geometryId: geoCubeMid.geometryId,
            materialId: matLod1.materialId,
            distanceRange: [14, 26]
          },
          { position: pos }
        );
        realm3d.createModel(
          {
            geometryId: geoPyramidLow.geometryId,
            materialId: matLod2.materialId,
            distanceRange: [26, 40]
          },
          { position: pos }
        );
      }
    }

    // Outer ring of cyan pillars with generous cullMargin (stays visible beyond frustum edge)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      realm3d.createModel(
        {
          geometryId: geoCubeMid.geometryId,
          materialId: matMargin.materialId,
          cullMargin: 5.0
        },
        { position: [Math.cos(a) * 21, 1.5, Math.sin(a) * 21], scale: [1, 3, 1] }
      );
    }

    // Magenta beacons with cullingMode: 'alwaysRender' (visible even behind camera & beyond distance)
    for (const pos of [
      [-22, 2.5, -22],
      [22, 2.5, -22],
      [-22, 2.5, 22],
      [22, 2.5, 22]
    ] as [number, number, number][]) {
      realm3d.createModel(
        {
          geometryId: geoSphereHi.geometryId,
          materialId: matAlways.materialId,
          cullingMode: 'alwaysRender',
          distanceRange: [0, 1] // Ignored because alwaysRender
        },
        { position: pos, scale: [1.4, 1.4, 1.4] }
      );
    }

    // Split-screen Multiverse invocations: Left = Main Camera, Right = Debug Observer Camera
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 0,
      viewport: { anchorX: 'left', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      filters: [],
      zIndex: 0,
      enabled: true
    });
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { anchorX: 'right', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      filters: [],
      zIndex: 1,
      enabled: true
    });

    let paused = false;
    let debugCullLock = true;
    let t = 0;

    runtime.on('keyboard', (e) => {
      if (e.type !== 'input' || e.state !== 'pressed') return;
      if (isKey(e, 'Space')) paused = !paused;
      if (isKey(e, 'KeyC')) {
        debugCullLock = !debugCullLock;
        const camComp = realm3d.world.getComponent<Camera3DComponent>(
          debugCam.entityId,
          'Camera3D'
        );
        if (camComp) {
          camComp.desc.cullCameraSlot = debugCullLock ? 0 : undefined;
          camComp.isDirty = true;
        }
        console.log(
          `[3D-14] Debug Observer culling lock: ${debugCullLock ? 'SLOT 0 (Main Frustum)' : 'OWN FRUSTUM'}`
        );
      }
    });

    const halfAspect = (size[0] * 0.5) / Math.max(1, size[1]);

    runtime.on('tick', ({ dt }) => {
      if (!paused) t += dt;
      const camPos: [number, number, number] = [
        Math.sin(t * 0.45) * 14,
        3.2,
        Math.cos(t * 0.35) * 16 + 4
      ];
      const lookTarget: [number, number, number] = [Math.sin(t * 0.8) * 10, 0.8, -6];
      const mainModel = realm3d.world.getComponent<Model3DComponent>(mainCam.entityId, 'Model3D');
      if (mainModel) {
        mainModel.setPosition(camPos[0], camPos[1], camPos[2]);
        const rot = utils3D.quatFromLookAt(camPos, lookTarget);
        mainModel.setRotation(rot[0], rot[1], rot[2], rot[3]);
      }

      // Draw Main Camera's frustum cone + LOD distance rings (14m, 26m, 40m) visible from top-down Debug view
      const lineFn = (
        a: [number, number, number],
        b: [number, number, number],
        c: [number, number, number, number]
      ) => realm3d.drawLine(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], c[3]);
      drawFrustumGizmo(lineFn, camPos, lookTarget, mainFov, halfAspect, 0.5, 40.0);
      drawCircleGizmo(lineFn, camPos, 14.0, 0.2, [0.2, 0.92, 0.42, 0.9]);
      drawCircleGizmo(lineFn, camPos, 26.0, 0.2, [0.98, 0.82, 0.2, 0.9]);
      drawCircleGizmo(lineFn, camPos, 40.0, 0.2, [0.95, 0.32, 0.24, 0.9]);
    });

    console.log(
      '[3D-14] Left: Main Camera | Right: Debug Observer (cullCameraSlot: 0). Green=LOD0 [0,14), Yellow=LOD1 [14,26), Red=LOD2 [26,40), Cyan=cullMargin 5m, Magenta=alwaysRender. Press [C] to toggle cull lock, [Space] to pause.'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['Escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
