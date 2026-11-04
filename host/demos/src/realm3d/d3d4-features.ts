/**
 * Realm 3D Demo 3D-4: Primitives (Torus, Capsule, Cylinder, Pyramid), Bloom HDR, Gizmos & Compute Light Culling
 */
import { isKey, type Model3DComponent, quat } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const POS_TORUS: [number, number, number] = [-4.5, 2.2, 0.0];
const POS_CAPSULE: [number, number, number] = [4.5, 2.2, 0.0];
const POS_CYLINDER: [number, number, number] = [0.0, 1.8, -4.5];
const POS_PYRAMID: [number, number, number] = [0.0, 1.2, 4.5];
const POS_CORE: [number, number, number] = [0.0, 2.5, 0.0];

const LIGHT_PALETTE: [number, number, number][] = [
  [1.0, 0.25, 0.35],
  [0.2, 0.9, 1.0],
  [1.0, 0.85, 0.2],
  [0.65, 0.25, 1.0],
  [0.2, 1.0, 0.45],
  [1.0, 0.5, 0.15],
  [0.35, 0.55, 1.0],
  [1.0, 0.25, 0.85]
];

export async function runDemo3d4(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Engine - Demo 3D-4: 3D Advanced Features (Bloom, Gizmos & Light Culling)',
    options,
    [1024, 768]
  );

  try {
    const realm3d = runtime.createRealm3D();
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { width: { vw: 100 }, height: { vh: 100 } },
      clearColor: [0.015, 0.015, 0.025, 1.0]
    });

    let bloomEnabled = true;
    let bloomIntensity = 1.6;
    let bloomThreshold = 0.75;
    let gizmosEnabled = true;
    let autoOrbit = true;

    const updateEnv = () => {
      realm3d.setEnvironment({
        ambientColor: [0.05, 0.06, 0.09, 1.0],
        clearColor: [0.015, 0.015, 0.025, 1.0],
        exposure: 1.15,
        bloom: {
          enabled: bloomEnabled,
          threshold: bloomThreshold,
          knee: 0.5,
          intensity: bloomIntensity,
          scatter: 0.85
        },
        ssao: { enabled: true, radius: 0.5, intensity: 0.75 }
      });
    };
    updateEnv();

    let camDistance = 15.0;
    let camAngle = 0.5;
    const camHeight = 6.5;
    const camera = realm3d.createCamera(
      { kind: 'perspective', fovY: 52, near: 0.1, far: 500, cameraSlot: 1 },
      { position: [Math.sin(camAngle) * camDistance, camHeight, Math.cos(camAngle) * camDistance] }
    );
    realm3d.setCameraLookAt(camera, { target: [0, 1.2, 0] });

    const { materialId: groundMat } = realm3d.createMaterial({
      baseColor: [0.15, 0.17, 0.22, 1.0],
      metallic: 0.15,
      roughness: 0.65
    });
    const { materialId: torusMat } = realm3d.createMaterial({
      baseColor: [1.0, 0.82, 0.3, 1.0],
      metallic: 0.95,
      roughness: 0.18
    });
    const { materialId: capsuleMat } = realm3d.createMaterial({
      surfaceType: 'transparent',
      side: 'double',
      baseColor: [0.15, 0.75, 0.95, 0.58],
      metallic: 0.6,
      roughness: 0.25
    });
    const { materialId: cylinderMat } = realm3d.createMaterial({
      baseColor: [0.82, 0.85, 0.9, 1.0],
      metallic: 0.88,
      roughness: 0.22
    });
    const { materialId: pyramidMat } = realm3d.createMaterial({
      surfaceType: 'masked',
      alphaCutoff: 0.75,
      baseColor: [0.95, 0.18, 0.28, 0.9],
      metallic: 0.3,
      roughness: 0.3
    });
    const { materialId: glowCoreMat } = realm3d.createMaterial({
      surfaceType: 'additive',
      baseColor: [1.0, 1.0, 1.0, 0.45],
      emissiveColor: [4.0, 2.2, 8.5, 1.0]
    });

    realm3d.createPlane(36, 36, groundMat, { position: [0, 0, 0] });
    const torus = realm3d.createTorus(1.2, 0.36, 36, 18, torusMat, { position: POS_TORUS });
    const capsule = realm3d.createCapsule(0.65, 0.3, 6, 12, capsuleMat, { position: POS_CAPSULE });
    const cylinder = realm3d.createCylinder(0.75, 2.2, 32, cylinderMat, { position: POS_CYLINDER });
    const pyramid = realm3d.createPyramid(1.8, 1.8, 1.8, pyramidMat, { position: POS_PYRAMID });
    const core = realm3d.createSphere(
      0.85,
      16,
      32,
      glowCoreMat,
      { position: POS_CORE },
      { castShadow: false }
    );

    const sunRot = quat.create();
    quat.fromLookAt(sunRot, [10, 15, 10], [0, 0, 0]);
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.95, 0.88], intensity: 1.2, castShadow: true },
      { position: [0, 10, 0], rotation: sunRot }
    );

    const orbitLightModels: Model3DComponent[] = [];
    for (let i = 0; i < 8; i++) {
      const l = realm3d.createLight(
        { kind: 'point', color: LIGHT_PALETTE[i]!, intensity: 4.5, range: 6.5, castShadow: false },
        { position: [0, 1, 0] }
      );
      orbitLightModels.push(realm3d.world.getComponent<Model3DComponent>(l, 'Model3D')!);
    }

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'b')) {
        bloomEnabled = !bloomEnabled;
        updateEnv();
      } else if (isKey(ev, 'g')) {
        gizmosEnabled = !gizmosEnabled;
        if (!gizmosEnabled) realm3d.clearGizmos();
      } else if (isKey(ev, 'o')) {
        autoOrbit = !autoOrbit;
      } else if (isKey(ev, '1')) {
        bloomIntensity = Math.max(0.2, bloomIntensity - 0.2);
        updateEnv();
      } else if (isKey(ev, '2')) {
        bloomIntensity = Math.min(5.0, bloomIntensity + 0.2);
        updateEnv();
      }
    });

    const camModel = realm3d.world.getComponent<Model3DComponent>(camera.entityId, 'Model3D')!;
    const mTorus = realm3d.world.getComponent<Model3DComponent>(torus.entityId, 'Model3D')!;
    const mCapsule = realm3d.world.getComponent<Model3DComponent>(capsule.entityId, 'Model3D')!;
    const mCylinder = realm3d.world.getComponent<Model3DComponent>(cylinder.entityId, 'Model3D')!;
    const mPyramid = realm3d.world.getComponent<Model3DComponent>(pyramid.entityId, 'Model3D')!;
    const mCore = realm3d.world.getComponent<Model3DComponent>(core.entityId, 'Model3D')!;
    const q = quat.create();

    runtime.on('tick', ({ timeMs, dt }) => {
      const t = timeMs * 0.001;
      if (autoOrbit) camAngle += dt * 0.45;
      camModel.setPosition(
        Math.sin(camAngle) * camDistance,
        camHeight,
        Math.cos(camAngle) * camDistance
      );

      quat.fromEuler(q, t * 0.9, t * 1.2, 0);
      mTorus.setRotation(q);
      mCapsule.setPosition(POS_CAPSULE[0], POS_CAPSULE[1] + Math.sin(t * 2) * 0.3, POS_CAPSULE[2]);
      quat.fromEuler(q, t * 0.7, 0, 0);
      mCylinder.setRotation(q);
      quat.fromEuler(q, 0, t * 1.1, 0);
      mPyramid.setRotation(q);
      const coreBob = Math.sin(t * 2.5) * 0.3;
      mCore.setPosition(POS_CORE[0], POS_CORE[1] + coreBob, POS_CORE[2]);

      if (gizmosEnabled) {
        realm3d.clearGizmos();
        realm3d.drawLine(0, 0.05, 0, 2.5, 0.05, 0, 1, 0.1, 0.1, 1);
        realm3d.drawLine(0, 0.05, 0, 0, 2.55, 0, 0.1, 1, 0.1, 1);
        realm3d.drawLine(0, 0.05, 0, 0, 0.05, 2.5, 0.1, 0.3, 1, 1);
        realm3d.drawAabb(
          POS_CORE[0] - 0.95,
          POS_CORE[1] + coreBob - 0.95,
          POS_CORE[2] - 0.95,
          POS_CORE[0] + 0.95,
          POS_CORE[1] + coreBob + 0.95,
          POS_CORE[2] + 0.95,
          0.75,
          0.35,
          1.0,
          0.9
        );
      }

      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2.0 + t * 0.8;
        const radius = 6.8 + Math.sin(t * 1.2 + i) * 1.5;
        const lx = Math.cos(angle) * radius;
        const ly = Math.max(0.4, 2.0 + Math.sin(t * 1.6 + i * 1.5) * 1.8);
        const lz = Math.sin(angle) * radius;
        orbitLightModels[i]!.setPosition(lx, ly, lz);
        if (gizmosEnabled) {
          const [r, g, b] = LIGHT_PALETTE[i]!;
          realm3d.drawLine(
            lx,
            ly,
            lz,
            POS_CORE[0],
            POS_CORE[1] + coreBob,
            POS_CORE[2],
            r,
            g,
            b,
            0.3
          );
        }
      }
    });

    console.log('[3d4] Ready. B: toggle Bloom | G: toggle Gizmos | O: auto-orbit | Esc: exit.');
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
