import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { extractKey, quatFromLookAt } from './utils.ts';

const TARGET_WINDOW = 1;
const REALM_3D = 10;
const INVOCATION_MAIN = 100;

const CAMERA_ID = 1;
const GEOM_SKINNED_TENTACLE_ID = 1;
const GEOM_FLOOR_ID = 2;

const MAT_TENTACLE_ID = 1;
const MAT_FLOOR_ID = 2;

const MODEL_TENTACLE_ID = 1;
const MODEL_FLOOR_ID = 2;

const LIGHT_SUN_ID = 1;
const LIGHT_SPOT_ID = 2;

const BONE_COUNT = 12;
const MESH_RINGS = 48;
const MESH_RADIAL_SEGS = 24;
const TENTACLE_HEIGHT = 8.0;
const BASE_RADIUS = 0.7;

type SkinnedVertex = {
  position: [number, number, number];
  normal: [number, number, number];
  uv: [number, number];
  tangent?: [number, number, number, number];
  joints?: [number, number, number, number];
  weights?: [number, number, number, number];
};

/** Generates an articulated 3D column/tentacle mesh with smooth vertex joint weights */
function buildProceduralSkinnedMesh(
  rings: number,
  radialSegs: number,
  height: number,
  boneCount: number
): { vertices: SkinnedVertex[]; indices: number[] } {
  const vertices: SkinnedVertex[] = [];
  const indices: number[] = [];

  const smoothstep = (t: number) => t * t * (3.0 - 2.0 * t);
  const segments = Math.max(1, boneCount - 1);

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = v * height;
    const radius = BASE_RADIUS * (1.0 - 0.75 * v);

    const boneF = v * segments;
    const boneIdx = Math.min(Math.floor(boneF), boneCount - 1);
    const nextIdx = Math.min(boneIdx + 1, boneCount - 1);
    const t = smoothstep(boneF - boneIdx);
    const weight0 = 1.0 - t;
    const weight1 = t;

    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const theta = u * Math.PI * 2.0;

      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      vertices.push({
        position: [cosT * radius, y, sinT * radius],
        normal: [cosT, 0.0, sinT],
        uv: [u, v],
        tangent: [-sinT, 0.0, cosT, 1.0],
        joints: [boneIdx, nextIdx, 0, 0],
        weights: [weight0, weight1, 0.0, 0.0]
      });
    }
  }

  // Include bounds corner vertices (unindexed) so auto-computed AABB covers full skeletal movement volume
  vertices.push(
    {
      position: [-4.5, 0.0, -4.5],
      normal: [0, 1, 0],
      uv: [0, 0],
      joints: [0, 0, 0, 0],
      weights: [0, 0, 0, 0]
    },
    {
      position: [4.5, height + 1.5, 4.5],
      normal: [0, 1, 0],
      uv: [0, 0],
      joints: [0, 0, 0, 0],
      weights: [0, 0, 0, 0]
    }
  );

  const ringVerts = radialSegs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const i0 = r * ringVerts + s;
      const i1 = i0 + 1;
      const i2 = (r + 1) * ringVerts + s;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  return { vertices, indices };
}

/** Packs Vertex3D records using the native 80-byte C layout. */
function packVertexData(vertices: SkinnedVertex[]): Uint8Array {
  const data = new Uint8Array(vertices.length * 80);
  const view = new DataView(data.buffer);
  for (const [index, vertex] of vertices.entries()) {
    const offset = index * 80;
    const tangent = vertex.tangent ?? [1, 0, 0, 1];
    const joints = vertex.joints ?? [0, 0, 0, 0];
    const weights = vertex.weights ?? [1, 0, 0, 0];
    [...vertex.position, ...vertex.normal, ...vertex.uv, ...tangent, ...weights].forEach(
      (value, component) => {
        const byteOffset = component < 12 ? component * 4 : (component + 4) * 4;
        view.setFloat32(offset + byteOffset, value, true);
      }
    );
    joints.forEach((joint, component) => view.setUint32(offset + 48 + component * 4, joint, true));
  }
  return data;
}

