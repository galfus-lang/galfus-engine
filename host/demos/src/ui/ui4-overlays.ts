import {
  type Camera2DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createUi, UiButton, type UiPopover } from '@galfus/ui';
import { canExitAfterOverlays, runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export function createUi4Scene(
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
    layout: { direction: 'column', padding: [24, 24, 24, 24], gap: [16, 16], alignItems: 'start' }
  });
  root.root.addText('OVERLAYS / POPOVER AND TOOLTIP', 22);
  root.root.addText('Click or focus the controls with Tab and press Enter or Space.', 15);
  const trigger = new UiButton(root.root, { label: 'Open popover' });
  const tipTrigger = new UiButton(root.root, { label: 'Hover or focus for tooltip' });
  const status = root.root.addText(
    'Escape closes the top layer; clicking outside closes popovers.',
    14
  );
  root.flush();
  const manager = windowId === undefined ? undefined : ui.createOverlayManager(root, windowId);
  let nested: UiPopover | undefined;
  const popover = manager?.createPopover({
    anchor: trigger.panel,
    width: 260,
    height: 120,
    build: (overlay) => {
      overlay.root.addText('Popover content', 16);
      const childTrigger = new UiButton(overlay.root, { label: 'Open nested popover' });
      nested = manager.createPopover({
        anchor: childTrigger.panel,
        width: 220,
        height: 58,
        placement: 'right',
        build: (child) => {
          child.root.addText('A nested layer', 15);
        }
      });
      childTrigger.onActivate(() => nested?.toggle());
      return childTrigger.panel;
    },
    onClose: (reason) => {
      nested?.dispose();
      nested = undefined;
      if (root.syncState !== 'disposed') {
        status.setText(`Popover closed: ${reason}`);
        root.flush();
      }
    }
  });
  trigger.onActivate(() => popover?.toggle());
  const tooltip = manager?.createTooltip({
    anchor: tipTrigger.panel,
    text: 'Tooltips open after hover or focus and close when the trigger is left.',
    width: 260,
    height: 56
  });
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
    trigger,
    tipTrigger,
    status,
    manager,
    popover,
    tooltip,
    dispose: () => ui.dispose()
  };
}
export async function runDemoUi4(options: HostDemoOptions = {}): Promise<void> {
  const session = createDemoSession(
    options.title ?? 'Galfus Demo [ui4]: Overlays',
    options,
    [900, 560]
  );
  try {
    const scene = createUi4Scene(session.runtime, session.targetId, session.windowId, session.size);
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
if (import.meta.main) await runDemoUi4();
