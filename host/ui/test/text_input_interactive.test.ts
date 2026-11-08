import { describe, expect, it, spyOn } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { createUi, SvgTextDecorations, textInputGeometry } from '../src/index';
import { advanceFrame } from '../../engine/test/controlled-transport';
import { setup } from '../../engine/test/interactive-fixture';

describe('SVG text input and decorations', () => {
  it('binds focused SVG text to editing and IME events', () => {
    const { runtime, transport, realm, events, windowId, ime, svgText } = setup();
    const ui = createUi(runtime);
    try {
      const svg = realm.createSvg({ source: '<svg/>', dimensions: [4, 4] });
      const input = ui.textInput(1, {
        svgId: svg.svgId,
        elementId: 'text',
        hitAreaId: 'hit',
        value: 'abc'
      });
      const changes: string[] = [];
      input.on('change', (event) => changes.push(event.value));
      expect(() =>
        ui.textInput(1, { svgId: svg.svgId, elementId: 'other', hitAreaId: 'hit' })
      ).toThrow();
      advanceFrame(runtime, transport);
      expect(input.requestFocus(windowId)).toBe(true);
      expect(input.requestFocus(windowId)).toBe(true);
      expect(ime).toEqual([[windowId, 1]]);
      input.setSelection(1, 2);
      events.push({ kind: 'keyboard', type: 'imePreedit', windowId, text: 'かな' });
      advanceFrame(runtime, transport);
      expect(input.value).toBe('abc');
      expect(input.displayValue).toBe('aかなc');
      events.push({ kind: 'keyboard', type: 'imeCommit', windowId, text: '仮名' });
      events.push({ kind: 'keyboard', type: 'textInput', windowId, text: '仮名' });
      advanceFrame(runtime, transport);
      expect(input.value).toBe('a仮名c');
      expect(changes).toEqual(['a仮名c']);
      expect(svgText.at(-1)).toBe('a仮名c');
      input.blur(windowId);
      expect(ime).toEqual([
        [windowId, 1],
        [windowId, 0]
      ]);
      events.push({ kind: 'keyboard', type: 'textInput', windowId, text: 'x' });
      advanceFrame(runtime, transport);
      expect(input.value).toBe('a仮名c');
      input.dispose();
      expect(() => input.setValue('x')).toThrow();
    } finally {
      runtime.dispose();
    }
  });

  it('cleans up SVG input when its entity or window is destroyed during composition', () => {
    const { runtime, transport, realm, events, windowId, ime } = setup();
    const ui = createUi(runtime);
    try {
      const svg = realm.createSvg({ source: '<svg/>', dimensions: [4, 4] });
      const input = ui.textInput(1, { svgId: svg.svgId, elementId: 'text' });
      advanceFrame(runtime, transport);
      expect(input.requestFocus(windowId)).toBe(true);
      events.push({ kind: 'keyboard', type: 'imePreedit', windowId, text: 'かな' });
      advanceFrame(runtime, transport);
      realm.destroyEntity(svg.entityId);
      advanceFrame(runtime, transport);
      expect(input.isDisposed).toBe(true);
      expect(ime).toEqual([
        [windowId, 1],
        [windowId, 0]
      ]);
      const next = realm.createSvg({ source: '<svg/>', dimensions: [4, 4] });
      const nextInput = ui.textInput(1, { svgId: next.svgId, elementId: 'text' });
      advanceFrame(runtime, transport);
      expect(nextInput.requestFocus(windowId)).toBe(true);
      runtime.platform.window.close(windowId);
      expect(ime).toEqual([
        [windowId, 1],
        [windowId, 0],
        [windowId, 1]
      ]);
      expect(ui.getFocused(windowId)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });

  it('renders demo caret and selection from actual SVG text metrics', () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const { svgId } = realm.createSvg({
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="560"><path id="selection" display="none"/><text id="text" x="56" y="161" font-size="19" xml:space="preserve">Ada</text><rect id="cursor" display="none"/></svg>'
      });
      const layout = runtime.svg.getTextLayout(realm.realmId, svgId, 'text');
      const geometry = textInputGeometry(layout, 'Ada', { anchor: 0, focus: 2 }, undefined, 161)!;
      const decorations = new SvgTextDecorations(realm, svgId, {
        cursorId: 'cursor',
        selectionPathId: 'selection',
        cursorColor: '#ffffff',
        selectionColor: '#477bb6'
      });
      decorations.update(geometry.cursor, geometry.selections);
      const cursor = runtime.svg.getRect(realm.realmId, svgId, 'cursor');
      const selection = runtime.svg.getRect(realm.realmId, svgId, 'selection');
      expect(cursor?.x).toBeCloseTo(geometry.cursor.x);
      expect(selection?.x).toBeCloseTo(56);
      expect(selection!.width).toBeCloseTo(geometry.cursor.x - 56);
      expect(selection!.height).toBeGreaterThan(0);
      decorations.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('updates a real SVG text element through the host text input', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    const ui = createUi(runtime);
    const writeText = spyOn(transport.engine, 'realm2dSetSvgText');
    try {
      const realm = runtime.createRealm2D();
      const { svgId } = realm.createSvg({
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect id="hit" width="100" height="50"/><text id="text" x="0" y="20">old</text></svg>'
      });
      const input = ui.textInput(realm.realmId, {
        svgId,
        elementId: 'text',
        hitAreaId: 'hit',
        value: 'hello'
      });
      input.setValue('漢字');
      expect(input.value).toBe('漢字');
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(writeText).toHaveBeenLastCalledWith(realm.realmId, svgId, 'text', '漢字');
      input.dispose();
      expect(() =>
        ui.textInput(realm.realmId, { svgId, elementId: 'missing', hitAreaId: 'hit' })
      ).toThrow();
    } finally {
      writeText.mockRestore();
      runtime.dispose();
    }
  });
});