/** Computes analytical skinning matrix: M = T(dx, restY, dz) * R * T(0, -restY, 0) */
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

/** Computes skeletal skinning matrices for each bone in the chain */
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
    let rz = 0;
    let ry = 0;

    if (mode === 0) {
      // Mode 0: Serpentine Sway (Underwater swaying)
      const phaseX = time * 3.2 + i * 0.45;
      const phaseZ = time * 2.5 + i * 0.55;
      dx = Math.sin(phaseX) * frac * 2.4;
      dz = Math.cos(phaseZ) * frac * 1.8;
      rz = -Math.cos(phaseX) * frac * 0.45;
      rx = Math.sin(phaseZ) * frac * 0.4;
    } else if (mode === 1) {
      // Mode 1: Spiral Helix Dance
      const spiralTheta = time * 4.0 + i * 0.65;
      const spiralRadius = frac * 2.8;
      dx = Math.cos(spiralTheta) * spiralRadius;
      dz = Math.sin(spiralTheta) * spiralRadius;
      ry = time * 2.2 + i * 0.35;
      rz = -Math.sin(spiralTheta) * frac * 0.5;
    } else {
      // Mode 2: Kinetic Whipping Wave
      const whip = Math.sin(time * 6.0 - i * 0.85);
      dx = whip * frac * frac * 3.4;
      dz = Math.cos(time * 3.2 + i * 0.35) * frac * 1.0;
      rz = -whip * frac * 0.7;
    }

    palette.set(computeBoneMatrix(restY, dx, dz, rx, ry, rz), i * 16);
  }

  return palette;
}

