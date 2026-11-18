import { type Model3DComponent, type MultiverseRuntime, quat, type TargetId } from '@galfus/engine';

/** A real Realm3D presented in the editor's central viewport. */
export function createEditorPreview(runtime: MultiverseRuntime, targetId: TargetId) {
  const realm = runtime.createRealm3D();
  const camera = realm.createCamera(
    { kind: 'perspective', fovY: 48, near: 0.1, far: 100, cameraSlot: 1 },
    { position: [6, 5, 8] }
  );
  realm.setCameraLookAt(camera, { target: [0, 0.7, 0] });
  realm.setEnvironment({
    ambientColor: [0.22, 0.25, 0.3, 1],
    clearColor: [0.08, 0.12, 0.16, 1],
    exposure: 1,
    skybox: {
      mode: 'procedural',
      skyColor: [0.22, 0.38, 0.5, 1],
      horizonColor: [0.52, 0.64, 0.65, 1],
      groundColor: [0.08, 0.12, 0.14, 1],
      sunDirection: [0.5, 0.8, 0.4, 0],
      sunColor: [1, 0.91, 0.77, 1.5],
      intensity: 1,
      sunSize: 0.03
    }
  });
  const floor = realm.createMaterial({ baseColor: [0.25, 0.36, 0.34, 1], roughness: 0.85 });
  const teal = realm.createMaterial({
    baseColor: [0.18, 0.75, 0.68, 1],
    metallic: 0.25,
    roughness: 0.3
  });
  const amber = realm.createMaterial({
    baseColor: [0.95, 0.59, 0.25, 1],
    metallic: 0.1,
    roughness: 0.4
  });
  const blue = realm.createMaterial({
    baseColor: [0.3, 0.52, 0.9, 1],
    metallic: 0.15,
    roughness: 0.4
  });
  realm.createPlane(14, 14, floor.materialId, { position: [0, 0, 0] }, { receiveShadow: true });
  const cube = realm.createCube(
    1.3,
    teal.materialId,
    { position: [0, 1.25, 0] },
    { castShadow: true }
  );
  const orb = realm.createSphere(
    0.6,
    16,
    24,
    amber.materialId,
    { position: [-2, 0.85, 0] },
    { castShadow: true }
  );
  realm.addCollider(cube.entityId, { type: 'box', halfExtents: [0.65, 0.65, 0.65] });
  realm.addCollider(orb.entityId, { type: 'sphere', radius: 0.6 });
  const blueCube = realm.createCube(
    1,
    blue.materialId,
    { position: [2, 0.5, 0], scale: [1, 1, 1] },
    { castShadow: true }
  );
  realm.addCollider(blueCube.entityId, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
  const lightRotation = quat.create();
  quat.fromLookAt(lightRotation, [5, 9, 6], [0, 0, 0]);
  realm.createLight(
    { kind: 'directional', color: [1, 0.96, 0.9], intensity: 2, castShadow: true },
    {
      position: [5, 9, 6],
      rotation: lightRotation
    }
  );

  let invocation = runtime.multiverse.createInvocation({
    realmId: realm.realmId,
    targetId,
    cameraSlot: 1,
    viewport: { width: { vw: 100 }, height: { vh: 100 } },
    clearColor: [0.08, 0.12, 0.16, 1]
  });
  const cubeModel = realm.world.getComponent<Model3DComponent>(cube.entityId, 'Model3D')!;
  const orbModel = realm.world.getComponent<Model3DComponent>(orb.entityId, 'Model3D')!;
  const rotation = quat.create();
  let time = 0;
  let playing = true;
  const stopTick = runtime.on('tick', ({ dt }) => {
    if (!playing) return;
    time += dt;
    quat.fromEuler(rotation, time * 0.45, time * 0.8, 0);
    cubeModel.setRotation(rotation);
    cubeModel.setPosition(0, 1.25 + Math.sin(time * 1.5) * 0.2, 0);
    orbModel.setPosition(-2, 0.85 + Math.sin(time * 1.8 + 1) * 0.25, 0);
  });

  return {
    realm,
    get invocation() {
      return invocation;
    },
    cube,
    orb,
    blueCube,
    setPlaying(value: boolean) {
      playing = value;
    },
    setTarget(target: TargetId) {
      runtime.multiverse.destroyInvocation(invocation);
      invocation = runtime.multiverse.createInvocation({
        realmId: realm.realmId,
        targetId: target,
        cameraSlot: 1,
        viewport: { width: { vw: 100 }, height: { vh: 100 } },
        clearColor: [0.08, 0.12, 0.16, 1]
      });
    },
    dispose() {
      stopTick();
      runtime.multiverse.unregisterRealm(realm.realmId);
    }
  };
}
