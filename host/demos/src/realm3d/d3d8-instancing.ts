import {
  type InstancedModel3DComponent,
  isKey,
  type Model3DComponent,
  utils3D
} from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, getScrollY, type HostDemoOptions } from '../common/options';

function writeInstanceMat4(
  out: Float32Array,
  instanceIdx: number,
  px: number,
  py: number,
  pz: number,
  rotY: number,
  sx: number,
  sy: number,
  sz: number,
  color: [number, number, number, number] = [1, 1, 1, 1],
  emissive: [number, number, number, number] = [0, 0, 0, 0]
): void {
  const base = instanceIdx * 32;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  out[base + 0] = c * sx;
  out[base + 1] = 0;
  out[base + 2] = -s * sx;
  out[base + 3] = 0;
  out[base + 4] = 0;
  out[base + 5] = sy;
  out[base + 6] = 0;
  out[base + 7] = 0;
  out[base + 8] = s * sz;
  out[base + 9] = 0;
  out[base + 10] = c * sz;
  out[base + 11] = 0;
  out[base + 12] = px;
  out[base + 13] = py;
  out[base + 14] = pz;
  out[base + 15] = 1;
  // Color Vec4
  out[base + 16] = color[0];
  out[base + 17] = color[1];
  out[base + 18] = color[2];
  out[base + 19] = color[3];
  // Emissive Vec4
  out[base + 20] = emissive[0];
  out[base + 21] = emissive[1];
  out[base + 22] = emissive[2];
  out[base + 23] = emissive[3];
  // PBR Vec4 (metallic, roughness, reflectance, ao)
  out[base + 24] = 0.5;
  out[base + 25] = 0.5;
  out[base + 26] = 0.04;
  out[base + 27] = 1.0;
  // Custom Vec4
  out[base + 28] = 0;
  out[base + 29] = 0;
  out[base + 30] = 0;
  out[base + 31] = 0;
}