export async function runDemo3d2(): Promise<void> {
  console.log('=== Galfus Engine - Demo 3D-2 (TypeScript / Bun): Procedural Skeletal Bones ===\n');

  const galfus = new GalfusBun();
  galfus.platformInit();

  const windowId = 1;
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 3D-2: Procedural Skeletal Bones (12-Joint Skinning)',
    size: [1280, 720],
    resizable: true,
    decorations: true
  });

  galfus.multiverseAttachWindow(windowId);
  galfus.multiverseCreateTarget(TARGET_WINDOW, { kind: { type: 'window', windowId } });
  galfus.realm3dCreate(REALM_3D);

  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    clearColor: [0.03, 0.04, 0.07, 1.0]
  });

  console.log('==> Generating procedural skinned column mesh with joint weights...');
  const skinnedMesh = buildProceduralSkinnedMesh(
    MESH_RINGS,
    MESH_RADIAL_SEGS,
    TENTACLE_HEIGHT,
    BONE_COUNT
  );
  const skinnedVertexData = packVertexData(skinnedMesh.vertices);
  const skinnedIndices = new Uint32Array(skinnedMesh.indices);
  galfus.realm3dCreateGeometryRaw(
    REALM_3D,
    GEOM_SKINNED_TENTACLE_ID,
    skinnedVertexData,
    skinnedVertexData.byteLength,
    skinnedIndices,
    skinnedIndices.length
  );
  console.log(
    `✔ Skinned mesh uploaded: ${skinnedMesh.vertices.length} vertices, ${skinnedMesh.indices.length / 3} triangles, ${BONE_COUNT} bones.`
  );

  galfus.realm3dCreateGeometry(REALM_3D, GEOM_FLOOR_ID, {
    primitive: 'plane',
    size: 40.0
  });

  // Materials
  galfus.realm3dCreateMaterial(REALM_3D, MAT_TENTACLE_ID, {
    surfaceType: 'opaque',
    baseColor: [0.15, 0.85, 0.95, 1.0], // Vibrant Cyan / Turquoise
    emissiveColor: [0.05, 0.25, 0.35, 1.0],
    roughness: 0.25,
    metallic: 0.6,
    reflectance: 0.8
  });

  galfus.realm3dCreateMaterial(REALM_3D, MAT_FLOOR_ID, {
    surfaceType: 'opaque',
    baseColor: [0.18, 0.2, 0.24, 1.0],
    emissiveColor: [0.0, 0.0, 0.0, 1.0],
    roughness: 0.5,
    metallic: 0.2,
    reflectance: 0.4
  });

  // Models
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_TENTACLE_ID,
    {
      geometryId: GEOM_SKINNED_TENTACLE_ID,
      materialId: MAT_TENTACLE_ID,
      castShadow: true,
      receiveShadow: true,
      castOutline: true,
      outlineColor: [0.0, 1.0, 0.9, 1.0],
      boneCount: BONE_COUNT,
      boneOffset: 0,
      active: true
    },
    {
      position: [0.0, 0.0, 0.0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  );

  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_FLOOR_ID,
    {
      geometryId: GEOM_FLOOR_ID,
      materialId: MAT_FLOOR_ID,
      castShadow: false,
      receiveShadow: true,
      active: true
    },
    {
      position: [0.0, 0.0, 0.0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  );

  // Lights: Sun directional + Spotlight casting real-time shadows
  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_SUN_ID,
    {
      kind: 'directional',
      color: [1.0, 0.95, 0.88],
      intensity: 1.5,
      castShadow: true
    },
    {
      position: [10, 18, 12],
      rotation: quatFromLookAt([10, 18, 12], [0, 3.5, 0]),
      scale: [1, 1, 1]
    }
  );

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_SPOT_ID,
    {
      kind: 'spot',
      color: [0.95, 0.35, 1.0], // Neon Magenta Spotlight
      intensity: 3.5,
      range: 35.0,
      spotInnerAngleRad: 0.3,
      spotOuterAngleRad: 0.6,
      castShadow: true
    },
    {
      position: [-8, 12, -6],
      rotation: quatFromLookAt([-8, 12, -6], [0, 3.5, 0]),
      scale: [1, 1, 1]
    }
  );

  galfus.realm3dSetEnvironment(REALM_3D, {
    ambientColor: [0.12, 0.14, 0.2, 1.0],
    fogColor: [0.08, 0.1, 0.14, 1.0],
    fogMode: 'linear',
    fogStart: 12.0,
    fogEnd: 50.0,
    exposure: 1.2,
    outline: {
      enabled: true,
      width: 2.0
    },
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

  // Camera Orbit State
  let camRadius = 14.0;
  let camAzimuth = Math.PI * 0.25;
  let camElevation = 0.38;
  const camTarget: [number, number, number] = [0.0, 3.5, 0.0];

  // Register Camera once with fovY in degrees (55.0)
  galfus.realm3dCreateCamera(
    REALM_3D,
    CAMERA_ID,
    {
      kind: 'perspective',
      fovY: 55.0,
      near: 0.1,
      far: 150.0,
      cameraSlot: 1
    },
    {
      position: [10, 4.5, 10],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  );

  const updateCamera = () => {
    const cy = Math.cos(camElevation);
    const eyeX = camTarget[0] + camRadius * cy * Math.sin(camAzimuth);
    const eyeY = camTarget[1] + camRadius * Math.sin(camElevation);
    const eyeZ = camTarget[2] + camRadius * cy * Math.cos(camAzimuth);

    const eye: [number, number, number] = [eyeX, eyeY, eyeZ];
    const rot = quatFromLookAt(eye, camTarget);

    galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, {
      position: eye,
      rotation: rot,
      scale: [1, 1, 1]
    });
  };
  updateCamera();

  console.log('\n============================================================');
  console.log('🎮 CONTROLS & INTERACTIONS:');
  console.log('  [Left / Right Arrow] : Orbit camera around the skeletal tentacle');
  console.log('  [Up / Down Arrow]    : Adjust Camera Distance (Zoom)');
  console.log('  [A]                  : Toggle Camera Auto-Orbit (On / Off)');
  console.log('  [1 / 2 / 3]          : Switch Animation: 1:Serpentine, 2:Spiral, 3:Whip');
  console.log('  [Space]              : Pause / Resume skeletal animation');
  console.log('  [O]                  : Toggle Screen-space Outline Dilation');
  console.log('  [W / S]              : Pan camera target elevation');
  console.log('  [R]                  : Reset Camera');
  console.log('  [ESC]                : Exit demo');
  console.log('============================================================\n');

  let animMode = 0;
  const modeNames = ['Serpentine Sway', 'Spiral Helix Dance', 'Kinetic Whip'];
  let animPaused = false;
  let autoOrbit = true;
  let outlineEnabled = true;
  let animTime = 0.0;
  let running = true;

  let lastFrameTime = performance.now();
  let frameCount = 0;
  let fpsTimer = performance.now();

  while (running) {
    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000.0, 0.1);
    lastFrameTime = now;

    if (!animPaused) {
      animTime += dt;
    }

    // 1. Process Platform Window & Input Events
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          running = false;
          break;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
          updateCamera();
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        if (ev.state === 'pressed') {
          const key = extractKey(ev);

          if (key === 'escape') {
            running = false;
            break;
          } else if (key === '1') {
            animMode = 0;
            console.log(`▶ Animation Mode: ${modeNames[animMode]}`);
          } else if (key === '2') {
            animMode = 1;
            console.log(`▶ Animation Mode: ${modeNames[animMode]}`);
          } else if (key === '3') {
            animMode = 2;
            console.log(`▶ Animation Mode: ${modeNames[animMode]}`);
          } else if (key === ' ' || key === 'space') {
            animPaused = !animPaused;
            console.log(animPaused ? '⏸ Animation Paused' : '▶ Animation Resumed');
          } else if (key === 'o') {
            outlineEnabled = !outlineEnabled;
            galfus.realm3dSetEnvironment(REALM_3D, {
              outline: { enabled: outlineEnabled, width: 2.0 }
            });
            console.log(`[Input] Outline: ${outlineEnabled ? 'ON' : 'OFF'}`);
          } else if (key === 'a') {
            autoOrbit = !autoOrbit;
            console.log(`[Input] Camera Auto-Orbit: ${autoOrbit ? 'ON' : 'OFF'}`);
          } else if (key === 'arrowleft') {
            camAzimuth += 0.12;
            updateCamera();
          } else if (key === 'arrowright') {
            camAzimuth -= 0.12;
            updateCamera();
          } else if (key === 'arrowup') {
            camRadius = Math.max(4.0, camRadius - 0.6);
            updateCamera();
          } else if (key === 'arrowdown') {
            camRadius = Math.min(35.0, camRadius + 0.6);
            updateCamera();
          } else if (key === 'w') {
            camTarget[1] = Math.min(8.0, camTarget[1] + 0.4);
            updateCamera();
          } else if (key === 's') {
            camTarget[1] = Math.max(1.0, camTarget[1] - 0.4);
            updateCamera();
          } else if (key === 'r') {
            camRadius = 14.0;
            camAzimuth = Math.PI * 0.25;
            camElevation = 0.38;
            camTarget[1] = 3.5;
            autoOrbit = true;
            updateCamera();
            console.log('[Input] Camera reset.');
          }
        }
      }
    }

    if (!running) break;

    // 2. Continuous Smooth Orbit Camera
    if (autoOrbit && !animPaused) {
      camAzimuth += dt * 0.35;
      updateCamera();
    }

    // 3. Compute Procedural Skeletal Bone Matrices on Host & Upload to GPU
    const boneMatrices = computeBoneSkinningPalette(
      animTime,
      BONE_COUNT,
      TENTACLE_HEIGHT,
      animMode
    );
    galfus.realm3dUpdateBones(REALM_3D, MODEL_TENTACLE_ID, boneMatrices, boneMatrices.length);

    // 4. Render Multiverse frame
    galfus.multiverseDispatch(frameCount, dt);

    frameCount++;
    if (now - fpsTimer >= 1000.0) {
      const fps = (frameCount * 1000.0) / (now - fpsTimer);
      console.log(
        `[Demo 3D-2] FPS: ${fps.toFixed(1)} | Mode: ${modeNames[animMode]} | Bones: ${BONE_COUNT} | CamDist: ${camRadius.toFixed(1)}`
      );
      frameCount = 0;
      fpsTimer = now;
    }

    await Bun.sleep(1);
  }

  console.log('==> Cleaning up Demo 3D-2 resources...');
  galfus.platformShutdown();
  console.log('✔ Demo 3D-2 finished cleanly.');
}
