import {
  type Camera2DComponent,
  type Model3DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createUi, type UiPanelComponent } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import { createEditorPreview } from './ui8-preview';
import { createEditorSplits } from './ui8-splits';

type Color = [number, number, number, number];
const colors = {
  background: [0.055, 0.067, 0.085, 1],
  chrome: [0.09, 0.106, 0.129, 1],
  surface: [0.105, 0.122, 0.149, 1],
  elevated: [0.14, 0.16, 0.19, 1],
  border: [0.2, 0.23, 0.27, 1],
  text: [0.88, 0.91, 0.94, 1],
  muted: [0.54, 0.6, 0.66, 1],
  accent: [0.3, 0.72, 0.73, 1]
} satisfies Record<string, Color>;

const exact = (value: number) => ({ type: 'exact' as const, value });
const full = { type: 'percent' as const, value: 100 };

function text(parent: UiPanelComponent, value: string, size = 12, color: Color = colors.text) {
  return parent.addText(value, size, { color });
}

function line(parent: UiPanelComponent, value: string, selected = false, indent = 0) {
  const row = parent.addPanel(
    { backgroundColor: selected ? [0.17, 0.3, 0.33, 1] : [0, 0, 0, 0] },
    {
      width: full,
      height: exact(27),
      direction: 'row',
      alignItems: 'center',
      padding: [0, 8, 0, 10 + indent]
    }
  );
  text(row, value, 12, selected ? [0.77, 0.96, 0.94, 1] : colors.text);
  return row;
}

function heading(parent: UiPanelComponent, label: string, trailing = '') {
  const row = parent.addPanel(
    { backgroundColor: colors.chrome },
    {
      width: full,
      height: exact(35),
      direction: 'row',
      alignItems: 'center',
      justifyContent: 'spaceBetween',
      padding: [0, 12, 0, 12]
    }
  );
  text(row, label, 11, colors.text);
  if (trailing) text(row, trailing, 11, colors.muted);
}

function inspectorRow(parent: UiPanelComponent, label: string, value: string) {
  const row = parent.addPanel(
    {},
    {
      width: full,
      height: exact(29),
      direction: 'row',
      alignItems: 'center',
      justifyContent: 'spaceBetween',
      padding: [0, 12, 0, 12]
    }
  );
  text(row, label, 11, colors.muted);
  const field = row.addPanel(
    { backgroundColor: colors.elevated, borderRadius: [3, 3, 3, 3] },
    { width: exact(108), height: exact(23), padding: [4, 7, 4, 7] }
  );
  text(field, value, 11);
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
  text(header, 'File     Edit     View     Scene     Window', 12, colors.muted);
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
  text(toolbar, 'SCENE     Select     Move     Rotate     Scale', 11, colors.text);
  const previewBadge = toolbar.addPanel(
    { backgroundColor: [0.17, 0.35, 0.34, 1], borderRadius: [4, 4, 4, 4] },
    {
      width: exact(80),
      height: exact(26),
      alignItems: 'center',
      justifyContent: 'center'
    }
  );
  text(previewBadge, 'Preview', 11, [0.74, 0.94, 0.91, 1]);

  const hierarchy = root.root.addPanel({ backgroundColor: colors.chrome, clip: true });
  heading(hierarchy, 'HIERARCHY', '+');
  line(hierarchy, 'v  Main Scene');
  line(hierarchy, 'Camera', false, 15);
  line(hierarchy, 'Directional Light', false, 15);
  line(hierarchy, 'Player', true, 15);
  line(hierarchy, 'Environment', false, 15);
  line(hierarchy, 'Ground', false, 27);
  line(hierarchy, 'Props', false, 27);

  const viewport = root.root.addSpritePanel({ textureId: renderTarget });
  const inspector = root.root.addPanel({ backgroundColor: colors.chrome, clip: true });
  heading(inspector, 'INSPECTOR', '...');
  line(inspector, 'Player');
  heading(inspector, 'TRANSFORM', 'v');
  inspectorRow(inspector, 'Position', '0.0   1.2   0.0');
  inspectorRow(inspector, 'Rotation', '0.0   0.0   0.0');
  inspectorRow(inspector, 'Scale', '1.0   1.0   1.0');
  heading(inspector, 'MESH RENDERER', 'v');
  inspectorRow(inspector, 'Mesh', 'Cube');
  inspectorRow(inspector, 'Layer', 'Default');
  heading(inspector, 'RIGIDBODY 3D', 'v');
  inspectorRow(inspector, 'Body type', 'Dynamic');
  inspectorRow(inspector, 'Gravity', '1.0');

  const assets = root.root.addPanel(
    { backgroundColor: colors.surface, clip: true },
    {
      width: full,
      height: exact(142),
      direction: 'column'
    }
  );
  heading(assets, 'PROJECT    /    Assets', 'Search assets');
  const assetRow = assets.addPanel(
    {},
    { direction: 'row', gap: [10, 0], padding: [12, 16, 12, 16] }
  );
  for (const [name, fill] of [
    ['Scenes', [0.67, 0.53, 0.31, 1]],
    ['Sprites', [0.67, 0.53, 0.31, 1]],
    ['Materials', [0.67, 0.53, 0.31, 1]],
    ['player.png', [0.28, 0.48, 0.48, 1]],
    ['level.scene', [0.31, 0.42, 0.55, 1]]
  ] as Array<[string, Color]>) {
    const tile = assetRow.addPanel(
      {},
      { width: exact(82), direction: 'column', alignItems: 'center', gap: [0, 5] }
    );
    tile.addPanel(
      { backgroundColor: fill, borderRadius: [5, 5, 5, 5] },
      { width: exact(52), height: exact(42) }
    );
    text(tile, name, 10, colors.text);
  }
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
  const selectObject = (entityId: number, label: string) => {
    for (const entity of [preview.cube.entityId, preview.orb.entityId, preview.blueCube.entityId]) {
      const model = preview.realm.world.getComponent<Model3DComponent>(entity, 'Model3D')!;
      const scale = entity === entityId ? 1.2 : 1;
      model.setScale(scale, scale, scale);
    }
    statusText.setText(`Selected   •   ${label}`);
    root.flush();
  };
  cubeListener.on('click', () => selectObject(preview.cube.entityId, 'Cube'));
  orbListener.on('click', () => selectObject(preview.orb.entityId, 'Sphere'));
  blueListener.on('click', () => selectObject(preview.blueCube.entityId, 'Blue cube'));
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
        exitKeys: ['escape', 'q']
      });
    } finally {
      scene.dispose();
    }
  } finally {
    session.runtime.dispose();
  }
}
if (import.meta.main) await runDemoUi8();
