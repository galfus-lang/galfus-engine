import type {
  FlexLayoutConfig,
  GridLayoutConfig,
  LayoutConfig,
  UiAlign,
  UiJustify,
  UiPadding,
  UiRect,
  UiSizeConstraints,
  UiSizeSpec
} from './types';

export interface ResolvedPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface LayoutSolution {
  readonly rects: UiRect[];
  readonly contentWidth: number;
  readonly contentHeight: number;
}

export function resolvePadding(padding?: UiPadding): ResolvedPadding {
  if (typeof padding === 'number') {
    const v = Math.max(0, padding);
    return { top: v, right: v, bottom: v, left: v };
  }
  return {
    top: Math.max(0, padding?.top ?? 0),
    right: Math.max(0, padding?.right ?? 0),
    bottom: Math.max(0, padding?.bottom ?? 0),
    left: Math.max(0, padding?.left ?? 0)
  };
}

export function clampSize(value: number, min?: number, max?: number): number {
  let result = Math.max(0, value);
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return Math.max(0, result);
}

function parseSpec(
  spec: UiSizeSpec | undefined,
  available: number,
  fallback: number
): { kind: 'fixed' | 'fr'; value: number } {
  if (typeof spec === 'number') return { kind: 'fixed', value: Math.max(0, spec) };
  if (typeof spec === 'string') {
    if (spec.endsWith('%')) {
      const pct = Number.parseFloat(spec.slice(0, -1));
      return {
        kind: 'fixed',
        value: Number.isFinite(pct) ? Math.max(0, (available * pct) / 100) : fallback
      };
    }
    if (spec.endsWith('fr')) {
      const fr = Number.parseFloat(spec.slice(0, -2));
      return { kind: 'fr', value: Number.isFinite(fr) && fr > 0 ? fr : 1 };
    }
  }
  return { kind: 'fixed', value: fallback };
}

function resolveCrossAxis(
  spec: UiSizeSpec | undefined,
  availableCross: number,
  align: UiAlign,
  min?: number,
  max?: number,
  defaultSize = 36
): { offset: number; size: number } {
  let rawSize = availableCross;
  if (align !== 'stretch' && (spec === undefined || spec === 'auto')) {
    rawSize = Math.min(availableCross, defaultSize);
  } else if (spec !== undefined && spec !== 'auto') {
    const parsed = parseSpec(spec, availableCross, availableCross);
    rawSize = parsed.kind === 'fixed' ? parsed.value : availableCross;
  }
  const size = clampSize(rawSize, min, max);
  let offset = 0;
  if (align === 'center') offset = (availableCross - size) * 0.5;
  else if (align === 'end') offset = availableCross - size;
  return { offset, size };
}

