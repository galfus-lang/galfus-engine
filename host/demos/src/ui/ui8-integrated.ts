import {
  type Camera2DComponent,
  type Model3DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createUi, type UiPanelComponent } from '@galfus/ui';
import { canExitAfterOverlays, runDemoLoop } from '../common/loop';
import { canExitUi5 } from './ui5-text-fields';
import { createEditorControls } from './ui8-controls';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import { createEditorPreview } from './ui8-preview';
import { createEditorSplits } from './ui8-splits';

type Color = [number, number, number, number];
const colors = {
  background: [0.055, 0.067, 0.085, 1],
  chrome: [0.09, 0.106, 0.129, 1],
  surface: [0.105, 0.122, 0.149, 1],
  text: [0.88, 0.91, 0.94, 1],
  muted: [0.54, 0.6, 0.66, 1],
  accent: [0.3, 0.72, 0.73, 1]
} satisfies Record<string, Color>;

const exact = (value: number) => ({ type: 'exact' as const, value });
const full = { type: 'percent' as const, value: 100 };

function text(parent: UiPanelComponent, value: string, size = 12, color: Color = colors.text) {
  return parent.addText(value, size, { color });
}

/** Visual editor mockup containing a live 3D realm. */
export function createUi8Scene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  windowId?: WindowId,
  size: readonly [number, number] = [960, 720]
) {
  const realm = runtime.createRealm2D();
  realm.setShadowConfig({ ambient: 1 });
  const camera = realm.createCamera({ orthoScale: size[1], near: -100, far: 100 });
  runtime.multiverse.createInvocation({
    realmId: realm.realmId,
    targetId,
    clearColor: colors.background,
    zIndex: 0
  });
  const ui = createUi(runtime);
  const root = ui.createComponentRoot(realm, {
    width: size[0],
    height: size[1],
    windowId,
    panel: { backgroundColor: colors.background },
    layout: { isStack: true }
  });
  let renderTarget = runtime.multiverse.createTarget({
    kind: { type: 'texture', width: 1, height: 1 }
  });
  const preview = createEditorPreview(runtime, renderTarget);
  const slot = 'editor-viewport';
  runtime.multiverse.bindTargetTexture({
    sourceTargetId: renderTarget,
    realmId: realm.realmId,
    slot
  });

  const header = root.root.addPanel(
    { backgroundColor: colors.chrome },
    {
      width: full,
      height: exact(44),
      direction: 'row',
      alignItems: 'center',
      justifyContent: 'spaceBetween',
      padding: [0, 16, 0, 16]
    }
  );
  const brand = header.addPanel({}, { direction: 'row', alignItems: 'center', gap: [10, 0] });
  const logo = brand.addPanel(
    { backgroundColor: colors.accent, borderRadius: [4, 4, 4, 4] },
    {
      width: exact(22),
      height: exact(22),
      alignItems: 'center',
      justifyContent: 'center'
    }
  );
  text(logo, 'G', 13, colors.background);
  const title = text(brand, 'GALFUS  /  EDITOR', 13);
  text(header, 'My Game  /  Main Scene', 11, colors.muted);

  const toolbar = root.root.addPanel(
    { backgroundColor: colors.surface },
    {
      width: full,
      height: exact(40),
      direction: 'row',
      alignItems: 'center',
      justifyContent: 'spaceBetween',
      padding: [0, 16, 0, 16],
      positionOffset: [0, 44]
    }
  );

  const hierarchy = root.root.addPanel(
    { backgroundColor: colors.chrome, clip: true },
    { direction: 'column', padding: [10, 8, 8, 8], gap: [0, 5] }
  );

  const viewport = root.root.addSpritePanel({ textureId: renderTarget });
  const inspector = root.root.addPanel(
    { backgroundColor: colors.chrome, clip: true },
    { direction: 'column', padding: [8, 8, 8, 8], gap: [0, 4] }
  );

  const assets = root.root.addPanel(
    { backgroundColor: colors.surface, clip: true },
    {
      width: full,
      height: exact(142),
      direction: 'column',
      padding: [8, 10, 8, 10],
      gap: [0, 4]
    }
  );
  assets.addText('PROJECT NOTES', 11);
  const status = root.root.addPanel(
    { backgroundColor: [0.07, 0.09, 0.11, 1] },
    {
      width: full,
      height: exact(22),
      direction: 'row',
      alignItems: 'center',
      justifyContent: 'spaceBetween',
      padding: [0, 12, 0, 12],
      positionOffset: [0, size[1] - 22]
    }
  );
  const statusText = text(status, 'Ready   •   Click an object in the viewport', 10, colors.muted);
  text(status, 'Galfus Engine', 10, colors.muted);

  let surfaceWidth = 1;
  let surfaceHeight = 1;
  let disconnectSurface: (() => void) | undefined;
  const cubeListener = runtime.interactive(preview.realm.realmId, {
    type: 'collider',
    entityId: preview.cube.entityId
  });
  const orbListener = runtime.interactive(preview.realm.realmId, {
    type: 'collider',
    entityId: preview.orb.entityId
  });
  const blueListener = runtime.interactive(preview.realm.realmId, {
    type: 'collider',
    entityId: preview.blueCube.entityId
  });
  const objects = {
    Cube: preview.cube.entityId,
    Sphere: preview.orb.entityId,
    'Blue cube': preview.blueCube.entityId
  };
  let selected: keyof typeof objects = 'Cube';
  const names = { Cube: 'Cube', Sphere: 'Sphere', 'Blue cube': 'Blue cube' };
  const setStatus = (message: string) => {
    if (root.syncState === 'disposed') return;
    statusText.setText(message);
    root.flush();
  };
  const selectObject = (label: keyof typeof objects) => {
    selected = label;
    for (const entity of Object.values(objects)) {
      const model = preview.realm.world.getComponent<Model3DComponent>(entity, 'Model3D')!;
      model.setScale(1, 1, 1);
    }
    controls.updateSelection(label, names[label]);
    setStatus(`Selected   •   ${label}`);
  };
  const manager = windowId === undefined ? undefined : ui.createOverlayManager(root, windowId);
  const controls = createEditorControls({
    ui,
    manager,
    header,
    toolbar,
    hierarchy,
    inspector,
    assets,
    selectObject,
    setScale: (scale) =>
      preview.realm.world
        .getComponent<Model3DComponent>(objects[selected], 'Model3D')!
        .setScale(scale, scale, scale),
    rename: (value) => {
      names[selected] = value;
    },
    setPlaying: (value) => preview.setPlaying(value),
    setStatus
  });
  cubeListener.on('click', () => selectObject('Cube'));
  orbListener.on('click', () => selectObject('Sphere'));
  blueListener.on('click', () => selectObject('Blue cube'));
  const splits = createEditorSplits(
    root.root,
    { hierarchy, viewport, inspector, assets },
    (viewWidth, viewHeight) => {
      if (!disconnectSurface || viewWidth !== surfaceWidth || viewHeight !== surfaceHeight) {
        disconnectSurface?.();
        runtime.multiverse.unbindTargetTexture(realm.realmId, slot);
        const oldTarget = renderTarget;
        renderTarget = runtime.multiverse.createTarget({
          kind: { type: 'texture', width: viewWidth, height: viewHeight }
        });
        preview.setTarget(renderTarget);
        viewport.setProperties({ textureId: renderTarget });
        runtime.multiverse.bindTargetTexture({
          sourceTargetId: renderTarget,
          realmId: realm.realmId,
          slot
        });
        root.flush();
        disconnectSurface = runtime.interaction.connectUiSurface({
          realmId: realm.realmId,
          uiId: root.uiId,
          elementId: viewport.id,
          slot
        });
        runtime.multiverse.destroyTarget(oldTarget);
        surfaceWidth = viewWidth;
        surfaceHeight = viewHeight;
      }
      root.flush();
    }
  );
  const resize = (width: number, height: number) => {
    root.root.setLayout({ ...root.root.layout, width: exact(width), height: exact(height) });
    status.setLayout({ ...status.layout, positionOffset: [0, height - 22] });
    splits.resize(width, height);
    manager?.setViewport([0, 0, width, height]);
  };
  resize(size[0], size[1]);
  const stopResize =
    windowId === undefined
      ? undefined
      : runtime.on('window', (event) => {
          if (
            event.windowId !== windowId ||
            event.type !== 'resized' ||
            event.width <= 0 ||
            event.height <= 0 ||
            root.syncState === 'disposed'
          )
            return;
          const component = realm.world.getComponent<Camera2DComponent>(
            camera.entityId,
            'Camera2D'
          );
          if (component) {
            component.desc.orthoScale = event.height;
            component.isDirty = true;
          }
          resize(event.width, event.height);
        });
  return {
    realm,
    ui,
    root,
    title,
    header,
    toolbar,
    manager,
    controls,
    splits,
    hierarchy,
    viewport,
    statusText,
    get renderTarget() {
      return renderTarget;
    },
    preview,
    inspector,
    assets,
    status,
    resize,
    dispose: () => {
      stopResize?.();
      disconnectSurface?.();
      cubeListener.dispose();
      orbListener.dispose();
      blueListener.dispose();
      ui.dispose();
      preview.dispose();
      runtime.multiverse.destroyTarget(renderTarget);
      runtime.multiverse.unregisterRealm(realm.realmId);
    }
  };
}

export async function runDemoUi8(options: HostDemoOptions = {}): Promise<void> {
  const session = createDemoSession(
    options.title ?? 'Galfus Demo [ui8]: Game Editor',
    options,
    [960, 720]
  );
  try {
    const scene = createUi8Scene(session.runtime, session.targetId, session.windowId, session.size);
    try {
      await runDemoLoop(session.runtime, {
        windowId: session.windowId,
        maxFrames: session.maxFrames,
        exitKeys: ['escape', 'q'],
        canExit: (event) =>
          canExitAfterOverlays(event, scene.manager) &&
          canExitUi5([scene.controls.name, scene.controls.notes], session.windowId, event)
      });
    } finally {
      scene.dispose();
    }
  } finally {
    session.runtime.dispose();
  }
}
if (import.meta.main) await runDemoUi8();
