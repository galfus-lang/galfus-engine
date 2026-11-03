import type { SvgTextLayout } from '@galfus/transport-types';
import type { TextComposition, TextDecorationRect, TextSelection } from '@galfus/engine';
import { graphemeSegments } from 'unicode-segmenter/grapheme';

interface Cluster {
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  scale: number;
  height: number;
  advance: number;
  rtl: boolean;
}

/** Geometry for the demo's untransformed, single-line SVG text elements. */
export function textInputGeometry(
  layout: Readonly<SvgTextLayout> | undefined,
  displayValue: string,
  selection: TextSelection,
  composition: TextComposition | undefined,
  baseline: number
): { cursor: TextDecorationRect; selections: TextDecorationRect[] } | undefined {
  const start = Math.min(selection.anchor, selection.focus);
  let anchor = selection.anchor;
  let focus = selection.focus;
  if (composition) {
    anchor = start + (composition.selection?.[0] ?? composition.text.length);
    focus = start + (composition.selection?.[1] ?? composition.text.length);
  }
  if (!displayValue)
    return { cursor: { x: 56, y: baseline - 19, width: 2, height: 23 }, selections: [] };
  if (!layout || layout.chunks.join('') !== displayValue) return undefined;

  const maps: Map<number, number>[] = [];
  let chunkOffset = 0;
  for (const chunk of layout.chunks) {
    const offsets = new Map<number, number>();
    let byte = 0;
    let utf16 = chunkOffset;
    offsets.set(0, utf16);
    for (const char of chunk) {
      const codepoint = char.codePointAt(0)!;
      byte += codepoint < 0x80 ? 1 : codepoint < 0x800 ? 2 : codepoint < 0x10000 ? 3 : 4;
      utf16 += char.length;
      offsets.set(byte, utf16);
    }
    maps.push(offsets);
    chunkOffset = utf16;
  }
  const clusters: Cluster[] = [];
  for (const item of layout.clusters) {
    const a = maps[item.chunkIndex]?.get(item.byteStart);
    const b = maps[item.chunkIndex]?.get(item.byteEnd);
    const [sx, sy, shearX, scaleY, x, y] = item.transform;
    if (a === undefined || b === undefined || sy !== 0 || shearX !== 0 || sx <= 0 || scaleY <= 0)
      return undefined;
    clusters.push({
      start: a,
      end: b,
      text: displayValue.slice(a, b),
      x,
      y: y - item.ascent * scaleY,
      scale: sx,
      height: (item.ascent - item.descent) * scaleY,
      advance: item.advance,
      rtl: item.rightToLeft
    });
  }
  if (!clusters.length) return undefined;
  const position = (cluster: Cluster, offset: number): number => {
    const boundaries = [0];
    for (const segment of graphemeSegments(cluster.text))
      if (segment.index > 0) boundaries.push(segment.index);
    boundaries.push(cluster.text.length);
    const index = boundaries.indexOf(offset - cluster.start);
    if (index < 0) return NaN;
    // A cluster can contain a ligature; its internal caret positions are not exposed by usvg.
    const fraction = index / (boundaries.length - 1);
    return cluster.x + (cluster.rtl ? 1 - fraction : fraction) * cluster.advance * cluster.scale;
  };
  const selectionStart = Math.min(anchor, focus);
  const selectionEnd = Math.max(anchor, focus);
  const selections: TextDecorationRect[] = [];
  for (const cluster of clusters) {
    const a = Math.max(selectionStart, cluster.start);
    const b = Math.min(selectionEnd, cluster.end);
    if (a >= b) continue;
    const x1 = position(cluster, a);
    const x2 = position(cluster, b);
    if (!Number.isFinite(x1) || !Number.isFinite(x2)) return undefined;
    selections.push({
      x: Math.min(x1, x2),
      y: cluster.y,
      width: Math.abs(x2 - x1),
      height: cluster.height
    });
  }
  const current =
    clusters.find((cluster) => focus === cluster.start) ??
    clusters.find((cluster) => focus > cluster.start && focus <= cluster.end);
  if (!current) return undefined;
  const caretX = position(current, focus);
  if (!Number.isFinite(caretX)) return undefined;
  return { cursor: { x: caretX, y: current.y, width: 2, height: current.height }, selections };
}