function solveLinearLine(
  isRow: boolean,
  originX: number,
  originY: number,
  mainSpace: number,
  crossSpace: number,
  gap: number,
  align: UiAlign,
  justify: UiJustify,
  items: readonly UiSizeConstraints[]
): LayoutSolution {
  const n = items.length;
  if (n === 0) return { rects: [], contentWidth: 0, contentHeight: 0 };

  const totalGap = gap * Math.max(0, n - 1);
  const baseSpace = Math.max(0, mainSpace - totalGap);
  const mainSizes = new Array<number>(n).fill(0);
  const flexWeights = new Array<number>(n).fill(0);
  let fixedSum = 0;
  let totalFlex = 0;

  for (let i = 0; i < n; i++) {
    const item = items[i]!;
    const spec = isRow ? item.width : item.height;
    const min = isRow ? item.minWidth : item.minHeight;
    const max = isRow ? item.maxWidth : item.maxHeight;
    if (item.flex !== undefined && item.flex > 0) {
      flexWeights[i] = item.flex;
      totalFlex += item.flex;
    } else if (typeof spec === 'string' && spec.endsWith('fr')) {
      const fr = parseSpec(spec, baseSpace, 1).value;
      flexWeights[i] = fr;
      totalFlex += fr;
    } else {
      const fallback =
        spec === undefined || spec === 'auto' ? (totalFlex > 0 ? 40 : baseSpace / n) : 40;
      const fixed = clampSize(parseSpec(spec, baseSpace, fallback).value, min, max);
      mainSizes[i] = fixed;
      fixedSum += fixed;
    }
  }

  const remaining = Math.max(0, baseSpace - fixedSum);
  if (totalFlex > 0) {
    let flexUsed = 0;
    for (let i = 0; i < n; i++) {
      const w = flexWeights[i]!;
      if (w <= 0) continue;
      const item = items[i]!;
      const min = isRow ? item.minWidth : item.minHeight;
      const max = isRow ? item.maxWidth : item.maxHeight;
      const size = clampSize((remaining * w) / totalFlex, min, max);
      mainSizes[i] = size;
      flexUsed += size;
    }
    fixedSum += flexUsed;
  }

  const totalMainUsed = fixedSum + totalGap;
  let mainCursor = 0;
  let effectiveGap = gap;
  const freeMain = Math.max(0, mainSpace - totalMainUsed);
  if (justify === 'center') mainCursor = freeMain * 0.5;
  else if (justify === 'end') mainCursor = freeMain;
  else if (justify === 'space-between' && n > 1) effectiveGap = gap + freeMain / (n - 1);

  const rects: UiRect[] = [];
  let maxCross = 0;
  for (let i = 0; i < n; i++) {
    const item = items[i]!;
    const mainSize = mainSizes[i]!;
    const crossSpec = isRow ? item.height : item.width;
    const crossMin = isRow ? item.minHeight : item.minWidth;
    const crossMax = isRow ? item.maxHeight : item.maxWidth;
    const { offset: crossOffset, size: crossSize } = resolveCrossAxis(
      crossSpec,
      crossSpace,
      align,
      crossMin,
      crossMax,
      isRow ? crossSpace : mainSpace
    );
    maxCross = Math.max(maxCross, crossOffset + crossSize);
    if (isRow) {
      rects.push({
        x: originX + mainCursor,
        y: originY + crossOffset,
        width: mainSize,
        height: crossSize
      });
    } else {
      rects.push({
        x: originX + crossOffset,
        y: originY + mainCursor,
        width: crossSize,
        height: mainSize
      });
    }
    mainCursor += mainSize + effectiveGap;
  }

  const totalMainExtent = n > 0 ? mainCursor - effectiveGap : 0;
  return {
    rects,
    contentWidth: isRow ? totalMainExtent : maxCross,
    contentHeight: isRow ? maxCross : totalMainExtent
  };
}

