import {
  type Camera2DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createUi, UiAppBar, UiButton, UiButtonGroup, UiToolbar } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

/** Package component showcase, also usable with an offscreen target. */
export function createUi3Scene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  windowId?: WindowId,
  size: readonly [number, number] = [900, 560]
) {
  const realm = runtime.createRealm2D();
  realm.setShadowConfig({ ambient: 1 });
  const camera = realm.createCamera({ orthoScale: size[1], near: -100, far: 100 });
  runtime.multiverse.createInvocation({
    realmId: realm.realmId,
    targetId,
    clearColor: [0.025, 0.04, 0.07, 1]
  });
  const ui = createUi(runtime);
  const root = ui.createComponentRoot(realm, {
    width: size[0],
    height: size[1],
    windowId,
    layout: { direction: 'column', padding: [20, 20, 20, 20], gap: [14, 14], alignItems: 'start' },
    theme: {
      tokens: { colors: { brand: [0.16, 0.48, 0.7, 1] } },
      components: {
        button: { variants: { brand: { backgroundColor: { token: 'colors.brand' } } } },
        appBar: {
          base: { color: [0.8, 0.92, 1, 1], typography: { fontSize: 18, fontWeight: 700 } }
        }
      }
    }
  });
  const bar = new UiAppBar(root.root, {
    spacing: 24,
    layout: { width: { type: 'percent', value: 100 }, padding: [12, 16, 12, 16] }
  });
  bar.addText('GALFUS / UI COMPONENTS');
  const toolbar = bar.addToolbar({ spacing: 8 });
  let count = 0;
  const status = root.root.addText('Use Tab, Shift+Tab, Enter, Space or click a button.', 15);
  const activate = (name: string) => () => {
    status.setText(`${name} activated ${++count} times`);
    root.flush();
  };
  toolbar.addButton({
    label: 'Save',
    variant: 'brand',
    states: { hover: { backgroundColor: [0.24, 0.62, 0.84, 1] } },
    style: { borderRadius: [5, 5, 5, 5] },
    onActivate: activate('Save')
  });
  toolbar.addButton({ label: 'Disabled', disabled: true, onActivate: activate('Disabled') });
  root.root.addText('Button group (horizontal)', 16);
  const group = new UiButtonGroup(root.root, { spacing: 6 });
  group.addButton({ label: 'Left', onActivate: activate('Left') });
  group.addButton({ label: 'Center', onActivate: activate('Center') });
  group.addButton({ label: 'Right', onActivate: activate('Right') });
  root.root.addText('Nested groups (vertical + horizontal)', 16);
  const column = new UiButtonGroup(root.root, { orientation: 'vertical', spacing: 8 });
  column.addButton({ label: 'Top', onActivate: activate('Top') });
  const nested = column.addButtonGroup({ spacing: 6 });
  nested.addButton({ label: 'One', onActivate: activate('One') });
  nested.addButton({ label: 'Two', onActivate: activate('Two') });
  const standalone = new UiButton(root.root, {
    label: 'Standalone button',
    onActivate: activate('Standalone')
  });
  // The toolbar also works independently from an app bar.
  const independentToolbar = new UiToolbar(root.root, { spacing: 8 });
  independentToolbar.addButton({ label: 'Refresh', onActivate: activate('Refresh') });
  root.flush();
  const resize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const cameraComponent = realm.world.getComponent<Camera2DComponent>(
      camera.entityId,
      'Camera2D'
    );
    if (cameraComponent) {
      cameraComponent.desc.orthoScale = height;
      cameraComponent.isDirty = true;
    }
    root.root.setLayout({
      ...root.root.layout,
      width: { type: 'exact', value: width },
      height: { type: 'exact', value: height }
    });
    root.flush();
  };
  if (windowId !== undefined)
    runtime.on('window', (event) => {
      if (event.windowId === windowId && event.type === 'resized')
        resize(event.width, event.height);
    });
  return {
    realm,
    ui,
    root,
    bar,
    toolbar,
    group,
    column,
    nested,
    standalone,
    independentToolbar,
    status,
    dispose: () => ui.dispose()
  };
}

export async function runDemoUi3(options: HostDemoOptions = {}): Promise<void> {
  const session = createDemoSession(
    options.title ?? 'Galfus Demo [ui3]: UI Components',
    options,
    [900, 560]
  );
  try {
    const scene = createUi3Scene(session.runtime, session.targetId, session.windowId, session.size);
    try {
      await runDemoLoop(session.runtime, {
        windowId: session.windowId,
        maxFrames: session.maxFrames,
        exitKeys: ['escape']
      });
    } finally {
      scene.dispose();
    }
  } finally {
    session.runtime.dispose();
  }
}

if (import.meta.main) await runDemoUi3();
