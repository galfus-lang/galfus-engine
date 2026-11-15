import {
  type Camera2DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import {
  createUi,
  UiAppBar,
  UiButtonGroup,
  UiCheckbox,
  UiDialog,
  UiInputText,
  UiMenu,
  UiProgressBar,
  UiRadioGroup,
  UiSelect,
  UiSlider,
  UiSwitch,
  UiTextArea
} from '@galfus/ui';
import type { UiOverlayManager, UiTextField } from '@galfus/ui';
import type { KeyboardEvent } from '@galfus/transport-types';
import { canExitAfterOverlays, runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import { canExitUi5 } from './ui5-text-fields';

/** Integrated application exercising components, styles, focus, editing and overlays. */
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
    clearColor: [0.025, 0.04, 0.07, 1]
  });
  const ui = createUi(runtime);
  const root = ui.createComponentRoot(realm, {
    width: size[0],
    height: size[1],
    windowId,
    layout: { direction: 'column', padding: [18, 18, 18, 18], gap: [7, 7], alignItems: 'start' },
    theme: {
      tokens: { colors: { brand: [0.12, 0.42, 0.63, 1] } },
      components: {
        appBar: {
          base: { color: [0.82, 0.95, 1, 1], typography: { fontSize: 18, fontWeight: 700 } }
        },
        button: {
          variants: { brand: { backgroundColor: { token: 'colors.brand' } } },
          states: { focusVisible: { borderColor: [1, 0.8, 0.2, 1], borderWidth: [2, 2, 2, 2] } }
        }
      }
    }
  });
  const bar = new UiAppBar(root.root, {
    spacing: 16,
    layout: { width: { type: 'percent', value: 100 }, padding: [6, 10, 6, 10] }
  });
  const title = bar.addText('GALFUS / UI');
  const toolbar = bar.addToolbar({ spacing: 6 });
  const menuButton = toolbar.addButton({ label: 'Menu', variant: 'brand' });
  const dialogButton = toolbar.addButton({ label: 'Dialog' });
  const helpButton = toolbar.addButton({ label: 'Help' });
  root.root.addText(
    'Tab, Shift+Tab, pointer, keyboard and IME. Yellow border indicates keyboard focus.',
    13
  );
  root.root.addText('Name', 14);
  const input = new UiInputText(ui, root.root, { value: 'Ada França', width: 360 });
  root.root.addText('Notes', 14);
  const area = new UiTextArea(ui, root.root, {
    value: 'Type, select or compose text here.',
    width: 480,
    height: 72
  });
  const row = root.root.addPanel({}, { direction: 'row', gap: [12, 0], alignItems: 'center' });
  const checkbox = new UiCheckbox(row, { label: 'Notifications' });
  const toggle = new UiSwitch(row, { label: 'Auto-save', value: true });
  const radios = new UiRadioGroup(root.root, {
    orientation: 'horizontal',
    value: 'normal',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' }
    ]
  });
  const slider = new UiSlider(root.root, { min: 0, max: 100, step: 5, value: 40, width: 320 });
  const progress = new UiProgressBar(ui, root.root, { value: 40, width: 320 });
  const actions = new UiButtonGroup(root.root, { spacing: 6 });
  const info = actions.addButton({ label: 'Details' });
  const disabled = actions.addButton({ label: 'Disabled', disabled: true });
  const status = root.root.addText('Ready.', 14);
  const update = (message: string) => {
    if (root.syncState !== 'disposed') {
      status.setText(message);
      root.flush();
    }
  };
  slider.onChange((value) => {
    progress.setValue(value);
    update(`Progress: ${value}%`);
  });
  checkbox.onChange((value) => update(`Notifications: ${value}`));
  toggle.onChange((value) => update(`Auto-save: ${value}`));
  radios.onChange((value) => update(`Priority: ${value}`));
  const manager = windowId === undefined ? undefined : ui.createOverlayManager(root, windowId);
  const select = manager
    ? new UiSelect(root.root, manager, {
        width: 200,
        value: 'system',
        options: [
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' }
        ]
      })
    : undefined;
  select?.onChange((value) => update(`Theme: ${value}`));
  const menu = manager
    ? new UiMenu(manager, {
        anchor: menuButton.panel,
        items: [
          { id: 'new', label: 'New' },
          {
            id: 'export',
            label: 'Export',
            children: [
              { id: 'text', label: 'Text' },
              { id: 'json', label: 'JSON' }
            ]
          }
        ],
        onSelect: ({ path }) => update(`Action: ${path.join(' / ')}`)
      })
    : undefined;
  const dialog = manager
    ? new UiDialog(manager, {
        anchor: dialogButton.panel,
        width: 360,
        height: 160,
        build: (content) => {
          content.addText('Confirm settings', 18);
          content.addText('Tab remains in this dialog until it closes.', 14);
          const close = new UiButtonGroup(content).addButton({
            label: 'Close',
            onActivate: () => dialog?.close()
          });
          return close.panel;
        },
        onClose: (reason) => update(`Dialog closed: ${reason}`)
      })
    : undefined;
  const popover = manager?.createPopover({
    anchor: info.panel,
    width: 240,
    height: 64,
    build: (content) => {
      content.root.addText('Application details', 15);
    }
  });
  const tooltip = manager?.createTooltip({
    anchor: helpButton.panel,
    text: 'Tab and keyboard activation show focus-visible.',
    width: 260,
    height: 52
  });
  menuButton.onActivate(() => menu?.toggle());
  dialogButton.onActivate(() => dialog?.open());
  info.onActivate(() => popover?.toggle());
  root.flush();
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
    title,
    bar,
    toolbar,
    menuButton,
    dialogButton,
    helpButton,
    input,
    area,
    checkbox,
    toggle,
    radios,
    slider,
    progress,
    actions,
    info,
    disabled,
    select,
    manager,
    menu,
    dialog,
    popover,
    tooltip,
    status,
    dispose: () => {
      stopResize?.();
      ui.dispose();
    }
  };
}

/** Let overlays and focused text fields handle Escape before leaving the demo. */
export function canExitUi8(
  fields: readonly UiTextField[],
  windowId: number | undefined,
  event: KeyboardEvent,
  manager?: UiOverlayManager
): boolean {
  return canExitAfterOverlays(event, manager) && canExitUi5(fields, windowId, event);
}

export async function runDemoUi8(options: HostDemoOptions = {}): Promise<void> {
  const session = createDemoSession(
    options.title ?? 'Galfus Demo [ui8]: Integrated UI',
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
          canExitUi8([scene.input, scene.area], session.windowId, event, scene.manager)
      });
    } finally {
      scene.dispose();
    }
  } finally {
    session.runtime.dispose();
  }
}
if (import.meta.main) await runDemoUi8();
