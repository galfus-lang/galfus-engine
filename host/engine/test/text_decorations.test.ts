import { describe, expect, it } from 'bun:test';
import { SvgTextDecorations } from '../src/text/svg-decorations';

describe('SVG text decorations', () => {
  it('draws multiple selection spans in a single path and updates its color', () => {
    const attributes = new Map<string, string>();
    const realm = {
      setSvgAttribute: (_svg: { svgId: number }, id: string, name: string, value: string) =>
        attributes.set(`${id}:${name}`, value)
    };
    const view = new SvgTextDecorations(realm, 1, {
      cursorId: 'caret',
      selectionPathId: 'selection',
      selectionColor: '#123456'
    });
    view.update(undefined, [
      { x: 1, y: 2, width: 3, height: 4 },
      { x: 8, y: 2, width: 5, height: 4 }
    ]);
    expect(attributes.get('selection:d')).toBe('M1 2h3v4h-3zM8 2h5v4h-5z');
    expect(attributes.get('selection:fill')).toBe('#123456');
    view.setColors({ selectionColor: 'blue' });
    expect(attributes.get('selection:fill')).toBe('blue');
    view.dispose();
    expect(attributes.get('selection:display')).toBe('none');
  });
  it('draws configured cursor and selection colors and avoids unchanged updates', () => {
    const calls: string[] = [];
    const realm = {
      setSvgAttribute: (svg: { svgId: number }, id: string, name: string, value: string) =>
        calls.push(`${svg.svgId}:${id}:${name}:${value}`)
    };
    const view = new SvgTextDecorations(realm, 3, {
      cursorId: 'caret',
      selectionIds: ['selection'],
      cursorColor: '#123456',
      selectionColor: '#abcd'
    });
    const cursor = { x: 10, y: 20, width: 1, height: 12 };
    const selection = { x: 3, y: 20, width: 7, height: 12 };
    view.update(cursor, [selection]);
    expect(calls).toContain('3:caret:fill:#123456');
    expect(calls).toContain('3:selection:fill:#abcd');
    const count = calls.length;
    view.update(cursor, [selection]);
    expect(calls).toHaveLength(count);
    view.setColors({ cursorColor: 'red', selectionColor: 'blue' });
    expect(calls.slice(count)).toEqual(['3:caret:fill:red', '3:selection:fill:blue']);
    view.update(cursor, [selection]);
    expect(calls).toHaveLength(count + 2);
    view.dispose();
    expect(calls.slice(-2)).toEqual(['3:caret:display:none', '3:selection:display:none']);
  });

  it('validates all geometry before changing the SVG', () => {
    const calls: unknown[] = [];
    const realm = { setSvgAttribute: (...args: unknown[]) => calls.push(args) };
    const view = new SvgTextDecorations(realm, 1, {
      cursorId: 'cursor',
      selectionIds: ['selection']
    });
    expect(() =>
      view.update({ x: 0, y: 0, width: 1, height: 10 }, [{ x: 0, y: 0, width: -1, height: 1 }])
    ).toThrow(RangeError);
    expect(calls).toHaveLength(0);
    expect(() =>
      view.update(undefined, [
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 0, y: 0, width: 1, height: 1 }
      ])
    ).toThrow(RangeError);
  });
});
