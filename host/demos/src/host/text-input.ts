/** Native UI text input demo using the host focus and IME systems. */
import {
  type Camera2DComponent,
  createRuntime,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { createUi, type TextInput, UiRoot, UiText } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { type HostDemoOptions, resolveDemoOptions } from '../common/options';

export interface FieldUiState {
  readonly id: string;
  readonly name: string;
  readonly input: TextInput;
  readonly fieldPanel: ReturnType<UiRoot['addPanel']>;
  readonly textNode: UiText;
  readonly cursorPanel: ReturnType<UiRoot['addPanel']>;
  readonly selectionPanel: ReturnType<UiRoot['addPanel']>;
}

/** Builds a reusable scene; focus requires a successfully presented window target. */
export function createTextInputScene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  windowId?: WindowId,
  initialSize: readonly [number, number] = [960, 720],
  fontData?: Uint8Array
) {
  const realm = runtime.createRealm2D();
  const ui = createUi(runtime);
  runtime.multiverse.createInvocation({
    realmId: realm.realmId,
    targetId,
    clearColor: [0.025, 0.04, 0.065, 1]
  });
  const camera = realm.createCamera({ orthoScale: 620 });
  const cameraComponent = realm.world.getComponent<Camera2DComponent>(camera.entityId, 'Camera2D')!;
  const resize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const scale = Math.max(620, (820 * height) / width);
    if (cameraComponent.desc.orthoScale === scale) return;
    cameraComponent.desc.orthoScale = scale;
    cameraComponent.isDirty = true;
  };
  resize(initialSize[0], initialSize[1]);
  if (windowId !== undefined)
    runtime.on('window', (event) => {
      if (event.windowId === windowId && event.type === 'resized')
        resize(event.width, event.height);
    });
  realm.setShadowConfig({ ambient: 1 });
  if (fontData) realm.loadFontData(fontData);

  const uiRoot = new UiRoot(runtime, realm, {
    width: 760,
    height: 560,
    position: [0, 0]
  });
  uiRoot.rootPanel.setBackgroundColor([16 / 255, 29 / 255, 45 / 255, 1.0]).setBorderRadius(16);

  uiRoot.addText({
    text: 'TEXT INPUT LAB',
    fontSize: 25,
    color: [240 / 255, 247 / 255, 1.0, 1.0],
    x: 40,
    y: 20
  });
  uiRoot.addText({
    text: 'Click a field or use Tab / Shift+Tab to change focus',
    fontSize: 14,
    color: [169 / 255, 191 / 255, 211 / 255, 1.0],
    x: 40,
    y: 54
  });

  const definitions = [
    { name: 'Name', id: 'name', value: 'Ada', y: 128 },
    { name: 'Project', id: 'project', value: 'Galfus', y: 225 },
    { name: 'Note', id: 'note', value: '', y: 322 }
  ] as const;

  const statusText = uiRoot.addText({
    text: 'No field focused',
    fontSize: 14,
    color: [220 / 255, 234 / 255, 250 / 255, 1.0],
    x: 40,
    y: 400
  });

  const selectionText = uiRoot.addText({
    text: 'Selection: -',
    fontSize: 13,
    color: [156 / 255, 182 / 255, 207 / 255, 1.0],
    x: 40,
    y: 426
  });

  uiRoot.addText({
    text: 'Arrows, Shift/Ctrl + arrows, Ctrl + Backspace/Delete, Home / End, Ctrl + A.',
    fontSize: 12,
    color: [169 / 255, 191 / 255, 211 / 255, 1.0],
    x: 40,
    y: 470
  });
  uiRoot.addText({
    text: 'The caret and selection follow the keyboard. Escape exits.',
    fontSize: 12,
    color: [169 / 255, 191 / 255, 211 / 255, 1.0],
    x: 40,
    y: 492
  });
  uiRoot.addText({
    text: 'For additional glyphs, launch with --font and a compatible font file.',
    fontSize: 12,
    color: [169 / 255, 191 / 255, 211 / 255, 1.0],
    x: 40,
    y: 514
  });

  const fieldStates: FieldUiState[] = [];
  const fields: TextInput[] = [];

  for (let i = 0; i < definitions.length; i++) {
    const { name, id, value, y } = definitions[i]!;

    uiRoot.addText({
      text: name.toUpperCase(),
      fontSize: 14,
      color: [114 / 255, 217 / 255, 233 / 255, 1.0],
      x: 40,
      y: y - 22
    });

    const fieldPanel = uiRoot.addPanel({
      id: `${id}-hit`,
      x: 40,
      y,
      width: 680,
      height: 52,
      borderRadius: 7,
      backgroundColor: [27 / 255, 48 / 255, 69 / 255, 1.0],
      borderColor: [71 / 255, 96 / 255, 120 / 255, 1.0],
      borderWidth: 2
    });

    const selectionPanel = fieldPanel.addPanel({
      id: `${id}-selection`,
      x: 16,
      y: 10,
      width: 0,
      height: 32,
      borderRadius: 3,
      backgroundColor: [71 / 255, 123 / 255, 182 / 255, 0.6]
    });

    const cursorPanel = fieldPanel.addPanel({
      id: `${id}-cursor`,
      x: 16,
      y: 10,
      width: 2,
      height: 32,
      minWidth: 0,
      backgroundColor: [1.0, 1.0, 1.0, 0.0]
    });

    const textNode = fieldPanel.addText(
      new UiText({
        text: value || ' ',
        fontSize: 19,
        color: [1.0, 1.0, 1.0, 1.0],
        x: 16,
        y: 14
      })
    );

    const input = ui.textInput(realm.realmId, {
      entityId: uiRoot.entityId,
      value,
      tabIndex: i,
      onRender: (val) => textNode.setText(val || ' ')
    });

    const updateDecorations = () => {
      const { anchor, focus } = input.selection;
      const start = Math.min(anchor, focus);
      const end = Math.max(anchor, focus);
      const charWidth = 10.5;
      const cursorX = 16 + focus * charWidth;
      cursorPanel.setPosition(cursorX, 10);
      cursorPanel.setBackgroundColor([1.0, 1.0, 1.0, 1.0]);

      if (start !== end) {
        selectionPanel.setPosition(16 + start * charWidth, 10);
        selectionPanel.setSize(Math.max(0, (end - start) * charWidth), 32);
      } else {
        selectionPanel.setSize(0, 32);
      }
    };

    const updateSelectionText = () => {
      const { anchor, focus } = input.selection;
      selectionText.setText(`Selection (UTF-16): ${anchor} → ${focus}`);
    };

    input.on('focus', () => {
      fieldPanel.setBorderColor([114 / 255, 217 / 255, 233 / 255, 1.0]);
      statusText.setText(`Focused: ${name}`);
      updateDecorations();
      updateSelectionText();
    });

    input.on('blur', () => {
      fieldPanel.setBorderColor([71 / 255, 96 / 255, 120 / 255, 1.0]);
      cursorPanel.setBackgroundColor([1.0, 1.0, 1.0, 0.0]);
      selectionPanel.setSize(0, 32);
      statusText.setText('No field focused');
      selectionText.setText('Selection: -');
    });

    input.on('change', () => {
      textNode.setText(input.displayValue || ' ');
      updateDecorations();
    });

    input.on('selection', () => {
      updateDecorations();
      updateSelectionText();
    });

    input.on('composition', () => {
      textNode.setText(input.displayValue || ' ');
      statusText.setText(input.composition ? `Composing: ${name}` : `Focused: ${name}`);
      updateDecorations();
    });

    fieldPanel.on('click', () => {
      input.requestFocus(windowId);
    });

    fieldStates.push({
      id,
      name,
      input,
      fieldPanel,
      textNode,
      cursorPanel,
      selectionPanel
    });
    fields.push(input);
  }

  return { realm, uiRoot, ui, fields, fieldStates, statusText, selectionText };
}

