import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { GalfusNode } from '../../../../sdk/node/galfus.ts';
import type { TourConfig } from '../../types.ts';

const rootDir = resolve(import.meta.dir, '../../../..');
const nodeAddonPath = resolve(rootDir, 'build/cargo-target/debug/galfus.node');
const soPath = resolve(rootDir, 'build/cargo-target/debug/libgalfus_native.so');
const libPath = existsSync(nodeAddonPath) ? nodeAddonPath : soPath;

const tourPath = resolve(import.meta.dir, '../../tour.json');
const tour: TourConfig = JSON.parse(readFileSync(tourPath, 'utf-8'));

console.log(`=== Node Runner: ${tour.title} (v${tour.version}) ===`);

const galfus = new GalfusNode(libPath);
try {
  galfus.platformInit();
} catch {}

const TARGET_ID = 1;
const REALM_3D = 10;
const REALM_2D = 20;

galfus.multiverseCreateTarget(TARGET_ID, {
  kind: { type: 'texture', width: 640, height: 480, format: 'rgba8unorm' },
  size: [640, 480]
});

galfus.realm3dCreate(REALM_3D);
galfus.realm2dCreate(REALM_2D);

galfus.realm3dCreateCamera(
  REALM_3D,
  1,
  {
    fovY: 60.0,
    near: 0.1,
    far: 1000.0,
    cameraSlot: 0,
    lookAt: { target: [0.0, 1.2, 0.0], up: [0.0, 1.0, 0.0] }
  },
  { position: [0.0, 2.5, 7.0] }
);

galfus.multiverseCreateInvocation(100, {
  realmId: REALM_3D,
  targetId: TARGET_ID,
  cameraSlot: 0,
  viewport: { anchorX: 'left', anchorY: 'top', width: { vw: 100 }, height: { vh: 50 } },
  clearColor: [0.06, 0.08, 0.12, 1.0]
});

galfus.multiverseCreateInvocation(101, {
  realmId: REALM_2D,
  targetId: TARGET_ID,
  cameraSlot: 0,
  viewport: { anchorX: 'left', anchorY: 'bottom', width: { vw: 100 }, height: { vh: 50 } },
  clearColor: [0.02, 0.03, 0.05, 1.0]
});

// Setup paths
galfus.animationCreatePathFollow(
  401,
  tour.cameraPositionPath.commands,
  tour.cameraPositionPath.config
);
galfus.animationBindPathFollowTarget(401, {
  kind: 'camera3DTransform',
  realmId: REALM_3D,
  cameraId: 1
});

galfus.animationCreatePathFollow(
  402,
  tour.cameraLookTargetPath.commands,
  tour.cameraLookTargetPath.config
);
galfus.animationBindPathFollowTarget(402, {
  kind: 'camera3DLookAt',
  realmId: REALM_3D,
  cameraId: 1
});

for (let i = 0; i < 5; i++) {
  galfus.animationStep(0.016);
  galfus.multiverseResolve();
  galfus.multiverseDispatch(i, 0.016);
}

galfus.animationDestroyPathFollow(401);
galfus.animationDestroyPathFollow(402);
galfus.realm3dDestroy(REALM_3D);
galfus.realm2dDestroy(REALM_2D);
galfus.multiverseDestroyTarget(TARGET_ID);
galfus.platformShutdown();

console.log('✔ Node feature tour runner completed successfully!');
