/** Demo 3D-9 - Material sides and tangent-space normal mapping. */

import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { extractKey, quatFromLookAt } from './utils.ts';

const WINDOW_ID = 1;
const TARGET_WINDOW = 1;
const REALM_3D = 90;
const INVOCATION_MAIN = 900;
const CAMERA_ID = 1;
const LIGHT_ID = 1;

const PANEL_GEOMETRY_ID = 100;
const GROUND_GEOMETRY_ID = 101;
const NORMAL_TEXTURE_ID = 900;

const MAT_FRONT = 200;
const MAT_BACK = 201;
const MAT_DOUBLE = 202;
const MAT_FLAT = 203;
const MAT_GROUND = 204;

const MODEL_FRONT = 300;
const MODEL_BACK = 301;
const MODEL_DOUBLE = 302;
const MODEL_FLAT = 303;
const MODEL_GROUND = 304;

interface GeometryTarget {
  realm3dCreateGeometry(
    realmId: number,
    geometryId: number,
    topology: number,
    vertexData: Uint8Array,
    vertexDataLen: number,
    indices: Uint32Array,
    indexCount: number
  ): void;
}

function createPanelGeometry(target: GeometryTarget): void {
  const vertices = [
    { position: [-1.2, -1.5, 0], uv: [0, 1], uv1: [1, 1] },
    { position: [1.2, -1.5, 0], uv: [1, 1], uv1: [0, 1] },
    { position: [1.2, 1.5, 0], uv: [1, 0], uv1: [0, 0] },
    { position: [-1.2, 1.5, 0], uv: [0, 0], uv1: [1, 0] }
  ];
  const data = new Uint8Array(vertices.length * 136);
  const view = new DataView(data.buffer);

  for (let index = 0; index < vertices.length; index++) {
    const source = vertices[index]!;
    const offset = index * 136;
    for (let axis = 0; axis < 3; axis++) {
      view.setFloat32(offset + axis * 4, source.position[axis]!, true);
    }
    view.setFloat32(offset + 20, 1, true); // Normal +Z.
    view.setFloat32(offset + 24, source.uv[0]!, true);
    view.setFloat32(offset + 28, source.uv[1]!, true);
    view.setFloat32(offset + 32, source.uv1[0]!, true);
    view.setFloat32(offset + 36, source.uv1[1]!, true);
    view.setFloat32(offset + 40, 1, true); // Tangent +X.
    view.setFloat32(offset + 52, 1, true); // Positive bitangent handedness.
    for (let component = 0; component < 4; component++) {
      view.setFloat32(offset + 56 + component * 4, 1, true);
    }
  }

  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  target.realm3dCreateGeometry(
    REALM_3D,
    PANEL_GEOMETRY_ID,
    3,
    data,
    data.byteLength,
    indices,
    indices.length
  );
}

