import {
  type Camera2DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createUi, UiInputText, UiTextArea, type UiTextField } from '@galfus/ui';
import type { KeyboardEvent } from '@galfus/transport-types';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

export function createUi5Scene(
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
  root.root.addText('TEXT FIELDS / UTF-16, SELECTION AND IME', 22);
  root.root.addText('Tab changes focus. Click, drag, use Ctrl + arrows or type with an IME.', 14);
  root.root.addText('Single-line input', 15);
  const input = new UiInputText(ui, root.root, { value: 'office café', width: 420 });
  root.root.addText('Multiline text area', 15);
  const area = new UiTextArea(ui, root.root, {
    value: [
      'Hello, world!',
      'Olá, mundo!',
      'Привет, мир!',
      'こんにちは世界！',
      'Line 5: Scroll with mouse wheel or drag the scrollbar.',
      'Line 6: UTF-16 selection and caret tracking.',
      'Line 7: Word wrap and multi-line navigation.',
      'Line 8: Press Escape to blur, then Escape to exit.'
    ].join('\n'),
    width: 520,
    height: 120
  });
  root.root.addText('Read-only example', 15);
  const readOnly = new UiInputText(ui, root.root, {
    value: 'Selectable but not editable',
    width: 420,
    readOnly: true
  });
  const status = root.root.addText('Focus a field and edit its value.', 14);
  const update = () => {
    if (root.syncState !== 'disposed') {
      status.setText(`Input: ${input.value.length} UTF-16 units; area: ${area.value.length} units`);
      root.flush();
    }
  };
  input.on('change', update);
  area.on('change', update);
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
    });
  return { realm, ui, root, input, area, readOnly, status, dispose: () => ui.dispose() };
}
/** Escape first releases field focus; composition cancellation stays with the IME. */
export function canExitUi5(
  fields: readonly UiTextField[],
  windowId: number | undefined,
  event: KeyboardEvent
): boolean {
  const focused = fields.find((field) => field.getInteractionState(windowId).focus);
  if (!focused) return true;
  if (event.type === 'input' && event.logicalKey === 'Escape' && !focused.composition)
    focused.blur(windowId);
  return false;
}
export async function runDemoUi5(options: HostDemoOptions = {}): Promise<void> {
  const session = createDemoSession(
    options.title ?? 'Galfus Demo [ui5]: Text Fields',
    options,
    [900, 560]
  );
  try {
    const scene = createUi5Scene(session.runtime, session.targetId, session.windowId, session.size);
    try {
      await runDemoLoop(session.runtime, {
        windowId: session.windowId,
        maxFrames: session.maxFrames,
        exitKeys: ['escape', 'q'],
        canExit: (event) =>
          canExitUi5([scene.input, scene.area, scene.readOnly], session.windowId, event)
      });
    } finally {
      scene.dispose();
    }
  } finally {
    session.runtime.dispose();
  }
}
if (import.meta.main) await runDemoUi5();