export interface TextInputDemoOptions extends HostDemoOptions {
  fontPath?: string;
}

export async function runTextInputDemo(options: TextInputDemoOptions = {}): Promise<void> {
  const { headless, maxFrames } = resolveDemoOptions(options);
  const fontIndex = process.argv.indexOf('--font');
  const fontArgument = fontIndex >= 0 ? process.argv[fontIndex + 1] : undefined;
  if (fontIndex >= 0 && (!fontArgument || fontArgument.startsWith('--')))
    throw new Error('--font requires a font file path.');
  const fontPath = options.fontPath ?? fontArgument;
  const fontData = fontPath ? new Uint8Array(await Bun.file(fontPath).arrayBuffer()) : undefined;
  const runtime = createRuntime(createBunTransport({ headless }));
  try {
    const windowId = headless
      ? undefined
      : runtime.platform.window.create({ title: 'Galfus Host - Text Input Lab', size: [960, 720] });
    const targetId = runtime.multiverse.createTarget(
      windowId === undefined
        ? { kind: { type: 'texture', width: 960, height: 720 } }
        : { kind: { type: 'window', windowId } }
    );
    const size =
      windowId === undefined ? ([960, 720] as const) : runtime.platform.window.getSize(windowId);
    const scene = createTextInputScene(runtime, targetId, windowId, size, fontData);
    console.log(
      headless
        ? '[text-input] Running headless smoke test.'
        : '[text-input] Click a field or use Tab / Shift+Tab. Escape exits.'
    );
    await runDemoLoop(runtime, {
      windowId,
      maxFrames,
      exitKeys: ['escape'],
      canExit: () => !scene.fields.some((field) => field.composition)
    });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runTextInputDemo();
}
