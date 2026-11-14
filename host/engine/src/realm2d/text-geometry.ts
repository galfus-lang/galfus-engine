import type { UiTextCluster, UiTextGeometry, UiTextLineGeometry } from './realm';

/** A possible visual caret position for a UTF-16 offset. */
export interface UiTextCaret {
  readonly offset: number;
  readonly line: number;
  readonly rect: [number, number, number, number];
  /** True when the font does not supply an interior ligature position. */
  readonly approximate?: boolean;
}

function lineClusters(geometry: UiTextGeometry, line: UiTextLineGeometry): UiTextCluster[] {
  return geometry.clusters.filter((cluster) => cluster.rect[1] === line.rect[1]);
}

function lineCarets(
  geometry: UiTextGeometry,
  line: UiTextLineGeometry,
  index: number
): UiTextCaret[] {
  const clusters = lineClusters(geometry, line);
  if (clusters.length === 0) {
    return [
      { offset: line.start, line: index, rect: [line.rect[0], line.rect[1], 0, line.rect[3]] }
    ];
  }
  const carets: UiTextCaret[] = [];
  for (const cluster of clusters) {
    const [x, y, width, height] = cluster.rect;
    const before = cluster.rightToLeft ? x + width : x;
    const after = cluster.rightToLeft ? x : x + width;
    carets.push({ offset: cluster.start, line: index, rect: [before, y, 0, height] });
    for (const caret of cluster.carets ?? []) {
      carets.push({
        offset: caret.offset,
        line: index,
        rect: [caret.x, y, 0, height],
        ...(caret.approximate ? { approximate: true } : {})
      });
    }
    carets.push({ offset: cluster.end, line: index, rect: [after, y, 0, height] });
  }
  const seen = new Set<string>();
  return carets.filter((caret) => {
    const key = `${caret.offset}:${caret.rect[0]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Returns all visual positions for an offset, including bidi and wrapped-line ambiguities.
 * Estimated interior positions are marked with `approximate`.
 */
export function getTextCarets(geometry: UiTextGeometry, offset: number): UiTextCaret[] {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Invalid UTF-16 offset.');
  const carets = geometry.lines.flatMap((line, index) => lineCarets(geometry, line, index));
  const matches = carets.filter((caret) => caret.offset === offset);
  if (matches.length === 0) throw new RangeError('Offset is not a shaped cluster boundary.');
  return matches;
}

/** Finds the nearest shaped-cluster boundary to a point in UI-local coordinates. */
export function hitTestText(geometry: UiTextGeometry, x: number, y: number): UiTextCaret {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Invalid text point.');
  if (geometry.lines.length === 0) throw new Error('Text has no line geometry.');
  let bestLine = 0;
  let distance = Number.POSITIVE_INFINITY;
  geometry.lines.forEach((line, index) => {
    const top = line.rect[1];
    const bottom = top + line.rect[3];
    const candidate = Math.max(top - y, 0, y - bottom);
    if (candidate < distance) {
      bestLine = index;
      distance = candidate;
    }
  });
  const carets = lineCarets(geometry, geometry.lines[bestLine]!, bestLine);
  return carets.reduce((best, caret) =>
    Math.abs(caret.rect[0] - x) < Math.abs(best.rect[0] - x) ? caret : best
  );
}

/** Returns rectangles for a UTF-16 selection using cluster and font-provided ligature boundaries. */
export function getTextSelectionRects(
  geometry: UiTextGeometry,
  start: number,
  end: number
): [number, number, number, number][] {
  getTextCarets(geometry, start);
  getTextCarets(geometry, end);
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return geometry.clusters.flatMap((cluster) => {
    const begin = Math.max(cluster.start, from);
    const finish = Math.min(cluster.end, to);
    if (begin >= finish) return [];
    const [x, y, width, height] = cluster.rect;
    const positions = new Map<number, number>([
      [cluster.start, cluster.rightToLeft ? x + width : x],
      [cluster.end, cluster.rightToLeft ? x : x + width],
      ...(cluster.carets ?? []).map((caret): [number, number] => [caret.offset, caret.x])
    ]);
    const left = positions.get(begin);
    const right = positions.get(finish);
    if (left === undefined || right === undefined)
      throw new RangeError('Selection splits a shaped cluster.');
    return [
      [Math.min(left, right), y, Math.abs(right - left), height] as [number, number, number, number]
    ];
  });
}
