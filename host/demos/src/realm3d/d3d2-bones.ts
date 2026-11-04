/**
 * Realm 3D Demo 3D-2: Procedural Skeletal Bones (12-Joint Skinning & Real-Time Shadows)
 */
import { type GeometryData, isKey, type Model3DComponent, quat } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const BONE_COUNT = 12;
const MESH_RINGS = 48;
const MESH_RADIAL_SEGS = 24;
const TENTACLE_HEIGHT = 8.0;
const BASE_RADIUS = 0.7;

function buildProceduralSkinnedMesh(
  rings: number,
  radialSegs: number,
  height: number,
  boneCount: number
): GeometryData {
  const ringVerts = radialSegs + 1;
  const count = (rings + 1) * ringVerts + 2;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const tangents = new Float32Array(count * 4);
  const joints0 = new Uint32Array(count * 4);
  const weights0 = new Float32Array(count * 4);
  const indices: number[] = [];
  const smoothstep = (t: number) => t * t * (3.0 - 2.0 * t);
  const segments = Math.max(1, boneCount - 1);

  let vIdx = 0;
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = v * height;
    const radius = BASE_RADIUS * (1.0 - 0.75 * v);
    const boneF = v * segments;
    const boneIdx = Math.min(Math.floor(boneF), boneCount - 1);
    const nextIdx = Math.min(boneIdx + 1, boneCount - 1);
    const t = smoothstep(boneF - boneIdx);

    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const theta = u * Math.PI * 2.0;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const i3 = vIdx * 3;
      const i2 = vIdx * 2;
      const i4 = vIdx * 4;

      positions[i3 + 0] = cosT * radius;
      positions[i3 + 1] = y;
      positions[i3 + 2] = sinT * radius;

      normals[i3 + 0] = cosT;
      normals[i3 + 1] = 0.0;
      normals[i3 + 2] = sinT;

      uvs[i2 + 0] = u;
      uvs[i2 + 1] = v;

      tangents[i4 + 0] = -sinT;
      tangents[i4 + 1] = 0.0;
      tangents[i4 + 2] = cosT;
      tangents[i4 + 3] = 1.0;

      joints0[i4 + 0] = boneIdx;
      joints0[i4 + 1] = nextIdx;

      weights0[i4 + 0] = 1.0 - t;
      weights0[i4 + 1] = t;

      vIdx++;
    }
  }

  positions[vIdx * 3 + 0] = -4.5;
  positions[vIdx * 3 + 1] = 0.0;
  positions[vIdx * 3 + 2] = -4.5;
  normals[vIdx * 3 + 1] = 1.0;
  vIdx++;

  positions[vIdx * 3 + 0] = 4.5;
  positions[vIdx * 3 + 1] = height + 1.5;
  positions[vIdx * 3 + 2] = 4.5;
  normals[vIdx * 3 + 1] = 1.0;
  vIdx++;

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const i0 = r * ringVerts + s;
      const i1 = i0 + 1;
      const i2 = (r + 1) * ringVerts + s;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
  return {
    positions,
    normals,
    uvs,
    tangents,
    joints0,
    weights0,
    indices: new Uint32Array(indices)
  };
}

function computeBoneMatrix(
  restY: number,
  dx: number,
  dz: number,
  rx: number,
  ry: number,
  rz: number
): number[] {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rx),
    Math.sin(rx),
    Math.cos(ry),
    Math.sin(ry),
    Math.cos(rz),
    Math.sin(rz)
  ];
  const m00 = cy * cz + sy * sx * sz;
  const m10 = cx * sz;
  const m20 = -sy * cz + cy * sx * sz;
  const m01 = -cy * sz + sy * sx * cz;
  const m11 = cx * cz;
  const m21 = sy * sz + cy * sx * cz;
  const m02 = sy * cx;
  const m12 = -sx;
  const m22 = cy * cx;
  return [
    m00,
    m10,
    m20,
    0,
    m01,
    m11,
    m21,
    0,
    m02,
    m12,
    m22,
    0,
    dx - m01 * restY,
    restY - m11 * restY,
    dz - m21 * restY,
    1
  ];
}

function computeBoneSkinningPalette(
  time: number,
  boneCount: number,
  height: number,
  mode: number
): Float32Array {
  const boneHeight = height / (boneCount - 1);
  const palette = new Float32Array(boneCount * 16);

  for (let i = 0; i < boneCount; i++) {
    const frac = i / (boneCount - 1);
    const restY = i * boneHeight;
    let dx = 0;
    let dz = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;

    if (mode === 0) {
      const phaseX = time * 3.2 + i * 0.45;
      const phaseZ = time * 2.5 + i * 0.55;
      dx = Math.sin(phaseX) * frac * 2.4;
      dz = Math.cos(phaseZ) * frac * 1.8;
      rz = -Math.cos(phaseX) * frac * 0.45;
      rx = Math.sin(phaseZ) * frac * 0.4;
    } else if (mode === 1) {
      const spiralTheta = time * 4.0 + i * 0.65;
      const spiralRadius = frac * 2.8;
      dx = Math.cos(spiralTheta) * spiralRadius;
      dz = Math.sin(spiralTheta) * spiralRadius;
      ry = time * 2.2 + i * 0.35;
      rz = -Math.sin(spiralTheta) * frac * 0.5;
    } else {
      const whip = Math.sin(time * 6.0 - i * 0.85);
      dx = whip * frac * frac * 3.4;
      dz = Math.cos(time * 3.2 + i * 0.35) * frac * 1.0;
      rz = -whip * frac * 0.7;
    }
    palette.set(computeBoneMatrix(restY, dx, dz, rx, ry, rz), i * 16);
  }
  return palette;
}

