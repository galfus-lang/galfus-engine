/** SVG text input demo using the host focus and IME systems. */
import {
  type Camera2DComponent,
  createRuntime,
  type MultiverseRuntime,
  SvgTextDecorations,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { runDemoLoop } from '../common/loop';
import { type HostDemoOptions, resolveDemoOptions } from '../common/options';
import { textInputGeometry } from './text-input-geometry';

const PANEL = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="560" viewBox="0 0 760 560">
  <rect width="760" height="560" rx="16" fill="#101d2d"/>
  <text x="40" y="49" fill="#f0f7ff" font-family="sans-serif" font-size="25" font-weight="bold">TEXT INPUT LAB</text>
  <text x="40" y="76" fill="#a9bfd3" font-family="sans-serif" font-size="14">Click a field or use Tab / Shift+Tab to change focus</text>
  <text x="40" y="116" fill="#72d9e9" font-family="sans-serif" font-size="14">NAME</text>
  <rect id="name-hit" x="40" y="128" width="680" height="52" rx="7" fill="#1b3045" stroke="#476078" stroke-width="2"/>
  <g id="name-field"><path id="name-selection" display="none"/><text id="name-text" x="56" y="161" fill="#ffffff" font-family="sans-serif" font-size="19" xml:space="preserve"> </text><rect id="name-cursor" display="none"/></g>
  <text x="40" y="213" fill="#72d9e9" font-family="sans-serif" font-size="14">PROJECT</text>
  <rect id="project-hit" x="40" y="225" width="680" height="52" rx="7" fill="#1b3045" stroke="#476078" stroke-width="2"/>
  <g id="project-field"><path id="project-selection" display="none"/><text id="project-text" x="56" y="258" fill="#ffffff" font-family="sans-serif" font-size="19" xml:space="preserve"> </text><rect id="project-cursor" display="none"/></g>
  <text x="40" y="310" fill="#72d9e9" font-family="sans-serif" font-size="14">NOTE</text>
  <rect id="note-hit" x="40" y="322" width="680" height="52" rx="7" fill="#1b3045" stroke="#476078" stroke-width="2"/>
  <g id="note-field"><path id="note-selection" display="none"/><text id="note-text" x="56" y="355" fill="#ffffff" font-family="sans-serif" font-size="19" xml:space="preserve"> </text><rect id="note-cursor" display="none"/></g>
  <text id="status" x="40" y="420" fill="#dceafa" font-family="sans-serif" font-size="14">No field focused</text>
  <text id="selection" x="40" y="446" fill="#9cb6cf" font-family="sans-serif" font-size="13">Selection: -</text>
  <text x="40" y="493" fill="#a9bfd3" font-family="sans-serif" font-size="12">Arrows, Shift/Ctrl + arrows, Ctrl + Backspace/Delete, Home / End, Ctrl + A.</text>
  <text x="40" y="515" fill="#a9bfd3" font-family="sans-serif" font-size="12">The caret and selection follow the keyboard. Escape exits.</text>
  <text x="40" y="537" fill="#a9bfd3" font-family="sans-serif" font-size="12">For additional glyphs, launch with --font and a compatible font file.</text>
</svg>`;

/** Builds a reusable scene; focus requires a successfully presented window target. */
export function createTextInputScene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  windowId?: WindowId,
  initialSize: readonly [number, number] = [960, 720],
  fontData?: Uint8Array
) {
  const realm = runtime.createRealm2D();
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
  const svg = realm.createSvg({ source: PANEL, castShadow: false, receiveShadow: false });
  const definitions = [
    { name: 'Name', id: 'name', value: 'Ada', baseline: 161 },
    { name: 'Project', id: 'project', value: 'Galfus', baseline: 258 },
    { name: 'Note', id: 'note', value: '', baseline: 355 }
  ] as const;
  let dirty = true;
  const decorations = definitions.map(
    ({ id }) =>
      new SvgTextDecorations(realm, svg.svgId, {
        cursorId: `${id}-cursor`,
        selectionPathId: `${id}-selection`,
        cursorColor: '#ffffff',
        selectionColor: '#477bb6'
      })
  );
  const fields = definitions.map(({ name, id, value }) => {
    const input = runtime.textInput(realm.realmId, {
      svgId: svg.svgId,
      elementId: `${id}-text`,
      hitAreaId: `${id}-hit`,
      value
    });
    const updateSelection = () => {
      const { anchor, focus } = input.selection;
      realm.setSvgText(svg, 'selection', `Selection (UTF-16): ${anchor} → ${focus}`);
    };
    input.on('focus', () => {
      dirty = true;
      realm.setSvgAttribute(svg, `${id}-hit`, 'stroke', '#72d9e9');
      realm.setSvgText(svg, 'status', `Focused: ${name}`);
      updateSelection();
    });
    input.on('blur', () => {
      dirty = true;
      realm.setSvgAttribute(svg, `${id}-hit`, 'stroke', '#476078');
      realm.setSvgText(svg, 'status', 'No field focused');
      realm.setSvgText(svg, 'selection', 'Selection: -');
    });
    input.on('change', () => {
      dirty = true;
    });
    input.on('selection', () => {
      dirty = true;
      updateSelection();
    });
    input.on('composition', () => {
      dirty = true;
      realm.setSvgText(
        svg,
        'status',
        input.composition ? `Composing: ${name}` : `Focused: ${name}`
      );
    });
    return input;
  });
  let lastFocused = -1;
  const cachedValues: Array<string | undefined> = [];
  const cachedLayouts: Array<ReturnType<typeof realm.getSvgTextLayout>> = [];
  runtime.on('tick', () => {
    if (!dirty) return;
    dirty = false;
    const focus = windowId === undefined ? undefined : runtime.getFocused(windowId);
    const index = fields.findIndex((field) => field.focusable === focus);
    if (lastFocused >= 0 && lastFocused !== index) decorations[lastFocused]!.update(undefined, []);
    lastFocused = index;
    if (index < 0) return;
    const field = fields[index]!;
    const value = field.displayValue;
    if (cachedValues[index] !== value) {
      cachedValues[index] = value;
      cachedLayouts[index] = value ? realm.getSvgTextLayout(svg.svgId, field.elementId) : undefined;
    }
    const geometry = textInputGeometry(
      cachedLayouts[index],
      value,
      field.selection,
      field.composition,
      definitions[index]!.baseline
    );
    decorations[index]!.update(geometry?.cursor, geometry?.selections ?? []);
  });
  return { realm, svg, fields };
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