export async function runDemo3d8(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 3D-8 Hardware GPU Instancing',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();

    const camPos: [number, number, number] = [0, 14, 22];
    const camTarget: [number, number, number] = [0, 1.5, 0];
    const camera = realm3d.createCamera(
      { fovY: 50, near: 0.1, far: 300, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    realm3d.setEnvironment({
      ambientColor: [0.15, 0.18, 0.25, 0.35],
      exposure: 1.15,
      ssao: { radius: 0.65, bias: 0.025, intensity: 1.4, power: 1.8 },
      skybox: {
        mode: 'procedural',
        skyColor: [0.05, 0.1, 0.24, 1.0],
        horizonColor: [0.3, 0.5, 0.8, 1.0],
        groundColor: [0.06, 0.06, 0.08, 1.0],
        sunDirection: [0.45, 0.8, 0.35, 0.0],
        sunColor: [1.0, 0.95, 0.85, 3.0],
        intensity: 1.0
      }
    });

    const sunPos: [number, number, number] = [12, 22, 10];
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.95, 0.85], intensity: 3.0, castShadow: true },
      { position: sunPos, rotation: utils3D.quatFromLookAt(sunPos, [0, 0, 0]) }
    );
    realm3d.createLight(
      { kind: 'point', color: [0.1, 0.85, 1.0], intensity: 25.0, range: 26.0, castShadow: false },
      { position: [-8, 5, 0] }
    );
    realm3d.createLight(
      { kind: 'point', color: [1.0, 0.25, 0.6], intensity: 25.0, range: 26.0, castShadow: false },
      { position: [8, 5, 0] }
    );

    const floorMat = realm3d.createMaterial({
      baseColor: [0.14, 0.16, 0.2, 1.0],
      metallic: 0.2,
      roughness: 0.65
    }).materialId;
    const cubeMat = realm3d.createMaterial({
      baseColor: [0.2, 0.78, 0.98, 1.0],
      metallic: 0.75,
      roughness: 0.22
    }).materialId;
    const orbMat = realm3d.createMaterial({
      baseColor: [1.0, 0.65, 0.18, 1.0],
      metallic: 0.85,
      roughness: 0.15,
      emissiveColor: [0.35, 0.12, 0.02, 1.0]
    }).materialId;

    realm3d.createPlane(45, 45, floorMat, { position: [0, 0, 0] });

    const cubeGeo = realm3d.createGeometry({ kind: 'cube', size: 0.52 }).geometryId;
    const sphereGeo = realm3d.createGeometry({
      kind: 'sphere',
      radius: 0.32,
      rings: 16,
      sectors: 24
    }).geometryId;

    const GRID_SIZE = 25;
    const GRID_COUNT = GRID_SIZE * GRID_SIZE;
    const SPACING = 0.78;
    const cubeInstances = new Float32Array(GRID_COUNT * 32);

    const RING_COUNT = 120;
    const orbInstances = new Float32Array(RING_COUNT * 32);

    const updateInstances = (time: number, amp: number, speed: number) => {
      let idx = 0;
      const half = (GRID_SIZE - 1) * 0.5;
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        for (let gx = 0; gx < GRID_SIZE; gx++) {
          const x = (gx - half) * SPACING;
          const z = (gz - half) * SPACING;
          const dist = Math.hypot(x, z);
          const wave = Math.sin(dist * 0.65 - time * 2.8 * speed) * amp;
          const heightScale = Math.max(0.25, 1.2 + wave * 1.1);
          const py = heightScale * 0.26;
          const rotY = dist * 0.15 + time * 0.4 * speed;
          writeInstanceMat4(cubeInstances, idx++, x, py, z, rotY, 1.0, heightScale, 1.0);
        }
      }

      for (let i = 0; i < RING_COUNT; i++) {
        const t = i / RING_COUNT;
        const angle = t * Math.PI * 4 + time * 0.7 * speed;
        const radius = 5.5 + Math.sin(t * Math.PI * 6 + time * speed) * 3.2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 3.2 + Math.sin(angle * 2.0 - time * 2.0 * speed) * (0.9 * amp);
        const s = 0.75 + 0.35 * Math.sin(i * 0.5 + time * 3.0);
        writeInstanceMat4(orbInstances, i, x, y, z, angle, s, s, s);
      }
    };

    updateInstances(0, 1.2, 1.0);

    const cubeBatchEntity = realm3d.createInstancedModel({
      geometryId: cubeGeo,
      materialId: cubeMat,
      capacity: GRID_COUNT,
      castShadow: true,
      receiveShadow: true
    });
    const orbBatchEntity = realm3d.createInstancedModel({
      geometryId: sphereGeo,
      materialId: orbMat,
      capacity: RING_COUNT,
      castShadow: true,
      receiveShadow: false
    });

    const cubeInstancedId = realm3d.world.getComponent<InstancedModel3DComponent>(
      cubeBatchEntity,
      'InstancedModel3D'
    )!.instancedModelId;
    const orbInstancedId = realm3d.world.getComponent<InstancedModel3DComponent>(
      orbBatchEntity,
      'InstancedModel3D'
    )!.instancedModelId;

    realm3d.flush();

    realm3d.setInstancedModelData(cubeInstancedId, cubeInstances);
    realm3d.setInstancedModelData(orbInstancedId, orbInstances);

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.05, 0.07, 0.12, 1.0]
    });

    let elapsed = 0;
    let waveAmp = 1.2;
    let waveSpeed = 1.0;
    let orbitYaw = 0.4;
    let orbitPitch = 0.55;
    let orbitDist = 24.0;
    let isDragging = false;
    let lastMouse: [number, number] = [0, 0];

    runtime.on('pointer', (ev) => {
      if (ev.type === 'button' && ev.button === 'primary') {
        isDragging = ev.state === 'pressed';
        lastMouse = ev.position;
      } else if (ev.type === 'move' && isDragging) {
        orbitYaw -= (ev.position[0] - lastMouse[0]) * 0.007;
        orbitPitch = Math.max(
          0.1,
          Math.min(1.35, orbitPitch + (ev.position[1] - lastMouse[1]) * 0.007)
        );
        lastMouse = ev.position;
      } else if (ev.type === 'scroll') {
        orbitDist = Math.max(8.0, Math.min(42.0, orbitDist - getScrollY(ev.delta) * 0.8));
      }
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed') {
        if (isKey(ev, '1')) waveAmp = waveAmp > 1.5 ? 0.6 : waveAmp + 0.45;
        else if (isKey(ev, '2')) waveSpeed = waveSpeed > 1.8 ? 0.5 : waveSpeed + 0.5;
      }
    });

    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      if (!isDragging) orbitYaw += dt * 0.18;

      const cx = Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      const cy = Math.sin(orbitPitch) * orbitDist + 1.0;
      const cz = Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      realm3d.world
        .getComponent<Model3DComponent>(camera.entityId, 'Model3D')
        ?.setPosition(cx, cy, cz);

      updateInstances(elapsed, waveAmp, waveSpeed);
      realm3d.setInstancedModelData(cubeInstancedId, cubeInstances);
      realm3d.setInstancedModelData(orbInstancedId, orbInstances);
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemo3d8();
}
