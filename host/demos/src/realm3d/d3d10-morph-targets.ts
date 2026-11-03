import { isKey, type Model3DComponent, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, getScrollY, type HostDemoOptions } from '../common/options';

function createMorphableSphere(radius: number, rings: number, sectors: number) {
  const vertexCount = (rings + 1) * (sectors + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const tangents = new Float32Array(vertexCount * 4);
  const indices: number[] = [];

  const target0 = new Float32Array(vertexCount * 3);
  const target1 = new Float32Array(vertexCount * 3);
  const target2 = new Float32Array(vertexCount * 3);

  let vIdx = 0;
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let s = 0; s <= sectors; s++) {
      const u = s / sectors;
      const theta = u * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const nx = cosTheta * sinPhi;
      const ny = cosPhi;
      const nz = sinTheta * sinPhi;

      const px = nx * radius;
      const py = ny * radius;
      const pz = nz * radius;

      const i3 = vIdx * 3;
      const i2 = vIdx * 2;
      const i4 = vIdx * 4;

      positions[i3 + 0] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      normals[i3 + 0] = nx;
      normals[i3 + 1] = ny;
      normals[i3 + 2] = nz;

      uvs[i2 + 0] = u;
      uvs[i2 + 1] = v;

      tangents[i4 + 0] = -sinTheta;
      tangents[i4 + 1] = 0.0;
      tangents[i4 + 2] = cosTheta;
      tangents[i4 + 3] = 1.0;

      const spike = Math.pow(Math.max(0, Math.cos(theta * 4) * Math.sin(phi * 4)), 2) * 0.95;
      target0[i3 + 0] = nx * spike;
      target0[i3 + 1] = ny * spike;
      target0[i3 + 2] = nz * spike;

      const maxAbs = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz), 1e-4);
      const cx = (nx / maxAbs) * radius * 0.85;
      const cy = (ny / maxAbs) * radius * 0.85;
      const cz = (nz / maxAbs) * radius * 0.85;
      target1[i3 + 0] = cx - px;
      target1[i3 + 1] = cy - py;
      target1[i3 + 2] = cz - pz;

      const twistAngle = ny * 1.4;
      const cosT = Math.cos(twistAngle);
      const sinT = Math.sin(twistAngle);
      const tx = (px * cosT - pz * sinT) * 0.75;
      const ty = py * 1.45;
      const tz = (px * sinT + pz * cosT) * 0.75;
      target2[i3 + 0] = tx - px;
      target2[i3 + 1] = ty - py;
      target2[i3 + 2] = tz - pz;

      vIdx++;
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const first = r * (sectors + 1) + s;
      const second = first + sectors + 1;
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    vertexCount,
    positions,
    normals,
    uvs,
    tangents,
    indices: new Uint32Array(indices),
    targets: [{ positions: target0 }, { positions: target1 }, { positions: target2 }]
  };
}

