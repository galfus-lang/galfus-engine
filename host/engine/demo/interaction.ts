/** Interactive host demo for direct 2D, SVG, and 3D pointer targets. */
import {
  type Camera2DComponent,
  createRuntime,
  type Model3DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { runDemoLoop } from './loop';
import { type HostDemoOptions, resolveDemoOptions } from './options';

const PANEL = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="360" viewBox="0 0 300 360">
  <rect x="0" y="0" width="300" height="360" rx="12" fill="#101d2d"/>
  <text x="20" y="35" fill="#f0f7ff" font-family="sans-serif" font-size="20" font-weight="bold">POINTER LAB</text>
  <text x="20" y="58" fill="#9cb6cf" font-family="sans-serif" font-size="11">Hover and click each target</text>
  <text x="20" y="85" fill="#72d9e9" font-family="sans-serif" font-size="12">SVG ELEMENT</text>
  <rect id="svg-button" x="20" y="98" width="260" height="48" rx="8" fill="#246380"/>
  <text x="38" y="127" fill="#ffffff" font-family="sans-serif" font-size="15">Click this SVG button</text>
  <text x="20" y="174" fill="#72d9e9" font-family="sans-serif" font-size="12">2D COLLIDER</text>
  <text x="110" y="220" fill="#dceafa" font-family="sans-serif" font-size="12">Click the circle</text>
  <text x="20" y="250" fill="#9cb6cf" font-family="sans-serif" font-size="11">3D: click the objects on the left</text>
  <text x="20" y="270" fill="#72d9e9" font-family="sans-serif" font-size="12">LAST EVENT</text>
  <text id="status" x="20" y="293" fill="#ffffff" font-family="sans-serif" font-size="12">Move the pointer to begin</text>
  <text id="count" x="20" y="315" fill="#9cb6cf" font-family="sans-serif" font-size="12">Clicks: 0</text>
  <text x="20" y="344" fill="#758da5" font-family="sans-serif" font-size="10">ESC / Q to exit</text>
</svg>`;

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
  realm3d.createLight(
    { kind: 'point', color: [1, 1, 1], intensity: 40, range: 30 },
    { position: [0, 4, 5] }
  );
  const cubeMaterial = realm3d.createMaterial({
    baseColor: [0.08, 0.65, 0.85, 1],
    metallic: 0.25,
    roughness: 0.4
  }).materialId;
  const sphereMaterial = realm3d.createMaterial({
    baseColor: [0.95, 0.35, 0.2, 1],
    metallic: 0.15,
    roughness: 0.4
  }).materialId;
  const cube = realm3d.createCube(1.5, cubeMaterial, { position: [-1.1, 0, 0] });
  const sphere = realm3d.createSphere(0.85, 16, 24, sphereMaterial, { position: [1.15, 0, 0] });
  realm3d.addCollider(cube.entityId, { type: 'box', halfExtents: [0.75, 0.75, 0.75] });
  realm3d.addCollider(sphere.entityId, { type: 'sphere', radius: 0.85 });

  const camera2d = realm2d.createCamera({ orthoScale: 460 });
  const camera2dComponent = realm2d.world.getComponent<Camera2DComponent>(
    camera2d.entityId,
    'Camera2D'
  )!;
  const camera3dModel = realm3d.world.getComponent<Model3DComponent>(camera3d.entityId, 'Model3D')!;
  const resize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const scale = Math.max(390, (320 * height) / (width * 0.44));
    if (camera2dComponent.desc.orthoScale !== scale) {
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
  const svg = realm2d.createSvg({ source: PANEL, castShadow: false, receiveShadow: false });
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
  const status = (text: string) => realm2d.setSvgText(svg, 'status', text);
  const clicked = (name: string) => {
    clicks++;
    status(`Clicked: ${name}`);
    realm2d.setSvgText(svg, 'count', `Clicks: ${clicks}`);
    console.log(`[interaction] ${name}: click ${clicks}`);
  };

  const button = runtime.interactive(realm2d.realmId, {
    type: 'svg',
    svgId: svg.svgId,
    elementId: 'svg-button'
  });
  const transition = { duration: 0.2, easing: 'easeOutQuad' as const };
  const buttonNormal = {
    type: 'vec4' as const,
    value: [36 / 255, 99 / 255, 128 / 255, 1] as [number, number, number, number]
  };
  const buttonHover = {
    type: 'vec4' as const,
    value: [57 / 255, 165 / 255, 195 / 255, 1] as [number, number, number, number]
  };
  let buttonTransition: ReturnType<typeof runtime.animation.createTransition> | undefined;
  button.on('hover', () => {
    setCursor(true);
    status('Hover: SVG button');
    buttonTransition ??= runtime.animation.createTransition(buttonNormal, transition, {
      kind: 'svgAttributeColor',
      realmId: realm2d.realmId,
      svgId: svg.svgId,
      elementId: 'svg-button',
      attribute: 'fill'
    });
    runtime.animation.transitionTo(buttonTransition, buttonHover, transition);
  });
  button.on('leave', () => {
    setCursor(false);
    if (buttonTransition !== undefined)
      runtime.animation.transitionTo(buttonTransition, buttonNormal, transition);
  });
  button.on('click', () => clicked('SVG button'));

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
  return { realm2d, realm3d, svg, circle, cube, sphere };
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
        : '[interaction] Hover and click the 3D objects, SVG button and 2D circle. Press Esc to exit.'
    );

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