function solveFlexWrap(
  config: FlexLayoutConfig,
  originX: number,
  originY: number,
  width: number,
  height: number,
  items: readonly UiSizeConstraints[]
): LayoutSolution {
  const isRow = (config.direction ?? 'row') === 'row';
  const gap = Math.max(0, config.gap ?? 0);
  const align = config.align ?? 'stretch';
  const justify = config.justify ?? 'start';
  if (!config.wrap || items.length <= 1) {
    return solveLinearLine(
      isRow,
      originX,
      originY,
      isRow ? width : height,
      isRow ? height : width,
      gap,
      align,
      justify,
      items
    );
  }

  const mainLimit = isRow ? width : height;
  const lines: UiSizeConstraints[][] = [];
  let currentLine: UiSizeConstraints[] = [];
  let currentMain = 0;

  for (const item of items) {
    const spec = isRow ? item.width : item.height;
    const itemMain = clampSize(
      parseSpec(spec, mainLimit, 80).value,
      isRow ? item.minWidth : item.minHeight,
      isRow ? item.maxWidth : item.maxHeight
    );
    const nextMain = currentLine.length === 0 ? itemMain : currentMain + gap + itemMain;
    if (currentLine.length > 0 && nextMain > mainLimit) {
      lines.push(currentLine);
      currentLine = [item];
      currentMain = itemMain;
    } else {
      currentLine.push(item);
      currentMain = nextMain;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  const rects: UiRect[] = [];
  let crossCursor = 0;
  let maxMain = 0;
  const defaultLineCross = Math.max(
    24,
    ((isRow ? height : width) - gap * (lines.length - 1)) / lines.length
  );

  for (const line of lines) {
    let lineCross = 0;
    for (const item of line) {
      const crossSpec = isRow ? item.height : item.width;
      const cSize = clampSize(
        parseSpec(crossSpec, isRow ? height : width, defaultLineCross).value,
        isRow ? item.minHeight : item.minWidth,
        isRow ? item.maxHeight : item.maxWidth
      );
      lineCross = Math.max(lineCross, cSize);
    }
    const solved = solveLinearLine(
      isRow,
      isRow ? originX : originX + crossCursor,
      isRow ? originY + crossCursor : originY,
      mainLimit,
      lineCross,
      gap,
      align,
      justify,
      line
    );
    rects.push(...solved.rects);
    maxMain = Math.max(maxMain, isRow ? solved.contentWidth : solved.contentHeight);
    crossCursor += lineCross + gap;
  }

  const totalCross = lines.length > 0 ? crossCursor - gap : 0;
  return {
    rects,
    contentWidth: isRow ? maxMain : totalCross,
    contentHeight: isRow ? totalCross : maxMain
  };
}

function resolveTracks(
  tracks: readonly UiSizeSpec[] | number | undefined,
  count: number,
  available: number,
  gap: number,
  fallbackSize: number
): number[] {
  if (count <= 0) return [];
  const specs: UiSizeSpec[] =
    typeof tracks === 'number'
      ? new Array<UiSizeSpec>(Math.max(1, tracks)).fill('1fr')
      : tracks && tracks.length > 0
        ? [...tracks]
        : new Array<UiSizeSpec>(count).fill(`${fallbackSize}px` as UiSizeSpec);

  const n = specs.length;
  const baseSpace = Math.max(0, available - gap * Math.max(0, n - 1));
  const sizes = new Array<number>(n).fill(0);
  const frs = new Array<number>(n).fill(0);
  let fixedSum = 0;
  let frSum = 0;

  for (let i = 0; i < n; i++) {
    const spec = specs[i]!;
    if (spec === 'auto') {
      sizes[i] = fallbackSize;
      fixedSum += fallbackSize;
    } else {
      const parsed = parseSpec(spec, baseSpace, fallbackSize);
      if (parsed.kind === 'fr') {
        frs[i] = parsed.value;
        frSum += parsed.value;
      } else {
        sizes[i] = parsed.value;
        fixedSum += parsed.value;
      }
    }
  }
  const rem = Math.max(0, baseSpace - fixedSum);
  if (frSum > 0) {
    for (let i = 0; i < n; i++) {
      if (frs[i]! > 0) sizes[i] = (rem * frs[i]!) / frSum;
    }
  }
  return sizes;
}

function solveGrid(
  config: GridLayoutConfig,
  originX: number,
  originY: number,
  width: number,
  height: number,
  items: readonly UiSizeConstraints[]
): LayoutSolution {
  const n = items.length;
  if (n === 0) return { rects: [], contentWidth: 0, contentHeight: 0 };

  const gapX = Math.max(0, config.gapX ?? config.gap ?? 0);
  const gapY = Math.max(0, config.gapY ?? config.gap ?? 0);
  const colWidths = resolveTracks(config.columns, n, width, gapX, 80);
  const numCols = Math.max(1, colWidths.length);
  const numRows = Math.ceil(n / numCols);
  const defaultRowH =
    config.rowHeight ?? Math.max(28, (height - gapY * Math.max(0, numRows - 1)) / numRows);
  const rowHeights = config.rows
    ? resolveTracks(config.rows, numRows, height, gapY, defaultRowH)
    : new Array<number>(numRows).fill(defaultRowH);

  const colOffsets = new Array<number>(numCols).fill(0);
  let cx = 0;
  for (let c = 0; c < numCols; c++) {
    colOffsets[c] = cx;
    cx += colWidths[c]! + gapX;
  }

  const rowOffsets = new Array<number>(numRows).fill(0);
  let cy = 0;
  for (let r = 0; r < numRows; r++) {
    rowOffsets[r] = cy;
    const rh = rowHeights[r] ?? defaultRowH;
    cy += rh + gapY;
  }

  const rects: UiRect[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % numCols;
    const row = Math.floor(i / numCols);
    const item = items[i]!;
    const cellW = colWidths[col] ?? 0;
    const cellH = rowHeights[row] ?? defaultRowH;
    const w = clampSize(cellW, item.minWidth, item.maxWidth);
    const h = clampSize(cellH, item.minHeight, item.maxHeight);
    rects.push({
      x: originX + colOffsets[col]!,
      y: originY + rowOffsets[row]!,
      width: w,
      height: h
    });
  }

  return {
    rects,
    contentWidth: numCols > 0 ? cx - gapX : 0,
    contentHeight: numRows > 0 ? cy - gapY : 0
  };
}

/** Computes child rectangles and content bounds for any `LayoutConfig`. */
export function solveLayout(
  container: UiRect,
  padding: UiPadding | undefined,
  layout: LayoutConfig,
  items: readonly UiSizeConstraints[]
): LayoutSolution {
  const pad = resolvePadding(padding);
  const innerX = container.x + pad.left;
  const innerY = container.y + pad.top;
  const innerW = Math.max(0, container.width - pad.left - pad.right);
  const innerH = Math.max(0, container.height - pad.top - pad.bottom);

  let inner: LayoutSolution;
  switch (layout.type) {
    case 'horizontal':
    case 'vertical': {
      const isRow = layout.type === 'horizontal';
      inner = solveLinearLine(
        isRow,
        innerX,
        innerY,
        isRow ? innerW : innerH,
        isRow ? innerH : innerW,
        Math.max(0, layout.gap ?? 0),
        layout.align ?? 'stretch',
        layout.justify ?? 'start',
        items
      );
      break;
    }
    case 'flex':
      inner = solveFlexWrap(layout, innerX, innerY, innerW, innerH, items);
      break;
    case 'grid':
      inner = solveGrid(layout, innerX, innerY, innerW, innerH, items);
      break;
    case 'stack':
    case 'relative': {
      const rects: UiRect[] = [];
      let maxX = 0;
      let maxY = 0;
      const fit = layout.fit ?? 'expand';
      for (const item of items) {
        const defaultW = fit === 'expand' ? innerW : 0;
        const defaultH = fit === 'expand' ? innerH : 0;
        const wSpec =
          item.width !== undefined ? parseSpec(item.width, innerW, innerW).value : defaultW;
        const hSpec =
          item.height !== undefined ? parseSpec(item.height, innerH, innerH).value : defaultH;
        const maxW =
          innerW > 0
            ? Math.min(item.maxWidth ?? Infinity, Math.max(item.minWidth ?? 0, innerW))
            : item.maxWidth;
        const maxH =
          innerH > 0
            ? Math.min(item.maxHeight ?? Infinity, Math.max(item.minHeight ?? 0, innerH))
            : item.maxHeight;
        const w = clampSize(wSpec, item.minWidth, maxW);
        const h = clampSize(hSpec, item.minHeight, maxH);
        const ox = item.x ?? 0;
        const oy = item.y ?? 0;
        rects.push({ x: innerX + ox, y: innerY + oy, width: w, height: h });
        maxX = Math.max(maxX, ox + w);
        maxY = Math.max(maxY, oy + h);
      }
      inner = { rects, contentWidth: maxX, contentHeight: maxY };
      break;
    }
    case 'free': {
      const rects: UiRect[] = [];
      let maxX = 0;
      let maxY = 0;
      for (const item of items) {
        const maxW =
          innerW > 0
            ? Math.min(item.maxWidth ?? Infinity, Math.max(item.minWidth ?? 0, innerW))
            : item.maxWidth;
        const maxH =
          innerH > 0
            ? Math.min(item.maxHeight ?? Infinity, Math.max(item.minHeight ?? 0, innerH))
            : item.maxHeight;
        const w = clampSize(parseSpec(item.width, innerW, innerW).value, item.minWidth, maxW);
        const h = clampSize(parseSpec(item.height, innerH, innerH).value, item.minHeight, maxH);
        const ox = innerW > 0 ? clampSize(item.x ?? 0, 0, Math.max(0, innerW - w)) : (item.x ?? 0);
        const oy = innerH > 0 ? clampSize(item.y ?? 0, 0, Math.max(0, innerH - h)) : (item.y ?? 0);
        rects.push({ x: innerX + ox, y: innerY + oy, width: w, height: h });
        maxX = Math.max(maxX, ox + w);
        maxY = Math.max(maxY, oy + h);
      }
      inner = { rects, contentWidth: maxX, contentHeight: maxY };
      break;
    }
  }

  return {
    rects: inner.rects,
    contentWidth: inner.contentWidth + pad.left + pad.right,
    contentHeight: inner.contentHeight + pad.top + pad.bottom
  };
}
