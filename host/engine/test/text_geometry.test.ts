import { describe, expect, it } from 'bun:test';
import type { UiTextGeometry } from '../src/realm2d/realm';
import { getTextCarets, getTextSelectionRects, hitTestText } from '../src/realm2d/text-geometry';

describe('UI text geometry', () => {
  const geometry: UiTextGeometry = {
    lines: [
      { start: 0, end: 3, rect: [10, 20, 20, 12] },
      { start: 4, end: 4, rect: [10, 32, 0, 12] },
      { start: 5, end: 7, rect: [10, 44, 20, 12] }
    ],
    clusters: [
      { start: 0, end: 1, rect: [10, 20, 10, 12], rightToLeft: false },
      { start: 1, end: 3, rect: [20, 20, 10, 12], rightToLeft: false },
      { start: 6, end: 7, rect: [10, 44, 10, 12], rightToLeft: true },
      { start: 5, end: 6, rect: [20, 44, 10, 12], rightToLeft: true }
    ]
  };

  it('finds UTF-16 boundaries and empty lines without splitting clusters', () => {
    expect(hitTestText(geometry, 29, 25).offset).toBe(3);
    expect(hitTestText(geometry, 100, 36).offset).toBe(4);
    expect(getTextCarets(geometry, 5)[0]!.rect[0]).toBe(30);
    expect(hitTestText(geometry, 11, 48).offset).toBe(7);
    expect(() => getTextCarets(geometry, 2)).toThrow('cluster boundary');
  });

  it('selects visual rectangles using logical UTF-16 offsets', () => {
    expect(getTextSelectionRects(geometry, 7, 5)).toEqual([
      [10, 44, 10, 12],
      [20, 44, 10, 12]
    ]);
    expect(() => getTextSelectionRects(geometry, 0, 2)).toThrow('cluster boundary');
  });

  it('returns both visual caret positions at a bidirectional boundary', () => {
    const bidi: UiTextGeometry = {
      lines: [{ start: 0, end: 2, rect: [0, 0, 20, 10] }],
      clusters: [
        { start: 0, end: 1, rect: [0, 0, 10, 10], rightToLeft: false },
        { start: 1, end: 2, rect: [10, 0, 10, 10], rightToLeft: true }
      ]
    };
    expect(getTextCarets(bidi, 1).map((caret) => caret.rect[0])).toEqual([10, 20]);
  });

  it('uses font-provided ligature positions for hit testing and partial selection', () => {
    const ligature: UiTextGeometry = {
      lines: [{ start: 0, end: 3, rect: [10, 20, 30, 12] }],
      clusters: [
        {
          start: 0,
          end: 3,
          rect: [10, 20, 30, 12],
          rightToLeft: false,
          carets: [
            { offset: 1, x: 18 },
            { offset: 2, x: 29 }
          ]
        }
      ]
    };
    expect(getTextCarets(ligature, 1)[0]!.rect[0]).toBe(18);
    expect(hitTestText(ligature, 28, 25).offset).toBe(2);
    expect(getTextSelectionRects(ligature, 1, 2)).toEqual([[18, 20, 11, 12]]);
    const rtl = structuredClone(ligature);
    rtl.clusters[0] = {
      ...rtl.clusters[0]!,
      rightToLeft: true,
      carets: [
        { offset: 1, x: 29 },
        { offset: 2, x: 18 }
      ]
    };
    expect(getTextSelectionRects(rtl, 1, 2)).toEqual([[18, 20, 11, 12]]);
  });

  it('reports estimated ligature caret positions', () => {
    const geometry: UiTextGeometry = {
      lines: [{ start: 0, end: 2, rect: [0, 0, 20, 10] }],
      clusters: [
        {
          start: 0,
          end: 2,
          rect: [0, 0, 20, 10],
          rightToLeft: false,
          carets: [{ offset: 1, x: 11, approximate: true }]
        }
      ]
    };
    expect(getTextCarets(geometry, 1)[0]).toMatchObject({ approximate: true });
    expect(hitTestText(geometry, 11, 5)).toMatchObject({ offset: 1, approximate: true });
    expect(getTextSelectionRects(geometry, 0, 1)).toEqual([[0, 0, 11, 10]]);
  });
});
