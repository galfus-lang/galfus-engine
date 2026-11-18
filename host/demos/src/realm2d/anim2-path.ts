import { isKey, type Light3DComponent, type PathId, utils3D } from '@galfus/engine';
import type { PathCommand, PathFollowConfig } from '@galfus/transport-types';
import { UiRoot } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export interface Anim2Scene {
  readonly realm3d: ReturnType<ReturnType<typeof createDemoSession>['runtime']['createRealm3D']>;
  readonly realm2d: ReturnType<ReturnType<typeof createDemoSession>['runtime']['createRealm2D']>;
  readonly uiRoot: UiRoot;
  readonly dronePathId: PathId;
  readonly orbPathId: PathId;
  readonly droneEntity: number;
  readonly orbEntity: number;
  readonly progressFill: ReturnType<UiRoot['addPanel']>;
  readonly progressText: ReturnType<UiRoot['addText']>;
  readonly statusText: ReturnType<UiRoot['addText']>;
  rebindDronePath: (
    speedMultiplier: number,
    loopMode: 'loop' | 'pingPong',
    orient: boolean
  ) => void;
}

export function createAnim2Scene(
  runtime: ReturnType<typeof createDemoSession>['runtime'],
  targetId: ReturnType<typeof createDemoSession>['targetId']
): Anim2Scene {
  const realm3d = runtime.createRealm3D();
  const realm2d = runtime.createRealm2D();

  // 1. Camera & Lighting
  const camPos: [number, number, number] = [0, 9.5, 20.0];
  realm3d.createCamera(
    { fovY: 55, near: 0.1, far: 1000, cameraSlot: 0 },
    { position: camPos, rotation: utils3D.quatFromLookAt(camPos, [0, 3.5, 1.0]) }
  );

  const lightPos: [number, number, number] = [12, 22, 14];
  realm3d.createLight(
    { kind: 'directional', color: [1.0, 0.96, 0.88], intensity: 2.8, castShadow: false },
    { position: lightPos, rotation: utils3D.quatFromLookAt(lightPos, [0, 0, 0]) }
  );

  realm3d.setEnvironment({
    ambientColor: [0.12, 0.15, 0.22, 1.0],
    exposure: 1.0,
    skybox: {
      mode: 'procedural',
      skyColor: [0.15, 0.28, 0.55, 1.0],
      horizonColor: [0.45, 0.55, 0.7, 1.0],
      groundColor: [0.04, 0.04, 0.07, 1.0],
      sunDirection: [0.5, 0.8, 0.3, 0.0],
      sunColor: [1.0, 0.95, 0.85, 2.5],
      intensity: 1.0
    }
  });

  // 2. Materials
  const matFloor = realm3d.createMaterial({
    baseColor: [0.12, 0.14, 0.18, 1.0],
    roughness: 0.7,
    metallic: 0.2
  }).materialId;
  const matHull = realm3d.createMaterial({
    baseColor: [0.2, 0.65, 1.0, 1.0],
    roughness: 0.25,
    metallic: 0.85
  }).materialId;
  const matCockpit = realm3d.createMaterial({
    baseColor: [0.95, 0.75, 0.2, 1.0],
    roughness: 0.1,
    metallic: 0.9
  }).materialId;
  const matThruster = realm3d.createMaterial({
    baseColor: [1.0, 0.35, 0.15, 1.0],
    emissiveColor: [3.5, 1.5, 0.5, 1.0],
    roughness: 0.2,
    metallic: 0.5
  }).materialId;
  const matOrb = realm3d.createMaterial({
    baseColor: [0.4, 1.0, 0.7, 1.0],
    emissiveColor: [1.5, 3.5, 2.2, 1.0],
    roughness: 0.1,
    metallic: 0.9
  }).materialId;
  const matPillar = realm3d.createMaterial({
    baseColor: [0.28, 0.32, 0.4, 1.0],
    roughness: 0.5,
    metallic: 0.3
  }).materialId;

  realm3d.createPlane(36, 36, matFloor, { position: [0, -0.5, 0] });

  // 3. Drone Entity Assembly (Fuselage, Cockpit, Wings, Thruster)
  const drone = realm3d.createCube(1.0, matHull, {
    position: [0, 2, -8],
    scale: [0.9, 0.35, 2.2]
  });
  realm3d.createSphere(0.45, 12, 16, matCockpit, {
    position: [0, 2.3, -7.5],
    scale: [0.65, 0.5, 1.0]
  });
  realm3d.createCube(1.0, matHull, {
    position: [0, 2.05, -7.8],
    scale: [3.2, 0.08, 0.8]
  });
  realm3d.createSphere(0.3, 10, 12, matThruster, {
    position: [0, 2.0, -9.0],
    scale: [0.6, 0.6, 0.6]
  });

  // 4. Secondary Orbiting Scout Orb with Point Light
  const orb = realm3d.createSphere(0.55, 16, 20, matOrb, {
    position: [0, 4.0, 0]
  });
  const pointLight = realm3d.createLight(
    { kind: 'point', color: [0.4, 1.0, 0.7], intensity: 4.0, range: 16.0, castShadow: false },
    { position: [0, 4.0, 0] }
  );

  // 5. Waypoint Visualizer Markers
  const waypoints: Array<[number, number, number]> = [
    [0, 2.0, -8],
    [7, 3.8, -3],
    [8, 7.2, 4],
    [2, 5.0, 9],
    [-7, 8.0, 5],
    [-7, 3.2, -4]
  ];
  for (const pt of waypoints) {
    realm3d.createCylinder(0.35, 0.8, 12, matPillar, { position: [pt[0], pt[1] - 0.5, pt[2]] });
  }

  // 6. 3D Spline Path Commands
  const dronePathCommands: PathCommand[] = [
    { type: 'moveTo', to: [0, 2.0, -8] },
    { type: 'lineTo', to: [7, 3.8, -3], duration: 2.2 },
    { type: 'quadTo', control: [11, 7.5, 0], to: [8, 7.2, 4], duration: 2.6 },
    {
      type: 'cubicTo',
      control1: [6, 7.0, 8],
      control2: [4, 4.0, 10],
      to: [2, 5.0, 9],
      duration: 2.8
    },
    { type: 'smoothTo', to: [-7, 8.0, 5], duration: 2.8 },
    { type: 'smoothTo', to: [-7, 3.2, -4], duration: 2.4 },
    { type: 'close', duration: 2.2 }
  ];

  const orbPathCommands: PathCommand[] = [];
  const ORB_POINTS = 12;
  for (let k = 0; k < ORB_POINTS; k++) {
    const angle = (k * 2.0 * Math.PI) / ORB_POINTS;
    const r = 5.5 + 2.0 * Math.sin(angle * 2.0);
    const y = 4.2 + 2.2 * Math.cos(angle * 3.0);
    const pt: [number, number, number] = [
      Number((Math.cos(-angle) * r).toFixed(3)),
      Number(y.toFixed(3)),
      Number((Math.sin(-angle) * r).toFixed(3))
    ];
    orbPathCommands.push(k === 0 ? { type: 'moveTo', to: pt } : { type: 'smoothTo', to: pt });
  }
  orbPathCommands.push({ type: 'close' });

  // 7. Bind Path Follow Animations
  let currentDronePathId: PathId;
  const bindDrone = (speedMult: number, loop: 'loop' | 'pingPong', orient: boolean) => {
    if (currentDronePathId) runtime.animation.destroyPath(currentDronePathId);
    const cfg: PathFollowConfig = {
      duration: 14.0 / speedMult,
      easing: 'easeInOutQuad',
      loopMode: loop,
      orientToPath: orient
    };
    currentDronePathId = runtime.animation.createPathFollow(dronePathCommands, cfg, {
      kind: 'modelTransform3D',
      realmId: realm3d.realmId,
      modelId: drone.modelId
    });
  };
  bindDrone(1.0, 'loop', true);

  const orbCfg: PathFollowConfig = { duration: 9.0, easing: 'linear', loopMode: 'loop' };
  const orbPathId = runtime.animation.createPathFollow(orbPathCommands, orbCfg, {
    kind: 'modelTransform3D',
    realmId: realm3d.realmId,
    modelId: orb.modelId
  });
  const pointLightComp = realm3d.world.getComponent<Light3DComponent>(pointLight, 'Light3D')!;
  runtime.animation.createPathFollow(orbPathCommands, orbCfg, {
    kind: 'light3DTransform',
    realmId: realm3d.realmId,
    lightId: pointLightComp.lightId
  });

  // 8. 2D Reactive Telemetry HUD
  realm2d.setShadowConfig({ ambient: 1.0 });
  realm2d.createCamera({ orthoScale: 768, cameraSlot: 0 }, { position: [0, 0] });
  const uiRoot = new UiRoot(runtime, realm2d, {
    width: 600,
    height: 135,
    position: [0, 260],
    zLayer: 10
  });
  uiRoot.rootPanel
    .setBackgroundColor([0.06, 0.09, 0.16, 0.92])
    .setBorderColor([0.24, 0.38, 0.62, 1.0])
    .setBorderWidth(2)
    .setBorderRadius(12);

  uiRoot.addText({
    text: 'ANIM-2: PATH FOLLOWER & SPLINE TRAJECTORIES',
    fontSize: 16,
    color: [0.98, 0.98, 1.0, 1.0],
    x: 20,
    y: 18
  });

  uiRoot.addText({
    text: '[Space]: Speed (1x/2x/0.5x)  |  [L]: Loop/PingPong  |  [O]: Orient-To-Path  |  [Esc]: Exit',
    fontSize: 12,
    color: [0.65, 0.75, 0.88, 1.0],
    x: 20,
    y: 44
  });

  const progressTrack = uiRoot.addPanel({
    x: 20,
    y: 72,
    width: 560,
    height: 20,
    borderRadius: 4,
    backgroundColor: [0.1, 0.15, 0.24, 1.0]
  });

  const progressFill = progressTrack.addPanel({
    x: 0,
    y: 0,
    width: 50,
    height: 20,
    minWidth: 0,
    borderRadius: 4,
    backgroundColor: [0.2, 0.65, 1.0, 1.0]
  });

  const progressText = uiRoot.addText({
    text: '0%',
    fontSize: 11,
    color: [1.0, 1.0, 1.0, 1.0],
    x: 290,
    y: 74
  });

  const statusText = uiRoot.addText({
    text: 'Telemetry: Initializing spline evaluation...',
    fontSize: 11,
    color: [0.55, 0.85, 0.7, 1.0],
    x: 20,
    y: 104
  });

  // 9. Multiverse Invocations
  runtime.multiverse.createInvocation({
    realmId: realm3d.realmId,
    targetId,
    cameraSlot: 0,
    zIndex: 0,
    clearColor: [0.05, 0.07, 0.11, 1.0]
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

  return {
    realm3d,
    realm2d,
    uiRoot,
    get dronePathId() {
      return currentDronePathId;
    },
    orbPathId,
    droneEntity: drone.entityId,
    orbEntity: orb.entityId,
    progressFill,
    progressText,
    statusText,
    rebindDronePath: (speed, loop, orient) => bindDrone(speed, loop, orient)
  };
}

export async function runDemoAnim2(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: Anim-2 Path Transitions & Spline Trajectories',
    options,
    [1024, 768]
  );

  try {
    const scene = createAnim2Scene(runtime, targetId);

    const speeds = [1.0, 2.0, 0.5];
    let speedIdx = 0;
    let loopMode: 'loop' | 'pingPong' = 'loop';
    let orient = true;

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed') {
        if (isKey(ev, 'space', ' ')) {
          speedIdx = (speedIdx + 1) % speeds.length;
          scene.rebindDronePath(speeds[speedIdx]!, loopMode, orient);
        } else if (isKey(ev, 'l')) {
          loopMode = loopMode === 'loop' ? 'pingPong' : 'loop';
          scene.rebindDronePath(speeds[speedIdx]!, loopMode, orient);
        } else if (isKey(ev, 'o')) {
          orient = !orient;
          scene.rebindDronePath(speeds[speedIdx]!, loopMode, orient);
        }
      }
    });

    runtime.on('tick', () => {
      const state = runtime.animation.getPathState(scene.dronePathId);
      if (state) {
        const pct = Math.max(0, Math.min(100, Math.round(state.progress * 100)));
        const fillWidth = Math.max(6, 560 * state.progress);
        scene.progressFill.setSize(fillWidth, 20);
        scene.progressText.setText(`${pct}%`);
        scene.statusText.setText(
          `Speed: ${speeds[speedIdx]}x  |  Loop: ${loopMode}  |  OrientToPath: ${orient ? 'ON' : 'OFF'}  |  Status: ${state.status}`
        );
      }
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoAnim2();
}
