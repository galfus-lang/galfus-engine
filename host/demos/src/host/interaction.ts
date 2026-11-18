/** Interactive host demo for direct 2D, UI, and 3D pointer targets. */
import {
  type Camera2DComponent,
  createRuntime,
  type Model3DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { UiRoot } from '@galfus/ui';
import { createBunTransport } from '@galfus/transport-bun';
import { runDemoLoop } from '../common/loop';
import { type HostDemoOptions, resolveDemoOptions } from '../common/options';

/** Builds both viewports and returns the IDs needed to exercise the scene in tests. */
export function createInteractionScene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  windowId?: WindowId,
  initialSize: readonly [number, number] = [1100, 700]
) {
  const realm3d = runtime.createRealm3D();
  const realm2d = runtime.createRealm2D();
  runtime.multiverse.createInvocation({
    realmId: realm3d.realmId,
    targetId,
    viewport: { width: { vw: 56 }, height: { vh: 100 } },
    clearColor: [0.025, 0.04, 0.065, 1]
  });
  runtime.multiverse.createInvocation({
    realmId: realm2d.realmId,
    targetId,
    zIndex: 1,
    viewport: { anchorX: 'right', width: { vw: 44 }, height: { vh: 100 } },
    clearColor: [0.025, 0.04, 0.065, 1]
  });

  realm3d.setEnvironment({
    ambientColor: [0.45, 0.5, 0.58, 1],
    clearColor: [0.025, 0.04, 0.065, 1]
  });
  const camera3d = realm3d.createCamera(
    { kind: 'perspective', fovY: 50, near: 0.1, far: 100 },
    { position: [0, 0, 7] }
  );
  const camera3dModel = realm3d.world.getComponent<Model3DComponent>(camera3d.entityId, 'Model3D')!;
  const cubeMaterial = realm3d.createMaterial({
    baseColor: [0.95, 0.45, 0.25, 1],
    roughness: 0.35,
    metallic: 0.2
  }).materialId;
  const cube = realm3d.createCube(1.6, cubeMaterial, { position: [-1.4, 0, 0] });
  realm3d.addCollider(cube.entityId, { type: 'box', halfExtents: [0.8, 0.8, 0.8] });

  const sphereMaterial = realm3d.createMaterial({
    baseColor: [0.28, 0.62, 0.95, 1],
    roughness: 0.25,
    metallic: 0.65
  }).materialId;
  const sphere = realm3d.createSphere(1, 24, 32, sphereMaterial, { position: [1.4, 0, 0] });
  realm3d.addCollider(sphere.entityId, { type: 'sphere', radius: 1 });

  const camera2d = realm2d.createCamera({ orthoScale: 700 });
  const camera2dComponent = realm2d.world.getComponent<Camera2DComponent>(
    camera2d.entityId,
    'Camera2D'
  );
  const resize = (width: number, height: number) => {
    const scale = Math.max(360, (360 * Math.max(width * 0.44, 300)) / 300);
    if (camera2dComponent) {
      camera2dComponent.desc.orthoScale = scale;
      camera2dComponent.isDirty = true;
    }
    const distance = Math.max(7, (2.2 * height) / (width * 0.56 * Math.tan((25 * Math.PI) / 180)));
    camera3dModel.setPosition(0, 0, distance);
  };
  resize(initialSize[0], initialSize[1]);
  if (windowId !== undefined)
    runtime.on('window', (event) => {
      if (event.windowId === windowId && event.type === 'resized')
        resize(event.width, event.height);
    });

  realm2d.setShadowConfig({ ambient: 1 });

  // Native Model2DUI Pointer Lab card
  const uiRoot = new UiRoot(runtime, realm2d, {
    width: 300,
    height: 360,
    position: [0, 0]
  });
  uiRoot.rootPanel.setBackgroundColor([16 / 255, 29 / 255, 45 / 255, 1.0]).setBorderRadius(12);

  uiRoot.addText({
    text: 'POINTER LAB',
    fontSize: 20,
    color: [240 / 255, 247 / 255, 1.0, 1.0],
    x: 20,
    y: 18
  });
  uiRoot.addText({
    text: 'Hover and click each target',
    fontSize: 11,
    color: [156 / 255, 182 / 255, 207 / 255, 1.0],
    x: 20,
    y: 44
  });
  uiRoot.addText({
    text: 'UI BUTTON',
    fontSize: 12,
    color: [114 / 255, 217 / 255, 233 / 255, 1.0],
    x: 20,
    y: 72
  });

  const buttonPanel = uiRoot.addPanel({
    id: 'ui-button',
    x: 20,
    y: 98,
    width: 260,
    height: 48,
    borderRadius: 8,
    backgroundColor: [36 / 255, 99 / 255, 128 / 255, 1.0]
  });
  buttonPanel.addText({
    text: 'Click this UI button',
    fontSize: 15,
    color: [1.0, 1.0, 1.0, 1.0],
    x: 18,
    y: 14
  });

  uiRoot.addText({
    text: '2D COLLIDER',
    fontSize: 12,
    color: [114 / 255, 217 / 255, 233 / 255, 1.0],
    x: 20,
    y: 160
  });
  uiRoot.addText({
    text: 'Click the circle',
    fontSize: 12,
    color: [220 / 255, 234 / 255, 250 / 255, 1.0],
    x: 110,
    y: 208
  });
  uiRoot.addText({
    text: '3D: click the objects on the left',
    fontSize: 11,
    color: [156 / 255, 182 / 255, 207 / 255, 1.0],
    x: 20,
    y: 238
  });
  uiRoot.addText({
    text: 'LAST EVENT',
    fontSize: 12,
    color: [114 / 255, 217 / 255, 233 / 255, 1.0],
    x: 20,
    y: 258
  });

  const statusText = uiRoot.addText({
    text: 'Move the pointer to begin',
    fontSize: 12,
    color: [1.0, 1.0, 1.0, 1.0],
    x: 20,
    y: 280
  });

  const countText = uiRoot.addText({
    text: 'Clicks: 0',
    fontSize: 12,
    color: [156 / 255, 182 / 255, 207 / 255, 1.0],
    x: 20,
    y: 302
  });

  uiRoot.addText({
    text: 'ESC / Q to exit',
    fontSize: 10,
    color: [117 / 255, 141 / 255, 165 / 255, 1.0],
    x: 20,
    y: 332
  });

  const circleMaterial = realm2d.createMaterial({
    baseColor: [0.2, 0.82, 0.62, 1],
    surfaceType: 'opaque'
  });
  const circle = realm2d.createShape(
    {
      kind: 'circle',
      radius: 25,
      segments: 32,
      materialId: circleMaterial,
      castShadow: false,
      receiveShadow: false
    },
    { position: [-78, -36], zLayer: 1 }
  );
  realm2d.addCollider(circle, { type: 'circle', radius: 25 });

  let clicks = 0;
  const setCursor = (hovered: boolean) => {
    if (windowId !== undefined)
      runtime.platform.window.setCursorIcon(windowId, hovered ? 'pointer' : 'default');
  };
  const status = (text: string) => statusText.setText(text);
  const clicked = (name: string) => {
    clicks++;
    status(`Clicked: ${name}`);
    countText.setText(`Clicks: ${clicks}`);
    console.log(`[interaction] ${name}: click ${clicks}`);
  };

  const transition = { duration: 0.2, easing: 'easeOutQuad' as const };
  const buttonNormal = [36 / 255, 99 / 255, 128 / 255, 1] as [number, number, number, number];
  const buttonHover = [57 / 255, 165 / 255, 195 / 255, 1] as [number, number, number, number];

  buttonPanel.on('hover', () => {
    setCursor(true);
    status('Hover: UI button');
    buttonPanel.setBackgroundColor(buttonHover);
  });
  buttonPanel.on('leave', () => {
    setCursor(false);
    buttonPanel.setBackgroundColor(buttonNormal);
  });
  buttonPanel.on('click', () => clicked('UI button'));

  const circleListener = runtime.interactive(realm2d.realmId, {
    type: 'collider',
    entityId: circle
  });
  circleListener.on('hover', () => {
    setCursor(true);
    status('Hover: 2D circle');
    realm2d.animateModel(circle, { scale: [1.15, 1.15] }, transition, runtime.animation);
  });
  circleListener.on('leave', () => {
    setCursor(false);
    realm2d.animateModel(circle, { scale: [1, 1] }, transition, runtime.animation);
  });
  circleListener.on('click', () => clicked('2D circle'));

  for (const [name, entityId] of [
    ['3D cube', cube.entityId],
    ['3D sphere', sphere.entityId]
  ] as const) {
    const listener = runtime.interactive(realm3d.realmId, { type: 'collider', entityId });
    listener.on('hover', () => {
      setCursor(true);
      status(`Hover: ${name}`);
      realm3d.animateModel(entityId, { scale: [1.12, 1.12, 1.12] }, transition, runtime.animation);
    });
    listener.on('leave', () => {
      setCursor(false);
      realm3d.animateModel(entityId, { scale: [1, 1, 1] }, transition, runtime.animation);
    });
    listener.on('click', () => clicked(name));
  }
  return {
    realm2d,
    realm3d,
    uiRoot,
    buttonPanel,
    statusText,
    countText,
    circle,
    cube,
    sphere,
    clicked,
    status
  };
}

export type InteractionDemoOptions = HostDemoOptions;

export async function runInteractionDemo(options: InteractionDemoOptions = {}): Promise<void> {
  const { headless, maxFrames } = resolveDemoOptions(options);

  const runtime = createRuntime(createBunTransport({ headless }));
  let windowId: WindowId | undefined;
  try {
    windowId = headless
      ? undefined
      : runtime.platform.window.create({ title: 'Galfus Host - Pointer Lab', size: [1100, 700] });
    const targetId = runtime.multiverse.createTarget(
      windowId === undefined
        ? { kind: { type: 'texture', width: 1100, height: 700 } }
        : { kind: { type: 'window', windowId } }
    );
    const size =
      windowId === undefined ? ([1100, 700] as const) : runtime.platform.window.getSize(windowId);
    createInteractionScene(runtime, targetId, windowId, size);
    console.log(
      headless
        ? '[interaction] Running headless smoke test.'
        : '[interaction] Hover and click the 3D objects, UI button and 2D circle. Press Esc to exit.'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runInteractionDemo();
}
