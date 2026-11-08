import { describe, expect, test } from 'bun:test';
import { resolvePadding, solveLayout } from '../src/layout';

describe('Layout Solver', () => {
  const container = { x: 10, y: 20, width: 400, height: 300 };

  test('resolves uniform and 4-sided padding', () => {
    expect(resolvePadding(undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(resolvePadding(12)).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect(resolvePadding({ top: 4, right: 8, bottom: 12, left: 16 })).toEqual({
      top: 4,
      right: 8,
      bottom: 12,
      left: 16
    });
  });

  test('solves horizontal linear layout with fixed, percent, and flex children', () => {
    const res = solveLayout(container, 10, { type: 'horizontal', gap: 10, align: 'stretch' }, [
      { width: 80 },
      { width: '25%' },
      { flex: 1 },
      { flex: 2 }
    ]);
    // Inner width = 400 - 20 = 380; gaps = 30; baseSpace = 350; 25% of 350 = 87.5; remaining = 350 - 80 - 87.5 = 182.5
    expect(res.rects).toHaveLength(4);
    expect(res.rects[0]).toEqual({ x: 20, y: 30, width: 80, height: 280 });
    expect(res.rects[1]).toEqual({ x: 110, y: 30, width: 87.5, height: 280 });
    expect(res.rects[2]!.width).toBeCloseTo(182.5 / 3, 4);
    expect(res.rects[3]!.width).toBeCloseTo((182.5 * 2) / 3, 4);
  });

  test('solves vertical linear layout and reports total contentHeight for scrolling', () => {
    const res = solveLayout(container, 10, { type: 'vertical', gap: 10, align: 'stretch' }, [
      { height: 120 },
      { height: 120 },
      { height: 120 }
    ]);
    expect(res.rects[0]).toEqual({ x: 20, y: 30, width: 380, height: 120 });
    expect(res.rects[1]).toEqual({ x: 20, y: 160, width: 380, height: 120 });
    expect(res.rects[2]).toEqual({ x: 20, y: 290, width: 380, height: 120 });
    expect(res.contentHeight).toBe(10 + 120 * 3 + 20 + 10);
  });

  test('solves flex wrap layout across multiple lines', () => {
    const res = solveLayout(
      { x: 0, y: 0, width: 220, height: 200 },
      10,
      { type: 'flex', direction: 'row', wrap: true, gap: 10 },
      [
        { width: 90, height: 40 },
        { width: 90, height: 40 },
        { width: 90, height: 50 }
      ]
    );
    // Inner width = 200. First two items (90 + 10 + 90 = 190) fit on line 1; third wraps to line 2.
    expect(res.rects[0]).toEqual({ x: 10, y: 10, width: 90, height: 40 });
    expect(res.rects[1]).toEqual({ x: 110, y: 10, width: 90, height: 40 });
    expect(res.rects[2]).toEqual({ x: 10, y: 60, width: 90, height: 50 });
  });

  test('solves grid layout with numeric columns and fr tracks', () => {
    const res = solveLayout(
      { x: 0, y: 0, width: 320, height: 200 },
      10,
      {
        type: 'grid',
        columns: [80, '1fr', '2fr'],
        rowHeight: 50,
        gapX: 10,
        gapY: 10
      },
      [{}, {}, {}, {}]
    );
    // Inner width = 300; gaps = 20; fixed = 80; remaining = 200 -> 1fr = 66.666..., 2fr = 133.333...
    expect(res.rects[0]!.x).toBe(10);
    expect(res.rects[0]!.width).toBe(80);
    expect(res.rects[1]!.width).toBeCloseTo(200 / 3, 4);
    expect(res.rects[2]!.width).toBeCloseTo((200 * 2) / 3, 4);
    expect(res.rects[3]!.x).toBe(10);
    expect(res.rects[3]!.y).toBe(70);
  });

  test('respects minWidth, maxWidth, and free positioning', () => {
    const res = solveLayout({ x: 5, y: 15, width: 300, height: 200 }, 0, { type: 'free' }, [
      { x: 20, y: 30, width: 500, minWidth: 50, maxWidth: 180, height: 20, minHeight: 45 }
    ]);
    expect(res.rects[0]).toEqual({ x: 25, y: 45, width: 180, height: 45 });
  });
});
