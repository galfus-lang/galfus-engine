import type { UiQuad2DDesc, UiText2DDesc } from '@galfus/transport-types';
import {
  parseBorderColor,
  parseBorderRadius,
  parseBorderWidth,
  parseColorToRgba
} from '../layout/quad';
import type { PanelStyle, UiRect } from '../layout/types';

/** Compiles a legacy host panel while migration to the core-owned tree is in progress. */
export function compilePanelVisual(
  rect: UiRect,
  style: PanelStyle,
  title: string | undefined,
  headerOffset: number,
  outQuads: UiQuad2DDesc[],
  outTexts: UiText2DDesc[],
  clipRect?: [number, number, number, number]
): void {
  const { x, y, width, height } = rect;
  const bg = parseColorToRgba(style.fill, [0.06, 0.11, 0.18, 1]);
  const borderCol = parseBorderColor(style.stroke);
  const borderW = parseBorderWidth(style.strokeWidth);
  const radii = parseBorderRadius(style.radius);

  outQuads.push({
    rect: [x, y, width, height],
    backgroundColor: bg,
    borderColor: borderCol,
    borderWidth: borderW,
    borderRadius: radii,
    clipRect
  });

  if (title !== undefined) {
    const hh = headerOffset;
    const hFill = parseColorToRgba(style.headerFill, [0.09, 0.16, 0.25, 1]);
    outQuads.push({
      rect: [x + 1, y + 1, Math.max(0, width - 2), hh],
      borderRadius: radii,
      backgroundColor: hFill,
      clipRect
    });
    const fSize = style.titleFontSize ?? 13;
    const maxTitleW = Math.max(0, width - 24);
    const headerClip: [number, number, number, number] = clipRect
      ? [
          Math.max(clipRect[0], x),
          Math.max(clipRect[1], y),
          Math.min(clipRect[2], maxTitleW),
          Math.min(clipRect[3], hh)
        ]
      : [x, y, maxTitleW, hh];
    outTexts.push({
      position: [x + 12, y + Math.max(0, (hh - fSize) * 0.5)],
      fontSize: fSize,
      color: parseColorToRgba(style.titleColor, [0.94, 0.97, 1.0, 1]),
      text: title,
      clipRect: headerClip
    });
  }
}
