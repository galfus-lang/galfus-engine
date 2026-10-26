import { extractKey } from '../../scripts/demos/utils.ts';
import type { RoomMarker, TourConfig } from './types.ts';
import tourJsonData from './tour.json';
import { buildRoomScene, makeTexture, makeSound, computeBonePalette } from './procedural.ts';
import { renderCompanionPanelSvg } from './panel_svg.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const REALM_2D = 20;
const INVOCATION_3D = 100;
const INVOCATION_2D = 101;
const CAMERA_3D_ID = 1;
const CAMERA_2D_ID = 1;
const SVG_HUD_ID = 1;
const PATH_CAMERA_POS_ID = 401;
const PATH_CAMERA_LOOK_ID = 402;
const SOUND_ID = 501;

/** Playback controls exposed to hosts that drive the tour from their own UI. */
export interface TourController {
  togglePause(): void;
  next(): void;
  previous(): void;
  restart(): void;
  stop(): void;
  getState(): TourFrameState;
}

/** Snapshot of the playback state reported after every frame. */
export interface TourFrameState {
  roomIndex: number;
  paused: boolean;
  tourClock: number;
  duration: number;
}

export interface TourRunnerOptions {
  /** Engine binding instance (Bun FFI, Node-API, browser WASM, ...). */
  engine: any;
  headless?: boolean;
  maxFrames?: number;
  fixedDelta?: number;
  activeBinding?: string;
  /** Extra window configuration merged into `windowCreate` (e.g. `canvasId` in the browser). */
  windowConfig?: Record<string, unknown>;
  /** Awaited at the end of every frame; browsers use it to wait for `requestAnimationFrame`. */
  nextFrame?: () => Promise<void>;
  /** Called once playback controls are available. */
  onReady?: (controller: TourController) => void;
  /** Called after every frame with the current playback state. */
  onFrame?: (state: TourFrameState) => void;
}

