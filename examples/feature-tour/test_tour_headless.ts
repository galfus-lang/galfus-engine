import { GalfusBun } from '../../sdk/bun/galfus.ts';
import tourJsonData from './tour.json';
import type { TourConfig } from './types.ts';
import { buildRoomScene, makePalette, makeTexture, makeSound } from './procedural.ts';

console.log('==> [Test] Validating tour.json schema and contract...');
const tour = tourJsonData as unknown as TourConfig;

if (!tour.title || !tour.duration || tour.duration <= 0) {
  throw new Error(`Invalid tour configuration metadata: ${JSON.stringify(tour)}`);
}
if (!tour.rooms || tour.rooms.length === 0) {
  throw new Error('Tour must have at least one room.');
}
if (!tour.cameraPositionPath?.commands?.length) {
  throw new Error('Tour missing cameraPositionPath commands.');
}
if (!tour.cameraLookTargetPath?.commands?.length) {
  throw new Error('Tour missing cameraLookTargetPath commands.');
}

console.log(`✔ tour.json valid: ${tour.rooms.length} rooms, ${tour.duration}s total duration`);

console.log('==> [Test] Validating procedural factories...');
const pal = makePalette(0);
if (!pal.primary || pal.primary.length !== 4) {
  throw new Error('makePalette failed');
}
const tex = makeTexture(1337);
if (tex.data.byteLength !== 64 * 64 * 4) {
  throw new Error(`makeTexture unexpected size: ${tex.data.byteLength}`);
}
const wav = makeSound(1337, 440.0, 0.5);
if (wav.byteLength <= 44) {
  throw new Error('makeSound failed to produce valid WAV');
}
console.log('✔ Procedural factories produced valid textures, sounds, and palettes');

console.log('==> [Test] Running headless engine smoke test...');
const galfus = new GalfusBun();
galfus.platformInit();

const TARGET_ID = 1;
const REALM_3D = 10;
const REALM_2D = 20;
const INVOCATION_3D = 100;
const INVOCATION_2D = 101;
const CAM_3D = 1;
const PATH_POS = 401;
const PATH_LOOK = 402;

// Offscreen texture target for headless testing
galfus.multiverseCreateTarget(TARGET_ID, {
  kind: { type: 'texture', width: 512, height: 512, format: 'rgba8unorm' },
  size: [512, 512]
});

galfus.realm3dCreate(REALM_3D);
galfus.realm2dCreate(REALM_2D);

galfus.multiverseCreateInvocation(INVOCATION_3D, {
  realmId: REALM_3D,
  targetId: TARGET_ID,
  cameraSlot: 0,
  viewport: { anchorX: 'left', anchorY: 'top', width: { vw: 100 }, height: { vh: 50 } },
  clearColor: [0.1, 0.1, 0.1, 1.0]
});

galfus.multiverseCreateInvocation(INVOCATION_2D, {
  realmId: REALM_2D,
  targetId: TARGET_ID,
  cameraSlot: 0,
  viewport: { anchorX: 'left', anchorY: 'bottom', width: { vw: 100 }, height: { vh: 50 } },
  clearColor: [0.0, 0.0, 0.0, 1.0]
});

// Create Camera with look-at
const firstPos = tour.cameraPositionPath.commands[0];
const initPos = (firstPos && 'to' in firstPos ? firstPos.to : [0.0, 2.5, 7.0]) as [
  number,
  number,
  number
];
const firstLook = tour.cameraLookTargetPath.commands[0];
const initLook = (firstLook && 'to' in firstLook ? firstLook.to : [0.0, 1.2, 0.0]) as [
  number,
  number,
  number
];

galfus.realm3dCreateCamera(
  REALM_3D,
  CAM_3D,
  {
    fovY: 60.0,
    near: 0.1,
    far: 1000.0,
    cameraSlot: 0,
    lookAt: { target: initLook, up: [0, 1, 0] }
  },
  { position: initPos }
);

// Populate rooms
for (const room of tour.rooms) {
  buildRoomScene(REALM_3D, room, tour.defaultSeed, galfus);
}

// Bind path followers
galfus.animationCreatePathFollow(
  PATH_POS,
  tour.cameraPositionPath.commands,
  tour.cameraPositionPath.config
);
galfus.animationBindPathFollowTarget(PATH_POS, {
  kind: 'camera3DTransform',
  realmId: REALM_3D,
  cameraId: CAM_3D
});

galfus.animationCreatePathFollow(
  PATH_LOOK,
  tour.cameraLookTargetPath.commands,
  tour.cameraLookTargetPath.config
);
galfus.animationBindPathFollowTarget(PATH_LOOK, {
  kind: 'camera3DLookAt',
  realmId: REALM_3D,
  cameraId: CAM_3D
});

// Step animation forward
console.log('==> Stepping animation and verifying camera path updates...');
galfus.animationStep(4.0); // Step to Room 1 (startTime = 4.0s)

const lookAtState = galfus.realm3dGetCameraLookAt(REALM_3D, CAM_3D);
console.log('Camera LookAt State after 4.0s:', JSON.stringify(lookAtState));

if (!lookAtState.enabled || !lookAtState.target) {
  throw new Error(`Expected active camera lookAt target, got: ${JSON.stringify(lookAtState)}`);
}

// Dispatch frames
for (let f = 0; f < 5; f++) {
  galfus.multiverseResolve();
  galfus.multiverseDispatch(f, 0.016);
}

console.log('✔ Dispatch completed successfully');

// Teardown
galfus.animationDestroyPathFollow(PATH_POS);
galfus.animationDestroyPathFollow(PATH_LOOK);
try {
  galfus.animationDestroyTransition(5080);
} catch {}
try {
  galfus.animationDestroyTransition(5081);
} catch {}
try {
  galfus.animationDestroyTransition(5082);
} catch {}
galfus.realm3dDestroy(REALM_3D);
galfus.realm2dDestroy(REALM_2D);
galfus.multiverseDestroyTarget(TARGET_ID);

console.log('==> [Test] Testing runFeatureTour loop (headless 10 frames)...');
const { runFeatureTour } = await import('./tour_runner.ts');
await runFeatureTour({ headless: true, maxFrames: 10, fixedDelta: 0.016 });

console.log('✔ Headless smoke test completed with 100% success!\n');