export async function runDemo3d10(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 3D-10 Morph Targets (Blend Shapes)',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();

    const camPos: [number, number, number] = [0, 3.2, 8.5];
    const camTarget: [number, number, number] = [0, 1.5, 0];
    const camera = realm3d.createCamera(
      { fovY: 50, near: 0.1, far: 200, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.16, 0.18, 0.25, 0.3],
      exposure: 1.15,
      ssao: { radius: 0.6, bias: 0.025, intensity: 1.4, power: 1.8 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.05, 0.1, 0.22, 1.0],
        horizonColor: [0.3, 0.48, 0.78, 1.0],
        groundColor: [0.06, 0.06, 0.08, 1.0],
        sunDirection: [0.4, 0.85, 0.35, 0.0],
        sunColor: [1.0, 0.96, 0.88, 2.8],
        intensity: 1.0
      }
    });

    const sunPos: [number, number, number] = [6, 12, 8];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.95, 0.88], intensity: 2.8, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );
    realm3d.createLight(
      { kind: 'point', color: [0.15, 0.85, 1.0], intensity: 16.0, range: 16.0, castShadow: false },
      { position: [-4, 3, 2] }
    );
    realm3d.createLight(
      { kind: 'point', color: [1.0, 0.25, 0.6], intensity: 16.0, range: 16.0, castShadow: false },
      { position: [4, 3, 2] }
    );

    const floorMat = realm3d.createMaterial({
      baseColor: [0.16, 0.18, 0.22, 1.0],
      metallic: 0.2,
      roughness: 0.6
    }).materialId;
    const centerMat = realm3d.createMaterial({
      baseColor: [0.2, 0.85, 0.98, 1.0],
      metallic: 0.75,
      roughness: 0.2,
      emissiveColor: [0.02, 0.15, 0.25, 1.0]
    }).materialId;
    const leftMat = realm3d.createMaterial({
      baseColor: [1.0, 0.35, 0.6, 1.0],
      metallic: 0.6,
      roughness: 0.25,
      emissiveColor: [0.2, 0.02, 0.08, 1.0]
    }).materialId;
    const rightMat = realm3d.createMaterial({
      baseColor: [1.0, 0.78, 0.2, 1.0],
      metallic: 0.85,
      roughness: 0.18,
      emissiveColor: [0.2, 0.12, 0.0, 1.0]
    }).materialId;

    realm3d.createPlane(30, 30, floorMat, { position: [0, 0, 0] });

    const morphGeoData = createMorphableSphere(1.15, 32, 48);
    const morphGeo = realm3d.createGeometry({
      positions: morphGeoData.positions,
      normals: morphGeoData.normals,
      uvs: morphGeoData.uvs,
      tangents: morphGeoData.tangents,
      indices: morphGeoData.indices,
      topology: 3
    }).geometryId;
    realm3d.setGeometryMorphTargets(morphGeo, morphGeoData.targets, morphGeoData.vertexCount);

    const modelCenter = realm3d.createModel(
      { geometryId: morphGeo, materialId: centerMat },
      { position: [0, 1.8, 0] }
    );
    const modelLeft = realm3d.createModel(
      { geometryId: morphGeo, materialId: leftMat },
      { position: [-3.2, 1.6, -0.8], scale: [0.85, 0.85, 0.85] }
    );
    const modelRight = realm3d.createModel(
      { geometryId: morphGeo, materialId: rightMat },
      { position: [3.2, 1.6, -0.8], scale: [0.85, 0.85, 0.85] }
    );

    const centerModelId = realm3d.world.getComponent<Model3DComponent>(
      modelCenter,
      'Model3D'
    )!.modelId;
    const leftModelId = realm3d.world.getComponent<Model3DComponent>(modelLeft, 'Model3D')!.modelId;
    const rightModelId = realm3d.world.getComponent<Model3DComponent>(
      modelRight,
      'Model3D'
    )!.modelId;

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });

    let elapsed = 0;
    let autoPlay = true;
    const manualWeights = new Float32Array([0, 0, 0]);
    const weightsCenter = new Float32Array(3);
    const weightsLeft = new Float32Array(3);
    const weightsRight = new Float32Array(3);

    let orbitYaw = 0;
    let orbitPitch = 0.25;
    let orbitDist = 8.5;
    let isDragging = false;
    let lastMouse: [number, number] = [0, 0];

    runtime.on('pointer', (ev) => {
      if (ev.type === 'button' && ev.button === 'primary') {
        isDragging = ev.state === 'pressed';
        lastMouse = ev.position;
      } else if (ev.type === 'move' && isDragging) {
        orbitYaw -= (ev.position[0] - lastMouse[0]) * 0.007;
        orbitPitch = Math.max(
          0.05,
          Math.min(1.2, orbitPitch + (ev.position[1] - lastMouse[1]) * 0.007)
        );
        lastMouse = ev.position;
      } else if (ev.type === 'scroll') {
        orbitDist = Math.max(4.0, Math.min(16.0, orbitDist - getScrollY(ev.delta) * 0.5));
      }
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed') {
        if (isKey(ev, 'space', ' ')) autoPlay = !autoPlay;
        else if (isKey(ev, '1')) {
          autoPlay = false;
          manualWeights[0] = manualWeights[0]! > 0.5 ? 0.0 : 1.0;
        } else if (isKey(ev, '2')) {
          autoPlay = false;
          manualWeights[1] = manualWeights[1]! > 0.5 ? 0.0 : 1.0;
        } else if (isKey(ev, '3')) {
          autoPlay = false;
          manualWeights[2] = manualWeights[2]! > 0.5 ? 0.0 : 1.0;
        }
      }
    });

    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      if (!isDragging) orbitYaw = Math.sin(elapsed * 0.35) * 0.45;

      const cx = Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      const cy = Math.sin(orbitPitch) * orbitDist + 1.2;
      const cz = Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      realm3d.world
        .getComponent<Model3DComponent>(camera.entityId, 'Model3D')
        ?.setPosition(cx, cy, cz);

      if (autoPlay) {
        weightsCenter[0] = Math.max(0, Math.sin(elapsed * 1.8));
        weightsCenter[1] = Math.max(0, Math.sin(elapsed * 1.8 + (Math.PI * 2) / 3));
        weightsCenter[2] = Math.max(0, Math.sin(elapsed * 1.8 + (Math.PI * 4) / 3));
      } else {
        weightsCenter.set(manualWeights);
      }

      weightsLeft[0] = 0.5 + 0.5 * Math.sin(elapsed * 2.5);
      weightsLeft[1] = 0.0;
      weightsLeft[2] = 0.5 + 0.5 * Math.cos(elapsed * 1.9);

      weightsRight[0] = 0.0;
      weightsRight[1] = 0.5 + 0.5 * Math.sin(elapsed * 2.1);
      weightsRight[2] = 0.5 + 0.5 * Math.sin(elapsed * 3.0);

      realm3d.setModelMorphWeights(centerModelId, weightsCenter);
      realm3d.setModelMorphWeights(leftModelId, weightsLeft);
      realm3d.setModelMorphWeights(rightModelId, weightsRight);

      const rotCenter = utils3D.quatFromAxisAngle([0, 1, 0], elapsed * 0.6);
      const rotSide = utils3D.quatFromAxisAngle([0.2, 1, 0.1], -elapsed * 0.8);
      realm3d.world
        .getComponent<Model3DComponent>(modelCenter, 'Model3D')
        ?.setTRS([0, 1.8, 0], rotCenter, [1, 1, 1]);
      realm3d.world
        .getComponent<Model3DComponent>(modelLeft, 'Model3D')
        ?.setTRS([-3.2, 1.6, -0.8], rotSide, [0.85, 0.85, 0.85]);
      realm3d.world
        .getComponent<Model3DComponent>(modelRight, 'Model3D')
        ?.setTRS([3.2, 1.6, -0.8], rotSide, [0.85, 0.85, 0.85]);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemo3d10();
}