export async function runFeatureTour(options: TourRunnerOptions): Promise<void> {
  const tour = tourJsonData as unknown as TourConfig;
  const activeBinding = options.activeBinding ?? 'Bun / FFI';
  console.log(`=== ${tour.title} [${activeBinding}] (v${tour.version}) ===\n`);

  const galfus = options.engine;
  try {
    galfus.platformInit();
  } catch {}

  const windowId = 1;
  const requestedSize = options.windowConfig?.size as [number, number] | undefined;
  const initialWidth = requestedSize?.[0] ?? 1024;
  const initialHeight = requestedSize?.[1] ?? 768;

  if (!options.headless) {
    galfus.windowCreate({
      id: windowId,
      title: `${tour.title} — Cross-Binding Tour`,
      size: [initialWidth, initialHeight],
      resizable: true,
      decorations: true,
      ...options.windowConfig
    });
    await galfus.multiverseAttachWindow(windowId);
  }

  // 1. Create Target (Window swapchain or headless offscreen texture)
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: options.headless
      ? { type: 'texture', width: initialWidth, height: initialHeight, format: 'rgba8unorm' }
      : { type: 'window', windowId }
  });

  // 2. Create Realms
  galfus.realm3dCreate(REALM_3D);
  galfus.realm2dCreate(REALM_2D);

  // 3. Multiverse Invocations: Top 50vh = 3D, Bottom 50vh = 2D
  galfus.multiverseCreateInvocation(INVOCATION_3D, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 0,
    viewport: {
      anchorX: 'left',
      anchorY: 'top',
      width: { vw: 100 },
      height: { vh: 50 }
    },
    clearColor: [0.06, 0.08, 0.12, 1.0],
    enabled: true,
    zIndex: 0
  });

  galfus.multiverseCreateInvocation(INVOCATION_2D, {
    realmId: REALM_2D,
    targetId: TARGET_WINDOW,
    cameraSlot: 0,
    viewport: {
      anchorX: 'left',
      anchorY: 'bottom',
      width: { vw: 100 },
      height: { vh: 50 }
    },
    clearColor: [0.08, 0.1, 0.15, 1.0],
    enabled: true,
    zIndex: 1
  });

  // 3b. Bright 2D Ambient Light for illuminated SVG Vector Rendering
  galfus.realm2dCreateLight(
    REALM_2D,
    1,
    {
      color: [1.0, 1.0, 1.0],
      intensity: 1.0,
      range: 1000.0,
      active: true
    },
    { position: [0.0, 0.0] }
  );

  // 4. Cameras
  const firstPos = tour.cameraPositionPath.commands[0];
  const initialCamPos = (firstPos && 'to' in firstPos ? firstPos.to : [0.0, 2.5, 7.0]) as [
    number,
    number,
    number
  ];

  const firstLook = tour.cameraLookTargetPath.commands[0];
  const initialCamLook = (firstLook && 'to' in firstLook ? firstLook.to : [0.0, 1.2, 0.0]) as [
    number,
    number,
    number
  ];

  galfus.realm3dCreateCamera(
    REALM_3D,
    CAMERA_3D_ID,
    {
      fovY: 60.0,
      near: 0.1,
      far: 1000.0,
      cameraSlot: 0,
      lookAt: {
        target: initialCamLook,
        up: [0.0, 1.0, 0.0]
      }
    },
    { position: initialCamPos }
  );

  galfus.realm2dCreateCamera(
    REALM_2D,
    CAMERA_2D_ID,
    { orthoScale: 240, cameraSlot: 0 },
    { position: [0.0, 0.0] }
  );

  // 5. Environment & Procedural Skybox on Realm3D
  galfus.realm3dSetEnvironment(REALM_3D, {
    ambientColor: [0.15, 0.18, 0.22, 1.0],
    exposure: 1.1,
    skybox: {
      mode: 'procedural',
      skyColor: [0.2, 0.4, 0.7, 1.0],
      horizonColor: [0.55, 0.65, 0.75, 1.0],
      groundColor: [0.06, 0.08, 0.1, 1.0],
      sunDirection: [0.6, 0.8, 0.3, 0.0],
      sunColor: [1.0, 0.95, 0.85, 2.0],
      intensity: 1.2
    }
  });

  // 6. Build procedural 3D exhibits for each room
  for (const room of tour.rooms) {
    buildRoomScene(REALM_3D, room, tour.defaultSeed, galfus);
  }

  // 7. Synthesize and load spatial sound
  try {
    const soundBytes = makeSound(tour.defaultSeed, 440.0, 1.0);
    galfus.audioLoadSound(SOUND_ID, soundBytes, soundBytes.byteLength);
  } catch (err) {
    console.warn('[Audio] Audio initialization skipped or not supported:', err);
  }

  // 8. Companion SVG panel in Realm2D
  const initialRoom = tour.rooms[0]!;
  const initialSvg = renderCompanionPanelSvg(tour, initialRoom, 0.0, false, activeBinding);
  galfus.realm2dCreateSvg(
    REALM_2D,
    SVG_HUD_ID,
    { source: initialSvg },
    { position: [0, 0], scale: [1, 1] }
  );

  // 9. Path followers setup function
  const rotatePathCommands = (
    commands: any[],
    roomIndex: number,
    origin: [number, number, number]
  ): any[] => {
    const rotated: any[] = [{ type: 'moveTo', to: origin }];
    for (let offset = 0; offset < tour.rooms.length; offset++) {
      const r = (roomIndex + offset) % tour.rooms.length;
      const linger = commands[1 + 2 * r];
      const travel = commands[2 + 2 * r];
      if (linger) rotated.push(linger);
      if (travel) rotated.push(travel);
    }
    return rotated;
  };

  const setupPaths = (roomIndex: number) => {
    try {
      galfus.animationDestroyPathFollow(PATH_CAMERA_POS_ID);
    } catch {}
    try {
      galfus.animationDestroyPathFollow(PATH_CAMERA_LOOK_ID);
    } catch {}

    const room = tour.rooms[roomIndex] ?? tour.rooms[0]!;
    const posCommands = rotatePathCommands(
      tour.cameraPositionPath.commands,
      roomIndex,
      room.cameraPoint
    );
    const lookCommands = rotatePathCommands(
      tour.cameraLookTargetPath.commands,
      roomIndex,
      room.focusPoint
    );

    galfus.animationCreatePathFollow(
      PATH_CAMERA_POS_ID,
      posCommands,
      tour.cameraPositionPath.config
    );
    galfus.animationBindPathFollowTarget(PATH_CAMERA_POS_ID, {
      kind: 'camera3DTransform',
      realmId: REALM_3D,
      cameraId: CAMERA_3D_ID
    });

    galfus.animationCreatePathFollow(
      PATH_CAMERA_LOOK_ID,
      lookCommands,
      tour.cameraLookTargetPath.config
    );
    galfus.animationBindPathFollowTarget(PATH_CAMERA_LOOK_ID, {
      kind: 'camera3DLookAt',
      realmId: REALM_3D,
      cameraId: CAMERA_3D_ID
    });

    galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_3D_ID, { position: room.cameraPoint });
    galfus.realm3dSetCameraLookAt(REALM_3D, CAMERA_3D_ID, {
      target: room.focusPoint,
      up: [0.0, 1.0, 0.0]
    });
  };

  setupPaths(0);
  console.log('✔ Tour paths and rooms configured successfully!\n');

  // 10. Tour playback clock & state
  let running = true;
  let isPaused = false;
  let tourClock = 0.0;
  let animClock = 0.0;
  let currentRoomIndex = 0;
  let frame = 0;
  let lastTime = performance.now();

  const updateHud = () => {
    const activeRoom = tour.rooms[currentRoomIndex] ?? tour.rooms[0]!;
    const updatedSvg = renderCompanionPanelSvg(
      tour,
      activeRoom,
      tourClock,
      isPaused,
      activeBinding
    );
    galfus.realm2dSetSvgSource(REALM_2D, SVG_HUD_ID, updatedSvg);
  };

  const applyRoomState = (roomIndex: number) => {
    currentRoomIndex = roomIndex;
    updateHud();

    // Multiverse post-processing screen filters for Room 8 (Effects)
    if (roomIndex === 8) {
      try {
        galfus.multiverseSetInvocationFilters(INVOCATION_3D, ['chromaticAberration', 'vignette']);
      } catch {}
    } else {
      try {
        galfus.multiverseSetInvocationFilters(INVOCATION_3D, []);
      } catch {}
    }

    // Audio playback for Room 9 (Spatial Audio & Finale)
    if (roomIndex === 9) {
      try {
        galfus.audioPlaySound(SOUND_ID, 0.9, 0.0, 1.0, false);
      } catch (err) {
        console.warn('[Audio] Failed to play chime:', err);
      }
    }
  };

  const seekToRoom = (targetRoomIndex: number) => {
    const wrapped = (targetRoomIndex + tour.rooms.length) % tour.rooms.length;
    const room = tour.rooms[wrapped]!;
    tourClock = room.startTime;
    setupPaths(wrapped);
    applyRoomState(wrapped);
    console.log(`[Tour] Jumped to Room ${wrapped + 1}: ${room.name}`);
  };

  const togglePause = () => {
    isPaused = !isPaused;
    if (!isPaused) {
      setupPaths(currentRoomIndex);
    }
    updateHud();
    console.log(`[Tour] Playback ${isPaused ? 'PAUSED' : 'RESUMED'}`);
  };

  options.onReady?.({
    togglePause,
    next: () => seekToRoom(currentRoomIndex + 1),
    previous: () => seekToRoom(currentRoomIndex - 1),
    restart: () => seekToRoom(0),
    stop: () => {
      running = false;
    },
    getState: () => ({
      roomIndex: currentRoomIndex,
      paused: isPaused,
      tourClock,
      duration: tour.duration
    })
  });

  while (running) {
    const now = performance.now();
    const dt = options.fixedDelta ?? Math.min(0.1, (now - lastTime) / 1000.0);
    lastTime = now;

    // Platform events batch
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          running = false;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        if (ev.state === 'pressed') {
          const key = extractKey(ev);
          if (key === 'escape') {
            running = false;
          } else if (key === ' ' || key === 'space') {
            togglePause();
          } else if (key === 'r') {
            seekToRoom(0);
          } else if (key === 'arrowright' || key === 'right') {
            seekToRoom(currentRoomIndex + 1);
          } else if (key === 'arrowleft' || key === 'left') {
            seekToRoom(currentRoomIndex - 1);
          }
        }
      }
    }

    animClock += dt;

    if (!isPaused) {
      tourClock = (tourClock + dt) % tour.duration;

      // Check room transition during live tour progression
      const activeRoom = tour.rooms.find(
        (r) => tourClock >= r.startTime && tourClock < r.startTime + r.duration
      );
      if (activeRoom && activeRoom.roomIndex !== currentRoomIndex) {
        applyRoomState(activeRoom.roomIndex);
      }
    }

    // Step kinetic transitions (5080, 5081, 5082 in Room 4)
    galfus.animationStep(dt);

    if (isPaused) {
      // While paused, anchor camera to the selected room
      const activeRoom = tour.rooms[currentRoomIndex] ?? tour.rooms[0]!;
      try {
        galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_3D_ID, {
          position: activeRoom.cameraPoint
        });
        galfus.realm3dSetCameraLookAt(REALM_3D, CAMERA_3D_ID, {
          target: activeRoom.focusPoint,
          up: [0.0, 1.0, 0.0]
        });
      } catch {}
    }

    // Update procedural skeletal bones in Room 6 using continuous animClock
    const bonePalette = computeBonePalette(animClock, 12, 5.0);
    try {
      galfus.realm3dUpdateBones(REALM_3D, 7102, bonePalette, bonePalette.length);
    } catch {}

    galfus.multiverseResolve();
    galfus.multiverseDispatch(frame, dt);
    frame++;

    options.onFrame?.({
      roomIndex: currentRoomIndex,
      paused: isPaused,
      tourClock,
      duration: tour.duration
    });

    if (options.maxFrames && frame >= options.maxFrames) {
      break;
    }

    if (options.nextFrame) {
      await options.nextFrame();
    }
  }

  // Teardown
  try {
    galfus.animationDestroyPathFollow(PATH_CAMERA_POS_ID);
    galfus.animationDestroyPathFollow(PATH_CAMERA_LOOK_ID);
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
    galfus.multiverseDestroyTarget(TARGET_WINDOW);
  } catch {}

  console.log('✔ Feature tour finished gracefully.');
}
