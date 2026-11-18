import type { QuadSpec, UiBorderColor, UiBorderRadius, UiBorderWidth, UiColor } from './types';

/**
 * Parses 1, 2, 3, or 4-value quad specs into clockwise [top, right, bottom, left].
 */
export function parseQuad<T>(val: QuadSpec<T> | undefined, fallback: T): [T, T, T, T] {
  if (val === undefined) return [fallback, fallback, fallback, fallback];
  if (!Array.isArray(val)) {
    const v = val as T;
    return [v, v, v, v];
  }
  if (val.length === 1) {
    const v = val[0] ?? fallback;
    return [v, v, v, v];
  }
  if (val.length === 2) {
    const v = val[0] ?? fallback;
    const h = val[1] ?? fallback;
    return [v, h, v, h];
  }
  if (val.length === 3) {
    const t = val[0] ?? fallback;
    const h = val[1] ?? fallback;
    const b = val[2] ?? fallback;
    return [t, h, b, h];
  }
  return [val[0] ?? fallback, val[1] ?? fallback, val[2] ?? fallback, val[3] ?? fallback];
}

/** Parses corner radii into clockwise [topLeft, topRight, bottomRight, bottomLeft]. */
export function parseBorderRadius(val?: UiBorderRadius): [number, number, number, number] {
  return parseQuad(val, 0);
}

/** Parses border widths into clockwise [top, right, bottom, left]. */
export function parseBorderWidth(val?: UiBorderWidth): [number, number, number, number] {
  return parseQuad(val, 0);
}

/** Converts a color representation (RGB/RGBA array or hex/rgb string) to normalized `[r, g, b, a]` (0.0..1.0). */
export function parseColorToRgba(
  color?: UiColor,
  fallback: [number, number, number, number] = [1, 1, 1, 1]
): [number, number, number, number] {
  if (!color) return fallback;
  if (Array.isArray(color)) {
    return [
      color[0] ?? fallback[0],
      color[1] ?? fallback[1],
      color[2] ?? fallback[2],
      color[3] ?? fallback[3]
    ];
  }
  const str = color.trim().toLowerCase();
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16) / 255;
      const g = parseInt(hex[1]! + hex[1]!, 16) / 255;
      const b = parseInt(hex[2]! + hex[2]!, 16) / 255;
      return [r, g, b, 1];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return [r, g, b, 1];
    }
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return [r, g, b, a];
    }
  }
  if (str.startsWith('rgba') || str.startsWith('rgb')) {
    const matches = str.match(/\(([^)]+)\)/);
    if (matches && matches[1]) {
      const parts = matches[1].split(',').map((p) => parseFloat(p.trim()));
      const r = (parts[0] ?? 255) / 255;
      const g = (parts[1] ?? 255) / 255;
      const b = (parts[2] ?? 255) / 255;
      const a = parts[3] !== undefined ? parts[3] : 1;
      return [r, g, b, a];
    }
  }
  return fallback;
}

export function parseBorderColor(
  val?: UiBorderColor,
  fallback: [number, number, number, number] = [0, 0, 0, 0]
): [number, number, number, number] {
  if (val === undefined) return fallback;
  if (Array.isArray(val) && typeof val[0] === 'number') {
    return val as unknown as [number, number, number, number];
  }
  if (Array.isArray(val) && val.length > 0) {
    return parseColorToRgba(val[0] as unknown as UiColor, fallback);
  }
  return parseColorToRgba(val as unknown as UiColor, fallback);
}