export async function runDemo3d2(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Engine - Demo 3D-2: Procedural Skeletal Bones (12-Joint Skinning)',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();
    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      viewport: { width: { vw: 100 }, height: { vh: 100 } },
      clearColor: [0.03, 0.04, 0.07, 1.0]
    });

    const skinnedMesh = buildProceduralSkinnedMesh(
      MESH_RINGS,
      MESH_RADIAL_SEGS,
      TENTACLE_HEIGHT,
      BONE_COUNT
    );
    const { geometryId: tentacleGeom } = realm3d.createGeometry(skinnedMesh);
    const { materialId: tentacleMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.15, 0.85, 0.95, 1.0],
      emissiveColor: [0.05, 0.25, 0.35, 1.0],
      roughness: 0.25,
      metallic: 0.6
    });
    const { materialId: floorMat } = realm3d.createMaterial({
      surfaceType: 'opaque',
      baseColor: [0.18, 0.2, 0.24, 1.0],
      roughness: 0.5,
      metallic: 0.2
    });

    const tentacle = realm3d.createModel({
      geometryId: tentacleGeom,
      materialId: tentacleMat,
      castShadow: true,
      receiveShadow: true,
      castOutline: true,
      outlineColor: [0.0, 1.0, 0.9, 1.0],
      boneCount: BONE_COUNT,
      boneOffset: 0
    });
    const tentacleModel = realm3d.world.getComponent<Model3DComponent>(tentacle, 'Model3D')!;
    realm3d.flush();
    realm3d.createPlane(40, 40, floorMat, { position: [0, 0, 0] });

    const sunRot = quat.create();
    quat.fromLookAt(sunRot, [10, 18, 12], [0, 3.5, 0]);
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.95, 0.88], intensity: 1.5, castShadow: true },
      { position: [10, 18, 12], rotation: sunRot }
    );

    const spotRot = quat.create();
    quat.fromLookAt(spotRot, [-8, 12, -6], [0, 3.5, 0]);
    realm3d.createLight(
      {
        kind: 'spot',
        color: [0.95, 0.35, 1.0],
        intensity: 3.5,
        range: 35.0,
        spotInnerAngleRad: 0.3,
        spotOuterAngleRad: 0.6,
        castShadow: true
      },
      { position: [-8, 12, -6], rotation: spotRot }
    );

    realm3d.setEnvironment({
      ambientColor: [0.12, 0.14, 0.2, 1.0],
      fogColor: [0.08, 0.1, 0.14, 1.0],
      fogMode: 'linear',
      fogStart: 12.0,
      fogEnd: 50.0,
      exposure: 1.2,
      outline: { enabled: true, width: 2.0 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.08, 0.15, 0.28, 1.0],
        horizonColor: [0.18, 0.25, 0.35, 1.0],
        groundColor: [0.06, 0.07, 0.1, 1.0],
        sunDirection: [0.5, 0.8, 0.3, 0.0],
        sunColor: [1.0, 0.9, 0.7, 1.0],
        sunSize: 0.04,
        intensity: 1.0
      }
    });

    let camRadius = 14.0;
    let camAzimuth = Math.PI * 0.25;
    const camElevation = 0.38;
    const camera = realm3d.createCamera(
      { kind: 'perspective', fovY: 55, near: 0.1, far: 150, cameraSlot: 1 },
      { position: [10, 4.5, 10] }
    );
    realm3d.setCameraLookAt(camera, { target: [0, 3.5, 0] });

    let animMode = 0;
    let animPaused = false;
    let autoOrbit = true;
    let animTime = 0;

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, '1')) animMode = 0;
      else if (isKey(ev, '2')) animMode = 1;
      else if (isKey(ev, '3')) animMode = 2;
      else if (isKey(ev, 'space', ' ')) animPaused = !animPaused;
      else if (isKey(ev, 'a')) autoOrbit = !autoOrbit;
      else if (isKey(ev, 'arrowleft')) camAzimuth += 0.12;
      else if (isKey(ev, 'arrowright')) camAzimuth -= 0.12;
      else if (isKey(ev, 'arrowup')) camRadius = Math.max(4.0, camRadius - 0.6);
      else if (isKey(ev, 'arrowdown')) camRadius = Math.min(35.0, camRadius + 0.6);
    });

    const camModel = realm3d.world.getComponent<Model3DComponent>(camera.entityId, 'Model3D')!;

    runtime.on('tick', ({ dt }) => {
      if (!animPaused) animTime += dt;
      if (autoOrbit && !animPaused) camAzimuth += dt * 0.35;

      const cy = Math.cos(camElevation);
      camModel.setPosition(
        camRadius * cy * Math.sin(camAzimuth),
        3.5 + camRadius * Math.sin(camElevation),
        camRadius * cy * Math.cos(camAzimuth)
      );

      const boneMatrices = computeBoneSkinningPalette(
        animTime,
        BONE_COUNT,
        TENTACLE_HEIGHT,
        animMode
      );
      realm3d.updateBones(tentacleModel.modelId, boneMatrices);
    });

    console.log(
      '[3d2] Ready. 1/2/3: mode | Space: pause | Arrows: orbit/zoom | A: auto-orbit | Esc: exit.'
    );
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
