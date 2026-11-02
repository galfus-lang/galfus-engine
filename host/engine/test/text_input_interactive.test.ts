import { describe, expect, it } from 'bun:test';
import { advanceFrame } from './controlled-transport';
import { button, move, setup } from './interactive-fixture';

describe('text input and pointer capture', () => {
  it('delivers movement and release to the pressed target outside its hit area', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const listener = runtime.interactive(1, { type: 'collider', entityId: entity });
      const received: string[] = [];
      for (const type of ['move', 'pressmove', 'pressup', 'click', 'cancel'] as const)
        listener.on(type, ({ pointer }) => received.push(`${type}:${pointer.position[0]}`));
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50), button(windowId, 50, 50, 'pressed'));
      events.push(move(windowId, 80, 50), button(windowId, 80, 50, 'released'));
      advanceFrame(runtime, transport);
      expect(received).toEqual(['move:50', 'pressmove:80', 'pressup:80']);
      events.push(move(windowId, 50, 50), button(windowId, 50, 50, 'pressed'));
      events.push({
        kind: 'pointer',
        type: 'button',
        windowId,
        pointerId: 0,
        pointerType: 'mouse',
        position: [50, 50],
        button: 'secondary',
        state: 'pressed',
        pressure: 0
      });
      events.push(move(windowId, 80, 50));
      advanceFrame(runtime, transport);
      expect(received.filter((event) => event === 'pressmove:80')).toHaveLength(2);
      runtime.platform.window.close(windowId);
      expect(received.filter((event) => event === 'cancel:80')).toHaveLength(1);
    } finally {
      runtime.dispose();
    }
  });
  it('binds focused SVG text to editing and IME events', () => {
    const { runtime, transport, realm, events, windowId, ime, svgText } = setup();
    try {
      const svg = realm.createSvg({ source: '<svg/>', dimensions: [4, 4] });
      const input = runtime.textInput(1, {
        svgId: svg.svgId,
        elementId: 'text',
        hitAreaId: 'hit',
        value: 'abc'
      });
      const changes: string[] = [];
      input.on('change', (event) => changes.push(event.value));
      expect(() =>
        runtime.textInput(1, { svgId: svg.svgId, elementId: 'other', hitAreaId: 'hit' })
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
    try {
      const svg = realm.createSvg({ source: '<svg/>', dimensions: [4, 4] });
      const input = runtime.textInput(1, { svgId: svg.svgId, elementId: 'text' });
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
      const nextInput = runtime.textInput(1, { svgId: next.svgId, elementId: 'text' });
      advanceFrame(runtime, transport);
      expect(nextInput.requestFocus(windowId)).toBe(true);
      runtime.platform.window.close(windowId);
      expect(ime).toEqual([
        [windowId, 1],
        [windowId, 0],
        [windowId, 1]
      ]);
      expect(runtime.getFocused(windowId)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });
});
