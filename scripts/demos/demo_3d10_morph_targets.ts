/** Demo 3D-10 - glTF-style morph targets, shadowing, and tangent-space normal updates. */

import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { extractKey, quatFromLookAt } from './utils.ts';

const WINDOW_ID = 1;
const TARGET_WINDOW = 1;
const REALM_ID = 100;
const INVOCATION_ID = 1000;
const CAMERA_ID = 1;
const LIGHT_ID = 1;
const MORPH_GEOMETRY_ID = 1000;
const GROUND_GEOMETRY_ID = 1001;
const MORPH_MATERIAL_ID = 2000;
const GROUND_MATERIAL_ID = 2001;
const MORPH_MODEL_ID = 3000;
const GROUND_MODEL_ID = 3001;

const VERTEX_BYTES = 136;
const MORPH_VERTEX_FLOATS = 12;

function createMorphGeometry(galfus: GalfusBun): void {
  const vertices = [
    [-1.5, -1.5, 0],
    [1.5, -1.5, 0],
    [1.5, 1.5, 0],
    [-1.5, 1.5, 0]
  ];
  const data = new Uint8Array(vertices.length * VERTEX_BYTES);
  const view = new DataView(data.buffer);
  for (const [index, position] of vertices.entries()) {
    const offset = index * VERTEX_BYTES;
    for (let axis = 0; axis < 3; axis++) view.setFloat32(offset + axis * 4, position[axis]!, true);
    view.setFloat32(offset + 20, 1, true);
    view.setFloat32(offset + 24, index === 1 || index === 2 ? 1 : 0, true);
    view.setFloat32(offset + 28, index >= 2 ? 0 : 1, true);
    view.setFloat32(offset + 40, 1, true);
    view.setFloat32(offset + 52, 1, true);
    for (let component = 0; component < 4; component++) {
      view.setFloat32(offset + 56 + component * 4, 1, true);
    }
  }
  galfus.realm3dCreateGeometry(
    REALM_ID,
    MORPH_GEOMETRY_ID,
    3,
    data,
    data.byteLength,
    new Uint32Array([0, 1, 2, 0, 2, 3]),
    6
  );

  // Two target-major 48-byte MorphVertex3D records per vertex: position, normal, tangent.
  const targets = new Float32Array(vertices.length * 2 * MORPH_VERTEX_FLOATS);
  for (let vertex = 0; vertex < vertices.length; vertex++) {
    const x = vertices[vertex]![0]!;
    const y = vertices[vertex]![1]!;
    const first = vertex * MORPH_VERTEX_FLOATS;
    targets[first + 2] = 0.85 * (1 - (x * x) / 2.25); // convex forward bulge
    targets[first + 4] = y * 0.28; // normal delta tilts with height
    targets[first + 6] = -x * 0.18;

    const second = (vertices.length + vertex) * MORPH_VERTEX_FLOATS;
    targets[second] = x * 0.25;
    targets[second + 1] = Math.sin(((x + 1.5) * Math.PI) / 3) * 0.55;
    targets[second + 4] = -x * 0.2;
    targets[second + 6] = -y * 0.2;
  }
  const targetBytes = new Uint8Array(targets.buffer);
  galfus.realm3dSetGeometryMorphTargets(
    REALM_ID,
    MORPH_GEOMETRY_ID,
    targetBytes,
    targetBytes.byteLength,
    2
  );
}

export async function runDemo3d10(): Promise<void> {
  console.log('=== Galfus Engine - Demo 3D-10: Morph Targets ===');
  const galfus = new GalfusBun();
  galfus.platformInit();
  galfus.windowCreate({
    id: WINDOW_ID,
    title: 'Galfus Engine - Demo 3D-10: Morph Targets',
    size: [1280, 720],
    resizable: true,
    decorations: true
  });
  galfus.multiverseAttachWindow(WINDOW_ID);
  galfus.multiverseCreateTarget(TARGET_WINDOW, { kind: { type: 'window', windowId: WINDOW_ID } });
  galfus.realm3dCreate(REALM_ID);

  createMorphGeometry(galfus);
  galfus.realm3dCreatePlane(REALM_ID, GROUND_GEOMETRY_ID, 18, 18);
  galfus.realm3dCreateMaterial(REALM_ID, MORPH_MATERIAL_ID, {
    baseColor: [0.18, 0.65, 1, 1],
    metallic: 0.18,
    roughness: 0.32,
    side: 'double'
  });
  galfus.realm3dCreateMaterial(REALM_ID, GROUND_MATERIAL_ID, {
    baseColor: [0.07, 0.08, 0.12, 1],
    roughness: 0.8
  });
  galfus.realm3dCreateModel(
    REALM_ID,
    MORPH_MODEL_ID,
    { geometryId: MORPH_GEOMETRY_ID, materialId: MORPH_MATERIAL_ID, castShadow: true },
    { position: [0, 2.3, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  );
  galfus.realm3dCreateModel(
    REALM_ID,
    GROUND_MODEL_ID,
    { geometryId: GROUND_GEOMETRY_ID, materialId: GROUND_MATERIAL_ID, castShadow: false },
    { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  );
  galfus.realm3dSetEnvironment(REALM_ID, {
    ambientColor: [0.04, 0.05, 0.08, 1],
    clearColor: [0.008, 0.012, 0.025, 1],
    skybox: { mode: 'procedural', intensity: 0.18 }
  });
  galfus.realm3dCreateLight(
    REALM_ID,
    LIGHT_ID,
    { kind: 'point', color: [1, 0.73, 0.42], intensity: 12, range: 20, castShadow: true },
    { position: [2.5, 5.5, 4], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  );

  let orbit = 0.25;
  const cameraTransform = () => {
    const position: [number, number, number] = [Math.sin(orbit) * 9, 3.8, Math.cos(orbit) * 9];
    return {
      position,
      rotation: quatFromLookAt(position, [0, 2, 0]),
      scale: [1, 1, 1] as [number, number, number]
    };
  };
  galfus.realm3dCreateCamera(
    REALM_ID,
    CAMERA_ID,
    { kind: 'perspective', fovY: 45, near: 0.1, far: 100, cameraSlot: 1 },
    cameraTransform()
  );
  galfus.multiverseCreateInvocation(INVOCATION_ID, {
    realmId: REALM_ID,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    clearColor: [0.008, 0.012, 0.025, 1]
  });

  console.log(
    'Two morph targets animate position, normal and tangent. [Space] pause, [←/→] orbit.'
  );
  let running = true;
  let playing = true;
  let elapsed = 0;
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
        if (key === ' ' || key === 'space') playing = !playing;
        if (key === 'arrowleft') orbit -= 0.16;
        if (key === 'arrowright') orbit += 0.16;
      }
    }
    if (playing) elapsed += deltaTime;
    galfus.realm3dSetModelMorphWeights(
      REALM_ID,
      MORPH_MODEL_ID,
      new Float32Array([0.5 + Math.sin(elapsed * 1.7) * 0.5, 0.5 + Math.cos(elapsed * 1.1) * 0.5]),
      2
    );
    galfus.realm3dSetCameraTransform(REALM_ID, CAMERA_ID, cameraTransform());
    galfus.multiverseDispatch(frame, deltaTime);
    await Bun.sleep(1);
  }
  galfus.platformShutdown();
}