function createNormalMap(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const nx = Math.sin(u * Math.PI * 8) * 0.65;
      const ny = Math.cos(v * Math.PI * 6) * 0.45;
      const nz = Math.sqrt(Math.max(0.001, 1 - nx * nx - ny * ny));
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round((nx * 0.5 + 0.5) * 255);
      pixels[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      pixels[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

export async function runDemo3d9(): Promise<void> {
  console.log('=== Galfus Engine - Demo 3D-9: Material Sides & Tangent-Space Normal Mapping ===');

  const galfus = new GalfusBun();
  galfus.platformInit();
  galfus.windowCreate({
    id: WINDOW_ID,
    title: 'Galfus Engine - Demo 3D-9: Sides & Normal Mapping',
    size: [1280, 720],
    resizable: true,
    decorations: true
  });
  galfus.multiverseAttachWindow(WINDOW_ID);
  galfus.multiverseCreateTarget(TARGET_WINDOW, { kind: { type: 'window', windowId: WINDOW_ID } });
  galfus.realm3dCreate(REALM_3D);

  const normalMap = createNormalMap(64);
  galfus.resourceCreateTexture(
    NORMAL_TEXTURE_ID,
    {
      label: 'Demo 3D-9 Linear Procedural Normal Map',
      width: 64,
      height: 64,
      format: 'rgba8Unorm',
      usages: { copyDst: true, textureBinding: true }
    },
    normalMap,
    normalMap.byteLength
  );

  createPanelGeometry(galfus);
  galfus.realm3dCreatePlane(REALM_3D, GROUND_GEOMETRY_ID, 18, 18);

  const normalMaterial = (
    side: 'front' | 'back' | 'double',
    color: [number, number, number, number],
    normalScale: number
  ) => ({
    side,
    baseColor: color,
    roughness: 0.48,
    metallic: 0.08,
    normalTextureId: NORMAL_TEXTURE_ID,
    normalScale,
    textureUvSets: ['uv0', 'uv1'] as ('uv0' | 'uv1')[]
  });

  galfus.realm3dCreateMaterial(
    REALM_3D,
    MAT_FRONT,
    normalMaterial('front', [0.18, 0.6, 1, 1], 1.25)
  );
  galfus.realm3dCreateMaterial(REALM_3D, MAT_BACK, normalMaterial('back', [0.2, 1, 0.5, 1], 1.25));
  galfus.realm3dCreateMaterial(
    REALM_3D,
    MAT_DOUBLE,
    normalMaterial('double', [0.9, 0.3, 1, 1], 1.25)
  );
  galfus.realm3dCreateMaterial(
    REALM_3D,
    MAT_FLAT,
    normalMaterial('front', [0.82, 0.78, 0.68, 1], 0)
  );
  galfus.realm3dCreateMaterial(REALM_3D, MAT_GROUND, {
    baseColor: [0.055, 0.065, 0.09, 1],
    roughness: 0.82,
    metallic: 0.05
  });

  const panels = [
    {
      id: MODEL_FRONT,
      materialId: MAT_FRONT,
      position: [-4.2, 1.8, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number]
    },
    {
      id: MODEL_BACK,
      materialId: MAT_BACK,
      position: [-1.4, 1.8, 0] as [number, number, number],
      rotation: [0, 1, 0, 0] as [number, number, number, number]
    },
    {
      id: MODEL_DOUBLE,
      materialId: MAT_DOUBLE,
      position: [1.4, 1.8, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number]
    },
    {
      id: MODEL_FLAT,
      materialId: MAT_FLAT,
      position: [4.2, 1.8, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number]
    }
  ];
  for (const panel of panels) {
    galfus.realm3dCreateModel(
      REALM_3D,
      panel.id,
      {
        geometryId: PANEL_GEOMETRY_ID,
        materialId: panel.materialId,
        castShadow: true,
        receiveShadow: true
      },
      { position: panel.position, rotation: panel.rotation, scale: [1, 1, 1] }
    );
  }
  galfus.realm3dCreateModel(
    REALM_3D,
    MODEL_GROUND,
    {
      geometryId: GROUND_GEOMETRY_ID,
      materialId: MAT_GROUND,
      castShadow: false,
      receiveShadow: true
    },
    { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  );

  galfus.realm3dSetEnvironment(REALM_3D, {
    ambientColor: [0.035, 0.04, 0.065, 1],
    clearColor: [0.008, 0.012, 0.025, 1],
    exposure: 1.15,
    skybox: { mode: 'procedural', intensity: 0.2 },
    ssao: { enabled: true, radius: 0.35, bias: 0.02, power: 1.1, intensity: 0.65, blurRadius: 2 }
  });

  galfus.realm3dCreateLight(
    REALM_3D,
    LIGHT_ID,
    { kind: 'point', color: [1, 0.72, 0.38], intensity: 9, range: 22, castShadow: true },
    { position: [0, 4.6, 4.8], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  );

  let cameraAngle = 0.28;
  const cameraRadius = 13;
  const cameraTransform = () => {
    const position: [number, number, number] = [
      Math.sin(cameraAngle) * cameraRadius,
      3.6,
      Math.cos(cameraAngle) * cameraRadius
    ];
    return {
      position,
      rotation: quatFromLookAt(position, [0, 1.7, 0]),
      scale: [1, 1, 1] as [number, number, number]
    };
  };
  galfus.realm3dCreateCamera(
    REALM_3D,
    CAMERA_ID,
    { kind: 'perspective', fovY: 45, near: 0.1, far: 100, cameraSlot: 1 },
    cameraTransform()
  );

  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_3D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    clearColor: [0.008, 0.012, 0.025, 1]
  });

  console.log(
    'Panels: front normal-mapped, back normal-mapped, double normal-mapped, flat normalScale=0.'
  );
  console.log('Controls: [Space] toggle orbit, [Left/Right] orbit, [Escape] exit.');

  let running = true;
  let autoOrbit = true;
  let lastTime = performance.now();
  let frame = 0;
  while (running) {
    const now = performance.now();
    const deltaTime = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    frame++;

    for (const event of galfus.platformPumpEvents()) {
      if (event.kind === 'window') {
        if (event.type === 'closeRequested') running = false;
        if (event.type === 'resized')
          galfus.multiverseUpdateWindowSize(WINDOW_ID, event.width, event.height);
      } else if (event.kind === 'keyboard' && event.type === 'input' && event.state === 'pressed') {
        const key = extractKey(event);
        if (key === 'escape') running = false;
        if (key === ' ' || key === 'space') autoOrbit = !autoOrbit;
        if (key === 'arrowleft') cameraAngle -= 0.18;
        if (key === 'arrowright') cameraAngle += 0.18;
      }
    }

    if (autoOrbit) cameraAngle += deltaTime * 0.24;
    galfus.realm3dSetCameraTransform(REALM_3D, CAMERA_ID, cameraTransform());
    galfus.multiverseDispatch(frame, deltaTime);
    await Bun.sleep(1);
  }

  galfus.platformShutdown();
}
