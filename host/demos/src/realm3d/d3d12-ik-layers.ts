/**
 * Realm 3D Demo 3D-12: Procedural IK (Two-Bone, FABRIK, LookAt), Spherecast Terrain & Layer Masks
 *
 * Controls:
 * - [Mouse Move] Guide the 3-joint spider arm tip across the terrain / air
 * - [L] Toggle Layer 2 holographic debug markers via camera layerMask
 * - [Space] Pause / resume target motion
 * - [Esc] / [Q] Exit
 */
import {
  type Camera3DComponent,
  type GeometryData,
  isKey,
  type Model3DComponent,
  utils3D
} from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const LAYER_MAIN = 0b0001;
const LAYER_OVERLAY = 0b0010;
const LAYER_ALL = 0xffffffff;

/** Builds a tapered bone/limb segment with pivot at (0, 0, 0) extending to (0, length, 0). */
function createBoneGeometry(baseRadius: number, tipRadius: number, length: number): GeometryData {
  const segs = 12;
  const ringVerts = segs + 1;
  const count = ringVerts * 2 + 2;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices: number[] = [];

  for (let r = 0; r < 2; r++) {
    const y = r === 0 ? -baseRadius * 0.45 : length + tipRadius * 0.45;
    const rad = r === 0 ? baseRadius : tipRadius;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      const i = r * ringVerts + s;
      positions[i * 3] = ca * rad;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = sa * rad;
      normals[i * 3] = ca;
      normals[i * 3 + 1] = 0;
      normals[i * 3 + 2] = sa;
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = r;
    }
  }
  const baseCenter = ringVerts * 2;
  const tipCenter = baseCenter + 1;
  positions[baseCenter * 3 + 1] = 0;
  normals[baseCenter * 3 + 1] = -1;
  positions[tipCenter * 3 + 1] = length;
  normals[tipCenter * 3 + 1] = 1;

  for (let s = 0; s < segs; s++) {
    const a = s,
      b = s + 1,
      c = ringVerts + s,
      d = c + 1;
    indices.push(a, c, b, b, c, d);
    indices.push(baseCenter, b, a);
    indices.push(tipCenter, c, d);
  }
  return { positions, normals, uvs, indices: new Uint32Array(indices) };
}

/** Quaternion rotating +Y `(0, 1, 0)` onto unit direction `to`. */
function quatFromUpTo(to: [number, number, number]): [number, number, number, number] {
  const len = Math.hypot(to[0], to[1], to[2]) || 1;
  const x = to[0] / len,
    y = to[1] / len,
    z = to[2] / len;
  if (y > 0.9999) return [0, 0, 0, 1];
  if (y < -0.9999) return [1, 0, 0, 0];
  // cross((0,1,0), (x,y,z)) = (z, 0, -x)
  const cx = z,
    cy = 0,
    cz = -x,
    w = 1 + y;
  const ql = Math.hypot(cx, cy, cz, w) || 1;
  return [cx / ql, cy / ql, cz / ql, w / ql];
}

