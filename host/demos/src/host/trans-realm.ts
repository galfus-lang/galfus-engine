/**
 * Trans-realm event flow demo proving traversal across a nested presentation graph:
 * Realm 1 (3D Window) → 3D Plane Mesh → Realm 2 (2D World) → 2D Surface Sprite → Realm 3 (3D World).
 */
import {
  createRuntime,
  type Model2DComponent,
  type Model3DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { createUi } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { type HostDemoOptions, resolveDemoOptions } from '../common/options';

export function createTransRealmScene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  _windowId?: WindowId,
  _initialSize: readonly [number, number] = [1000, 700]
) {
  const ui = createUi(runtime);
  const clicks = { r1: 0, r2: 0, r3: 0 };
  const transition = { duration: 0.15 };

  // =========================================================================
  // TARGET ALLOCATIONS (Created first so materials can bind their texture IDs)
  // =========================================================================
  const target2 = runtime.multiverse.createTarget(20, {
    kind: { type: 'texture', width: 500, height: 400 }
  });
  const target3 = runtime.multiverse.createTarget(30, {
    kind: { type: 'texture', width: 300, height: 300 }
  });

  // =========================================================================
  // LEVEL 1: REALM 1 (Realm3D - Root Window Scene, Depth 1)
  // =========================================================================
  const realm1 = runtime.createRealm3D(1);
  realm1.setEnvironment({
    ambientColor: [0.35, 0.4, 0.5, 1.0],
    clearColor: [0.22, 0.28, 0.38, 1.0]
  });
  realm1.createCamera(
    { kind: 'perspective', fovY: 50, near: 0.1, far: 100 },
    { position: [0, 0, 6] }
  );
  realm1.createLight(
    { kind: 'point', color: [1.0, 0.98, 0.92], intensity: 2.2, range: 40 },
    { position: [2, 4, 6] }
  );
  realm1.createLight(
    { kind: 'point', color: [0.35, 0.85, 1.0], intensity: 1.8, range: 30 },
    { position: [-3, 2, 4] }
  );

  runtime.multiverse.createInvocation(1, {
    realmId: realm1.realmId,
    targetId,
    zIndex: 0,
    clearColor: [0.22, 0.28, 0.38, 1.0]
  });

  // Level 1: Interactive 3D Sphere in Realm 1 (Direct Raycast - Depth 1)
  const r1SphereMat = realm1.createMaterial({
    baseColor: [0.95, 0.7, 0.15, 1.0],
    metallic: 0.35,
    roughness: 0.35
  }).materialId;
  const r1SphereEntity = realm1.createSphere(0.7, 24, 24, r1SphereMat, {
    position: [-2.0, 0, 0]
  });
  realm1.addCollider(r1SphereEntity.entityId, { type: 'sphere', radius: 0.7 });
  const r1Sphere = ui.focusable(
    1,
    { type: 'collider', entityId: r1SphereEntity.entityId },
    { tabIndex: 0 }
  );
  r1Sphere.listener.on('hover', () => {
    realm1.animateModel(
      r1SphereEntity.entityId,
      { scale: [1.15, 1.15, 1.15] },
      transition,
      runtime.animation
    );
  });
  r1Sphere.listener.on('leave', () => {
    realm1.animateModel(
      r1SphereEntity.entityId,
      { scale: [1, 1, 1] },
      transition,
      runtime.animation
    );
  });
  r1Sphere.listener.on('click', () => {
    clicks.r1++;
    console.log(`[trans-realm] Click on Realm 1 Gold Sphere (Depth 1). Total R1=${clicks.r1}`);
  });

  // Level 1: 3D Monitor Frame & Quad Mesh textured with Target 20 (Realm 2)
  const bezelMat = realm1.createMaterial({
    baseColor: [0.08, 0.09, 0.12, 1.0],
    metallic: 0.8,
    roughness: 0.3
  }).materialId;
  const bezel = realm1.createPrimitive({ kind: 'quad', width: 3.76, height: 2.96 }, bezelMat, {
    position: [0.8, 0, -0.01]
  });

  const unlitScreenShader = `
    fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
      var out: SurfaceOutput;
      out.albedo = vec4<f32>(0.0, 0.0, 0.0, 1.0);
      out.emissive = in.albedo.rgb;
      out.roughness = 1.0;
      out.metallic = 0.0;
      out.normal = in.world_normal;
      return out;
    }
  `;

  const screenMat = realm1.createMaterial({
    albedoTextureId: target2,
    baseColor: [1.0, 1.0, 1.0, 1.0],
    shaderEffect: unlitScreenShader
  }).materialId;
  const screenQuad = realm1.createPrimitive({ kind: 'quad', width: 3.6, height: 2.8 }, screenMat, {
    position: [0.8, 0, 0]
  });
  realm1.addCollider(screenQuad.entityId, { type: 'plane', halfExtents: [1.8, 1.4] });
  runtime.interactive(1, { type: 'collider', entityId: screenQuad.entityId });

  // Connect Realm 1 3D Plane to Texture Target 20 (Realm 2)
  runtime.multiverse.bindTargetTexture({ realmId: 1, slot: 'plane_portal', sourceTargetId: 20 });
  runtime.multiverse.connectPresentationSurface({
    realmId: 1,
    slot: 'plane_portal',
    entityId: screenQuad.entityId
  });

  // =========================================================================
  // LEVEL 2: REALM 2 (Realm2D - Texture Target 20, Depth 2)
  // =========================================================================
  const realm2 = runtime.createRealm2D(2);
  realm2.setShadowConfig({ ambient: 1.0 });
  realm2.createCamera({ orthoScale: 400 });

  runtime.multiverse.createInvocation(2, {
    realmId: 2,
    targetId: target2,
    clearColor: [0.07, 0.12, 0.2, 1.0]
  });

  // Level 2: Interactive 2D Button Shape in Realm 2 (Traversed via 3D Plane - Depth 2)
  const btnMat = realm2.createMaterial({
    baseColor: [0.15, 0.55, 0.95, 1.0],
    surfaceType: 'opaque'
  });
  const r2BtnEntity = realm2.createShape(
    { kind: 'rectangle', size: [140, 70], materialId: btnMat },
    { position: [-120, 0] }
  );
  realm2.addCollider(r2BtnEntity, { type: 'rectangle', halfExtents: [70, 35] });
  const r2Btn = ui.focusable(2, { type: 'collider', entityId: r2BtnEntity }, { tabIndex: 0 });
  r2Btn.listener.on('hover', () => {
    realm2.animateModel(r2BtnEntity, { scale: [1.12, 1.12] }, transition, runtime.animation);
  });
  r2Btn.listener.on('leave', () => {
    realm2.animateModel(r2BtnEntity, { scale: [1, 1] }, transition, runtime.animation);
  });
  r2Btn.listener.on('click', () => {
    clicks.r2++;
    console.log(
      `[trans-realm] Click on Realm 2 2D Button via 3D Plane (Depth 2). Total R2=${clicks.r2}`
    );
  });

  // Level 2: 2D Surface Sprite textured with Target 30 (Realm 3)
  const frameMat = realm2.createMaterial({
    baseColor: [0.15, 0.2, 0.3, 1.0],
    surfaceType: 'opaque'
  });
  const frame2 = realm2.createShape(
    { kind: 'rectangle', size: [170, 170], materialId: frameMat },
    { position: [100, 0] }
  );

  const subMat = realm2.createMaterial({
    textureId: target3,
    baseColor: [1.0, 1.0, 1.0, 1.0],
    surfaceType: 'opaque'
  });
  const surface2 = realm2.createSprite(
    { dimensions: [160, 160], materialId: subMat },
    { position: [100, 0] }
  );
  realm2.addCollider(surface2, { type: 'rectangle', halfExtents: [80, 80] });
  runtime.interactive(2, { type: 'collider', entityId: surface2 });

  // Connect Realm 2 2D Surface to Texture Target 30 (Realm 3)
  runtime.multiverse.bindTargetTexture({ realmId: 2, slot: 'sub_portal', sourceTargetId: 30 });
  runtime.multiverse.connectPresentationSurface({
    realmId: 2,
    slot: 'sub_portal',
    entityId: surface2
  });

  // =========================================================================
  // LEVEL 3: REALM 3 (Realm3D - Texture Target 30, Depth 3 - MAX DEPTH!)
  // =========================================================================
  const realm3 = runtime.createRealm3D(3);
  realm3.setEnvironment({
    ambientColor: [0.65, 0.7, 0.85, 1.0],
    clearColor: [0.22, 0.12, 0.38, 1.0]
  });
  realm3.createCamera(
    { kind: 'perspective', fovY: 50, near: 0.1, far: 100 },
    { position: [0, 0, 4.5] }
  );
  realm3.createLight(
    { kind: 'point', color: [1.0, 0.95, 0.9], intensity: 2.5, range: 35 },
    { position: [2, 3, 4] }
  );
  realm3.createLight(
    { kind: 'point', color: [0.3, 0.9, 1.0], intensity: 1.8, range: 25 },
    { position: [-3, 1, 3] }
  );

  runtime.multiverse.createInvocation(3, {
    realmId: 3,
    targetId: target3,
    clearColor: [0.22, 0.12, 0.38, 1.0]
  });

  // Level 3: Interactive 3D Sphere in Realm 3 (Traversed 3D → 2D → 3D - Depth 3)
  const r3OrbMat = realm3.createMaterial({
    baseColor: [0.05, 0.95, 0.82, 1.0],
    emissiveColor: [0.0, 0.45, 0.4, 1.0],
    metallic: 0.3,
    roughness: 0.15
  }).materialId;
  const r3OrbEntity = realm3.createSphere(0.8, 24, 24, r3OrbMat, { position: [0, 0, 0] });
  realm3.addCollider(r3OrbEntity.entityId, { type: 'sphere', radius: 0.8 });
  const r3Orb = ui.focusable(
    3,
    { type: 'collider', entityId: r3OrbEntity.entityId },
    { tabIndex: 0 }
  );
  r3Orb.listener.on('hover', () => {
    realm3.animateModel(
      r3OrbEntity.entityId,
      { scale: [1.18, 1.18, 1.18] },
      transition,
      runtime.animation
    );
  });
  r3Orb.listener.on('leave', () => {
    realm3.animateModel(r3OrbEntity.entityId, { scale: [1, 1, 1] }, transition, runtime.animation);
  });
  r3Orb.listener.on('click', () => {
    clicks.r3++;
    console.log(
      `[trans-realm] Click on Realm 3 3D Orb via 3D→2D→3D (Depth 3 - MAX). Total R3=${clicks.r3}`
    );
  });

  // =========================================================================
  // DYNAMIC SPATIAL ANIMATION (Proves position changes across all 3 realms)
  // =========================================================================
  const r1SphereModel = realm1.world.getComponent<Model3DComponent>(
    r1SphereEntity.entityId,
    'Model3D'
  );
  const bezelModel = realm1.world.getComponent<Model3DComponent>(bezel.entityId, 'Model3D');
  const screenModel = realm1.world.getComponent<Model3DComponent>(screenQuad.entityId, 'Model3D');
  const r2BtnModel = realm2.world.getComponent<Model2DComponent>(r2BtnEntity, 'Model2D');
  const frame2Model = realm2.world.getComponent<Model2DComponent>(frame2, 'Model2D');
  const surface2Model = realm2.world.getComponent<Model2DComponent>(surface2, 'Model2D');
  const r3OrbModel = realm3.world.getComponent<Model3DComponent>(r3OrbEntity.entityId, 'Model3D');

  runtime.on('tick', ({ timeMs }) => {
    const t = timeMs * 0.001;

    // Realm 1 (3D Root Window): Gold sphere floats smoothly
    r1SphereModel?.setPosition(-2.0, Math.sin(t * 1.5) * 0.35, 0);

    // Realm 1 (3D Root Window): Monitor bezel and screen quad sway together
    const monitorY = Math.sin(t * 1.0) * 0.2;
    bezelModel?.setPosition(0.8, monitorY, -0.01);
    screenModel?.setPosition(0.8, monitorY, 0);

    // Realm 2 (2D World inside Target 20): Blue button oscillates vertically
    r2BtnModel?.setPosition(-120, Math.sin(t * 1.8) * 40);

    // Realm 2 (2D World inside Target 20): Sub-portal frame & sprite move in counter-phase
    const r2SubY = -Math.sin(t * 1.4) * 30;
    frame2Model?.setPosition(100, r2SubY);
    surface2Model?.setPosition(100, r2SubY);

    // Realm 3 (3D World inside Target 30): Cyan orb orbits in 3D space
    r3OrbModel?.setPosition(
      Math.sin(t * 2.0) * 0.5,
      Math.sin(t * 1.3) * 0.4,
      Math.cos(t * 2.0) * 0.3
    );
  });

  return {
    ui,
    realm1,
    realm2,
    realm3,
    r1Sphere,
    r2Btn,
    r3Orb,
    clicks
  };
}

export type TransRealmDemoOptions = HostDemoOptions;

export async function runTransRealmDemo(options: TransRealmDemoOptions = {}): Promise<void> {
  const { headless, maxFrames } = resolveDemoOptions(options);
  const runtime = createRuntime(createBunTransport({ headless }));
  let windowId: WindowId | undefined;

  try {
    windowId = headless
      ? undefined
      : runtime.platform.window.create({
          title: 'Galfus Host - Trans-Realm Traversal (3D → 2D → 3D)',
          size: [1000, 700]
        });

    const targetId = runtime.multiverse.createTarget(
      windowId === undefined
        ? { kind: { type: 'texture', width: 1000, height: 700 } }
        : { kind: { type: 'window', windowId } }
    );
    const size =
      windowId === undefined ? ([1000, 700] as const) : runtime.platform.window.getSize(windowId);

    createTransRealmScene(runtime, targetId, windowId, size);
    console.log(
      headless
        ? '[trans-realm] Running headless smoke test.'
        : '[trans-realm] Ready! Traversal chain: Realm 1 (3D) → 3D Plane Mesh → Realm 2 (2D) → 2D Sprite → Realm 3 (3D). Press Esc to exit.'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
