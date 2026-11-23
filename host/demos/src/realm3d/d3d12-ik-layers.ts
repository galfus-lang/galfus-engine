/**
 * Realm 3D Demo 3D-12: Procedural IK (Two-Bone, FABRIK, LookAt), Spherecast Terrain & Layer Masks
 *
 * Controls:
 * - [L] Toggle Layer 2 holographic debug markers via camera layerMask
 * - [Space] Pause / resume target motion
 * - [Esc] / [Q] Exit
 */
import { type Camera3DComponent, isKey, type Model3DComponent, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const LAYER_MAIN = 0b0001;
const LAYER_OVERLAY = 0b0010;
const LAYER_ALL = 0xffffffff;

function buildWavyTerrain(grid: number, worldSize: number) {
  const heights: number[] = [];
  const positions = new Float32Array(grid * grid * 3);
  const normals = new Float32Array(grid * grid * 3);
  const uvs = new Float32Array(grid * grid * 2);
  const indices: number[] = [];
  const half = worldSize * 0.5;
  const hAt = (x: number, z: number) =>
    Math.sin(x * 0.55) * 0.45 + Math.cos(z * 0.55) * 0.45 + Math.sin((x + z) * 0.35) * 0.2;

  for (let r = 0; r < grid; r++) {
    const v = r / (grid - 1);
    const z = -half + v * worldSize;
    for (let c = 0; c < grid; c++) {
      const u = c / (grid - 1);
      const x = -half + u * worldSize;
      const y = hAt(x, z);
      heights.push(y);
      const idx = r * grid + c;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      const eps = 0.05;
      const dx = (hAt(x + eps, z) - hAt(x - eps, z)) / (2 * eps);
      const dz = (hAt(x, z + eps) - hAt(x, z - eps)) / (2 * eps);
      const len = Math.hypot(-dx, 1, -dz);
      normals[idx * 3] = -dx / len;
      normals[idx * 3 + 1] = 1 / len;
      normals[idx * 3 + 2] = -dz / len;
      uvs[idx * 2] = u * 4;
      uvs[idx * 2 + 1] = v * 4;
    }
  }
  for (let r = 0; r < grid - 1; r++) {
    for (let c = 0; c < grid - 1; c++) {
      const a = r * grid + c;
      const b = a + 1;
      const d = (r + 1) * grid + c;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  return { positions, normals, uvs, indices: new Uint32Array(indices), heights };
}

export async function runDemo3d12(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Demo 3D-12: Procedural IK, Spherecast Terrain & Layer Masks',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    const camPos: [number, number, number] = [0, 5.2, 10.5];
    const camTarget: [number, number, number] = [0, 1.4, 0];
    const camDesc = { fovY: 48, near: 0.1, far: 120, cameraSlot: 1, layerMask: LAYER_ALL };
    const camera = realm3d.createCamera(camDesc, {
      position: camPos,
      rotation: utils3D.quatFromLookAt(camPos, camTarget)
    });
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.16, 0.19, 0.25, 0.35],
      exposure: 1.15,
      skybox: {
        mode: 'procedural',
        skyColor: [0.06, 0.11, 0.24, 1],
        horizonColor: [0.28, 0.44, 0.72, 1],
        groundColor: [0.06, 0.07, 0.09, 1],
        sunDirection: [0.45, 0.85, 0.3, 0],
        sunColor: [1, 0.96, 0.88, 2.6],
        intensity: 1
      }
    });

    const sunPos: [number, number, number] = [7, 13, 8];
    realm3d.createLight(
      {
        kind: 'directional',
        color: [1, 0.96, 0.9],
        intensity: 2.6,
        castShadow: true,
        layerMask: LAYER_ALL
      },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );

    const terrainMat = realm3d.createMaterial({
      baseColor: [0.18, 0.24, 0.28, 1],
      metallic: 0.1,
      roughness: 0.75
    }).materialId;
    const limbMat = realm3d.createMaterial({
      baseColor: [0.95, 0.62, 0.18, 1],
      metallic: 0.5,
      roughness: 0.3
    }).materialId;
    const fabrikMat = realm3d.createMaterial({
      baseColor: [0.22, 0.88, 0.68, 1],
      metallic: 0.5,
      roughness: 0.25
    }).materialId;
    const turretMat = realm3d.createMaterial({
      baseColor: [0.85, 0.3, 0.42, 1],
      metallic: 0.6,
      roughness: 0.25
    }).materialId;
    const overlayMat = realm3d.createMaterial({
      baseColor: [0.2, 0.95, 1, 1],
      emissiveColor: [0.15, 0.85, 1, 1],
      metallic: 0.1,
      roughness: 0.2
    }).materialId;

    // 1. Heightfield Terrain + Collider for live Spherecast foot placement
    const grid = 25;
    const worldSize = 14;
    const terrain = buildWavyTerrain(grid, worldSize);
    const terrainGeo = realm3d.createGeometry(terrain).geometryId;
    const terrainEnt = realm3d.createModel(
      { geometryId: terrainGeo, materialId: terrainMat, layerMask: LAYER_MAIN },
      { position: [0, 0, 0] }
    );
    realm3d.addCollider(terrainEnt, {
      type: 'heightfield',
      heights: terrain.heights,
      nrows: grid,
      ncols: grid,
      scale: [worldSize, 1, worldSize]
    });

    const cubeGeo = realm3d.createGeometry({ kind: 'cube', size: 0.42 }).geometryId;
    const sphereGeo = realm3d.createGeometry({
      kind: 'sphere',
      radius: 0.22,
      rings: 16,
      sectors: 24
    }).geometryId;
    const spawnJoint = (
      mat: number,
      pos: [number, number, number],
      parent?: number,
      scale: [number, number, number] = [1, 1, 1]
    ) => {
      const ent = realm3d.createModel(
        { geometryId: cubeGeo, materialId: mat, layerMask: LAYER_MAIN },
        { position: pos, scale }
      );
      if (parent !== undefined) realm3d.hierarchy.attach(ent, parent);
      return {
        ent,
        modelId: realm3d.world.getComponent<Model3DComponent>(ent, 'Model3D')!.modelId
      };
    };

    // 2. Two-Bone IK Leg (Left) driven by Spherecast ground hits
    const hip = spawnJoint(limbMat, [-3.0, 2.8, 0.0], undefined, [1.1, 1.1, 1.1]);
    const knee = spawnJoint(limbMat, [0.0, -1.3, 0.25], hip.ent, [0.85, 1.4, 0.85]);
    const foot = spawnJoint(limbMat, [0.0, -1.3, 0.0], knee.ent, [0.9, 0.6, 1.3]);

    // 3. FABRIK 5-Joint Tentacle (Right) chasing an orbiting target
    const fabrikJoints: number[] = [];
    let prevEnt: number | undefined;
    for (let i = 0; i < 5; i++) {
      const j = spawnJoint(fabrikMat, i === 0 ? [3.0, 0.6, 0.0] : [0.0, 0.85, 0.0], prevEnt, [
        0.85 - i * 0.1,
        1.2,
        0.85 - i * 0.1
      ]);
      fabrikJoints.push(j.modelId);
      prevEnt = j.ent;
    }

    // 4. LookAt IK Turret (Center)
    const turret = spawnJoint(turretMat, [0.0, 2.2, -1.5], undefined, [1.2, 0.9, 2.0]);

    // 5. Layer 2 Holographic Debug Markers (toggled with [L])
    const footMarker = realm3d.createModel(
      { geometryId: sphereGeo, materialId: overlayMat, layerMask: LAYER_OVERLAY },
      { position: [-3, 0.5, 0] }
    );
    const orbMarker = realm3d.createModel(
      { geometryId: sphereGeo, materialId: overlayMat, layerMask: LAYER_OVERLAY },
      { position: [2, 2.5, 1] }
    );

    realm3d.flush();

    // Register Core IK Constraints (Phase 2)
    realm3d.setIkConstraint(1, {
      type: 'twoBone',
      rootId: hip.modelId,
      midId: knee.modelId,
      effectorId: foot.modelId,
      target: [-3.0, 0.2, 0.0],
      poleTarget: [-3.0, 1.6, 2.5]
    });
    realm3d.setIkConstraint(2, {
      type: 'fabrik',
      chain: fabrikJoints,
      target: [2.2, 2.8, 1.0],
      iterations: 10,
      tolerance: 0.01
    });
    realm3d.setIkConstraint(3, {
      type: 'lookAt',
      entityId: turret.modelId,
      target: [2.2, 2.8, 1.0],
      forwardAxis: [0, 0, -1],
      upAxis: [0, 1, 0]
    });

    runtime.multiverse.createInvocation({
      targetId,
      realmId: realm3d.realmId,
      cameraSlot: 1,
      clearColor: [0.03, 0.04, 0.06, 1]
    });

    let elapsed = 0;
    let paused = false;
    let showOverlayLayer = true;

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed' || ev.repeat) return;
      if (isKey(ev, 'Space')) paused = !paused;
      if (isKey(ev, 'KeyL')) {
        showOverlayLayer = !showOverlayLayer;
        const camComp = realm3d.world.getComponent<Camera3DComponent>(camera.entityId, 'Camera3D');
        if (camComp) {
          camComp.desc.layerMask = showOverlayLayer ? LAYER_ALL : LAYER_MAIN;
          camComp.isDirty = true;
        }
      }
    });

    runtime.on('tick', ({ dt }) => {
      if (!paused) elapsed += dt;

      // Spherecast straight down from above the moving foot probe onto the heightfield terrain
      const probeX = -3.0 + Math.cos(elapsed * 1.3) * 0.9;
      const probeZ = Math.sin(elapsed * 1.3) * 0.9;
      const hits = realm3d.spherecast([probeX, 5.0, probeZ], [0, -1, 0], 0.18, 10.0);
      const groundY = hits.length > 0 ? hits[0]!.point[1] : 0.0;
      const footTarget: [number, number, number] = [probeX, groundY + 0.15, probeZ];
      realm3d.setIkTarget(1, footTarget);
      realm3d.world
        .getComponent<Model3DComponent>(footMarker, 'Model3D')
        ?.setPosition(...footTarget);

      // Orbiting target for FABRIK tentacle + LookAt turret
      const orbTarget: [number, number, number] = [
        2.2 + Math.cos(elapsed * 1.1) * 1.3,
        2.4 + Math.sin(elapsed * 1.9) * 0.85,
        Math.sin(elapsed * 1.1) * 1.4
      ];
      realm3d.setIkTarget(2, orbTarget);
      realm3d.setIkTarget(3, orbTarget);
      realm3d.world.getComponent<Model3DComponent>(orbMarker, 'Model3D')?.setPosition(...orbTarget);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['Escape', 'KeyQ'] });
  } finally {
    runtime.dispose();
  }
}