function screenToWorldRay(
  mx: number,
  my: number,
  width: number,
  height: number,
  camPos: [number, number, number],
  camTarget: [number, number, number],
  fovDeg: number
): [number, number, number] {
  const fx = camTarget[0] - camPos[0],
    fy = camTarget[1] - camPos[1],
    fz = camTarget[2] - camPos[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f: [number, number, number] = [fx / fl, fy / fl, fz / fl];
  const rl = Math.hypot(-f[2], f[0]) || 1;
  const r: [number, number, number] = [-f[2] / rl, 0, f[0] / rl];
  const u: [number, number, number] = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0]
  ];
  const ndcX = (mx / Math.max(1, width)) * 2 - 1;
  const ndcY = 1 - (my / Math.max(1, height)) * 2;
  const tanHalf = Math.tan(((fovDeg * Math.PI) / 180) * 0.5);
  const aspect = width / Math.max(1, height);
  const dx = f[0] + r[0] * ndcX * aspect * tanHalf + u[0] * ndcY * tanHalf;
  const dy = f[1] + r[1] * ndcX * aspect * tanHalf + u[1] * ndcY * tanHalf;
  const dz = f[2] + r[2] * ndcX * aspect * tanHalf + u[2] * ndcY * tanHalf;
  const dl = Math.hypot(dx, dy, dz) || 1;
  return [dx / dl, dy / dl, dz / dl];
}

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
      const a = r * grid + c,
        b = a + 1,
        d = (r + 1) * grid + c,
        e = d + 1;
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
    const spiderMat = realm3d.createMaterial({
      baseColor: [0.15, 0.17, 0.22, 1],
      metallic: 0.85,
      roughness: 0.22
    }).materialId;
    const spiderTipMat = realm3d.createMaterial({
      baseColor: [1.0, 0.38, 0.15, 1],
      emissiveColor: [1.0, 0.3, 0.1, 1],
      metallic: 0.3,
      roughness: 0.2
    }).materialId;

    // 1. Heightfield Terrain + Collider for live Spherecast & Mouse Raycast
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

    const sphereGeo = realm3d.createGeometry({
      kind: 'sphere',
      radius: 0.18,
      rings: 16,
      sectors: 24
    }).geometryId;
    const cubeGeo = realm3d.createGeometry({ kind: 'cube', size: 0.45 }).geometryId;

    /** Spawns an independent world-space IK chain whose bones pivot cleanly at each joint. */
    const spawnIkChain = (
      points: [number, number, number][],
      radii: [number, number][],
      mat: number,
      tipMat: number
    ) => {
      const modelIds: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        const next = points[i + 1];
        let geoId = sphereGeo;
        let rot: [number, number, number, number] = [0, 0, 0, 1];
        if (next) {
          const dx = next[0] - p[0],
            dy = next[1] - p[1],
            dz = next[2] - p[2];
          const len = Math.hypot(dx, dy, dz);
          const [r0, r1] = radii[i] ?? [0.14, 0.1];
          geoId = realm3d.createGeometry(createBoneGeometry(r0, r1, len)).geometryId;
          rot = quatFromUpTo([dx, dy, dz]);
        }
        const ent = realm3d.createModel(
          { geometryId: geoId, materialId: next ? mat : tipMat, layerMask: LAYER_MAIN },
          { position: p, rotation: rot }
        );
        modelIds.push(realm3d.world.getComponent<Model3DComponent>(ent, 'Model3D')!.modelId);
      }
      return modelIds;
    };

    // 2. Two-Bone IK Leg (Left) driven by Spherecast ground hits
    const legIds = spawnIkChain(
      [
        [-3.2, 2.8, 0.0],
        [-3.2, 1.5, 0.35],
        [-3.2, 0.2, 0.0]
      ],
      [
        [0.18, 0.14],
        [0.14, 0.09]
      ],
      limbMat,
      limbMat
    );

    // 3. FABRIK 5-Joint Tentacle (Right) chasing an orbiting target
    const fabrikIds = spawnIkChain(
      [
        [3.2, 0.6, 0.0],
        [3.2, 1.45, 0.1],
        [3.2, 2.3, 0.15],
        [3.2, 3.15, 0.1],
        [3.2, 4.0, 0.0]
      ],
      [
        [0.18, 0.15],
        [0.15, 0.12],
        [0.12, 0.09],
        [0.09, 0.06]
      ],
      fabrikMat,
      fabrikMat
    );

    // 4. LookAt IK Turret (Center Back)
    const turretEnt = realm3d.createModel(
      { geometryId: cubeGeo, materialId: turretMat, layerMask: LAYER_MAIN },
      { position: [0.0, 2.4, -2.0], scale: [1.1, 0.8, 1.8] }
    );
    const turretModelId = realm3d.world.getComponent<Model3DComponent>(
      turretEnt,
      'Model3D'
    )!.modelId;

    // 4b. 3-Joint Spider Arm (Center Front) — 4 nodes (coxa -> femur -> tibia -> claw tip) following the mouse
    const spiderIds = spawnIkChain(
      [
        [0.0, 1.2, 1.2],
        [0.0, 2.5, 1.8],
        [0.0, 2.6, 3.1],
        [0.0, 1.3, 3.7]
      ],
      [
        [0.17, 0.13],
        [0.13, 0.09],
        [0.09, 0.05]
      ],
      spiderMat,
      spiderTipMat
    );

    // 5. Layer 2 Holographic Debug Markers (toggled with [L])
    const footMarker = realm3d.createModel(
      { geometryId: sphereGeo, materialId: overlayMat, layerMask: LAYER_OVERLAY },
      { position: [-3.2, 0.5, 0] }
    );
    const orbMarker = realm3d.createModel(
      { geometryId: sphereGeo, materialId: overlayMat, layerMask: LAYER_OVERLAY },
      { position: [2.2, 2.5, 1] }
    );
    const mouseMarker = realm3d.createModel(
      { geometryId: sphereGeo, materialId: spiderTipMat, layerMask: LAYER_OVERLAY },
      { position: [0, 1.3, 3.7], scale: [0.7, 0.7, 0.7] }
    );

    realm3d.flush();

    // Register Core IK Constraints (Phase 2)
    realm3d.setIkConstraint(1, {
      type: 'twoBone',
      rootId: legIds[0]!,
      midId: legIds[1]!,
      effectorId: legIds[2]!,
      target: [-3.2, 0.2, 0.0],
      poleTarget: [-3.2, 1.6, 2.5]
    });
    realm3d.setIkConstraint(2, {
      type: 'fabrik',
      chain: fabrikIds,
      target: [2.2, 2.8, 1.0],
      iterations: 10,
      tolerance: 0.01
    });
    realm3d.setIkConstraint(3, {
      type: 'lookAt',
      entityId: turretModelId,
      target: [2.2, 2.8, 1.0],
      forwardAxis: [0, 0, -1],
      upAxis: [0, 1, 0]
    });
    realm3d.setIkConstraint(4, {
      type: 'fabrik',
      chain: spiderIds,
      target: [0.0, 1.3, 3.7],
      poleTarget: [0.0, 12.0, 1.2],
      iterations: 12,
      tolerance: 0.005
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
    let viewWidth = 1280;
    let viewHeight = 720;
    let mouseTarget: [number, number, number] = [0.0, 1.3, 3.7];

    runtime.on('window', (ev) => {
      if (ev.type === 'resized' && ev.windowId === windowId) {
        viewWidth = ev.width;
        viewHeight = ev.height;
      }
    });

    runtime.on('pointer', (ev) => {
      if (ev.type !== 'move') return;
      const dir = screenToWorldRay(
        ev.position[0],
        ev.position[1],
        viewWidth,
        viewHeight,
        camPos,
        camTarget,
        camDesc.fovY
      );
      const hits = realm3d.raycast(camPos, dir, 80.0);
      if (hits.length > 0) {
        const p = hits[0]!.point;
        mouseTarget = [p[0], p[1] + 0.2, p[2]];
      } else if (Math.abs(dir[2]) > 1e-4) {
        const t = (2.2 - camPos[2]) / dir[2];
        if (t > 0) {
          mouseTarget = [camPos[0] + dir[0] * t, camPos[1] + dir[1] * t, 2.2];
        }
      }
    });

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
      const probeX = -3.2 + Math.cos(elapsed * 1.3) * 0.9;
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
      realm3d.setIkTarget(4, mouseTarget);
      realm3d.world.getComponent<Model3DComponent>(orbMarker, 'Model3D')?.setPosition(...orbTarget);
      realm3d.world
        .getComponent<Model3DComponent>(mouseMarker, 'Model3D')
        ?.setPosition(...mouseTarget);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['Escape', 'KeyQ'] });
  } finally {
    runtime.dispose();
  }
}
