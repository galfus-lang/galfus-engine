import {
  type Camera2DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createUi, UiCheckbox, UiRadioGroup, UiSelect, UiSlider, UiSwitch } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';
import { createUi6CustomIcons } from './ui6-custom-icons';

/** Interactive selection and numeric controls. */
export function createUi6Scene(
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
  const customIcons = createUi6CustomIcons(runtime);
  const root = ui.createComponentRoot(realm, {
    width: size[0],
    height: size[1],
    windowId,
    layout: { direction: 'column', padding: [24, 24, 24, 24], gap: [8, 8], alignItems: 'start' },
    theme: { components: { checkbox: { variants: { accent: { color: [0.75, 0.92, 1, 1] } } } } }
  });
  root.root.addText('SELECTION AND VALUE CONTROLS', 22);
  root.root.addText('Tab to focus, Enter or Space to activate, arrows to navigate or adjust.', 14);
  const checkbox = new UiCheckbox(root.root, {
    label: 'Enable notifications (animated icon)',
    variant: 'accent',
    iconAtlas: customIcons.atlas
  });
  const toggle = new UiSwitch(root.root, { label: 'Auto-save', value: true });
  const disabled = new UiCheckbox(root.root, { label: 'Disabled example', disabled: true });
  const readOnly = new UiSwitch(root.root, {
    label: 'Read-only example',
    value: true,
    readOnly: true
  });
  root.root.addText('Quality', 14);
  const radios = new UiRadioGroup(root.root, {
    orientation: 'horizontal',
    value: 'medium',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' }
    ]
  });
  root.root.addText('Volume', 14);
  const slider = new UiSlider(root.root, { value: 40, min: 0, max: 100, step: 5, width: 300 });
  root.root.addText('Theme', 14);
  const manager = windowId === undefined ? undefined : ui.createOverlayManager(root, windowId);
  const select = manager
    ? new UiSelect(root.root, manager, {
        width: 230,
        pageSize: 3,
        value: 'system',
        options: [
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'ocean', label: 'Ocean' },
          { value: 'forest', label: 'Forest' }
        ]
      })
    : undefined;
  if (!select) root.root.addText('Select requires a window presentation.', 14);
  const status = root.root.addText('Use the controls to update their values.', 14);
  const update = () => {
    if (root.syncState === 'disposed') return;
    status.setText(
      `Notifications: ${checkbox.value} | Auto-save: ${toggle.value} | Quality: ${radios.value ?? 'none'} | Volume: ${slider.value} | Theme: ${select?.value ?? 'none'}`
    );
    root.flush();
  };
  checkbox.onChange(update);
  toggle.onChange(update);
  radios.onChange(update);
  slider.onChange(update);
  select?.onChange(update);
  root.flush();
  const stopResize =
    windowId === undefined
      ? undefined
      : runtime.on('window', (event) => {
          if (
            event.windowId !== windowId ||
            event.type !== 'resized' ||
            event.width <= 0 ||
            event.height <= 0
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
    checkbox,
    customIcons: customIcons.atlas,
    toggle,
    disabled,
    readOnly,
    radios,
    slider,
    select,
    status,
    dispose: () => {
      stopResize?.();
      ui.dispose();
      customIcons.dispose();
    }
  };
}
export async function runDemoUi6(options: HostDemoOptions = {}): Promise<void> {
  const session = createDemoSession(
    options.title ?? 'Galfus Demo [ui6]: Selection Controls',
    options,
    [900, 560]
  );
  try {
    const scene = createUi6Scene(session.runtime, session.targetId, session.windowId, session.size);
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
if (import.meta.main) await runDemoUi6();
