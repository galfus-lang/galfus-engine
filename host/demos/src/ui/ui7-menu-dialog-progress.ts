import {
  type Camera2DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createUi, UiButton, UiDialog, UiMenu, UiProgressBar, UiSlider } from '@galfus/ui';
import { canExitAfterOverlays, runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

/** Menus, modal focus containment and both progress modes. */
export function createUi7Scene(
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
    layout: { direction: 'column', padding: [24, 24, 24, 24], gap: [10, 10], alignItems: 'start' }
  });
  root.root.addText('MENUS, DIALOGS AND PROGRESS', 22);
  root.root.addText('Use Tab and arrows to navigate. Escape closes the top layer.', 14);
  const menuButton = new UiButton(root.root, { label: 'Open menu' });
  const dialogButton = new UiButton(root.root, { label: 'Open dialog' });
  root.root.addText('Determinate progress', 14);
  const progress = new UiProgressBar(ui, root.root, { value: 40, width: 320 });
  const slider = new UiSlider(root.root, { value: 40, min: 0, max: 100, step: 5, width: 320 });
  root.root.addText('Indeterminate progress', 14);
  const indeterminate = new UiProgressBar(ui, root.root, { value: null, width: 320 });
  const status = root.root.addText('Choose a menu item or adjust the slider.', 14);
  const updateStatus = (message: string) => {
    if (root.syncState !== 'disposed') {
      status.setText(message);
      root.flush();
    }
  };
  slider.onChange((value) => {
    progress.setValue(value);
    updateStatus(`Progress: ${value}%`);
  });
  const manager = windowId === undefined ? undefined : ui.createOverlayManager(root, windowId);
  const menu = manager
    ? new UiMenu(manager, {
        anchor: menuButton.panel,
        items: [
          { id: 'open', label: 'Open' },
          { id: 'disabled', label: 'Unavailable', disabled: true },
          {
            id: 'export',
            label: 'Export',
            children: [
              { id: 'text', label: 'Text' },
              { id: 'binary', label: 'Binary' }
            ]
          }
        ],
        onSelect: ({ path }) => updateStatus(`Selected: ${path.join(' / ')}`)
      })
    : undefined;
  let dialogMenu: UiMenu | undefined;
  const dialog = manager
    ? new UiDialog(manager, {
        anchor: dialogButton.panel,
        width: 380,
        height: 220,
        build: (content) => {
          content.addText('Modal dialog', 20);
          content.addText('Focus stays here until the dialog closes.', 14);
          const nested = new UiButton(content, { label: 'Open dialog menu' });
          dialogMenu = new UiMenu(manager, {
            anchor: nested.panel,
            items: [
              { id: 'confirm', label: 'Confirm' },
              { id: 'cancel', label: 'Cancel' }
            ],
            onSelect: ({ id }) => updateStatus(`Dialog menu: ${id}`)
          });
          nested.onActivate(() => dialogMenu?.toggle());
          new UiButton(content, { label: 'Close dialog', onActivate: () => dialog?.close() });
          return nested.panel;
        },
        onClose: (reason) => {
          dialogMenu?.dispose();
          dialogMenu = undefined;
          updateStatus(`Dialog closed: ${reason}`);
        }
      })
    : undefined;
  menuButton.onActivate(() => menu?.toggle());
  dialogButton.onActivate(() => dialog?.open());
  root.flush();
  if (windowId !== undefined)
    runtime.on('window', (event) => {
      if (
        event.windowId !== windowId ||
        event.type !== 'resized' ||
        event.width <= 0 ||
        event.height <= 0
      )
        return;
      const component = realm.world.getComponent<Camera2DComponent>(camera.entityId, 'Camera2D');
      if (component) {
        component.desc.orthoScale = event.height;
        component.isDirty = true;
      }
      root.root.setLayout({
        ...root.root.layout,
        width: { type: 'exact', value: event.width },
        height: { type: 'exact', value: event.height }
      });
      root.flush();
      manager?.setViewport([0, 0, event.width, event.height]);
    });
  return {
    realm,
    ui,
    root,
    menuButton,
    dialogButton,
    manager,
    menu,
    dialog,
    progress,
    indeterminate,
    slider,
    status,
    dispose: () => ui.dispose()
  };
}
export async function runDemoUi7(options: HostDemoOptions = {}): Promise<void> {
  const session = createDemoSession(
    options.title ?? 'Galfus Demo [ui7]: Menus, Dialogs and Progress',
    options,
    [900, 560]
  );
  try {
    const scene = createUi7Scene(session.runtime, session.targetId, session.windowId, session.size);
    try {
      await runDemoLoop(session.runtime, {
        windowId: session.windowId,
        maxFrames: session.maxFrames,
        exitKeys: ['escape', 'q'],
        canExit: (event) => canExitAfterOverlays(event, scene.manager)
      });
    } finally {
      scene.dispose();
    }
  } finally {
    session.runtime.dispose();
  }
}
if (import.meta.main) await runDemoUi7();
