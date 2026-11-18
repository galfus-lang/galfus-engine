// Regenerate the distributable PNG and its browser-safe embedded representation.
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

type Rgba = [number, number, number, number];
const size = 24;
const image = new PNG({ width: size * 8, height: size * 2 });
const distSegment = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};
const line = (x: number, y: number, points: number[][], width = 1.15) =>
  points
    .slice(1)
    .some(
      (point, i) => distSegment(x, y, points[i]![0]!, points[i]![1]!, point[0]!, point[1]!) < width
    );
const roundedBoxSdf = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  r: number
) => {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const check = (x: number, y: number, width = 1.35) =>
  line(
    x,
    y,
    [
      [6.5, 12.3],
      [10.2, 16],
      [17.6, 8.3]
    ],
    width
  );
const checkboxSample = (
  x: number,
  y: number,
  mode: 'unchecked' | 'checked' | 'indeterminate'
): Rgba => {
  const d = roundedBoxSdf(x, y, 12, 12, 7.8, 7.8, 3.2);
  if (d > 0) return [0, 0, 0, 0];
  if (mode === 'unchecked') {
    return d > -1.6 ? [140, 172, 208, 255] : [20, 32, 48, 240];
  }
  const mark =
    mode === 'checked'
      ? check(x, y, 1.45)
      : line(
          x,
          y,
          [
            [7.2, 12],
            [16.8, 12]
          ],
          1.45
        );
  if (mark) return [255, 255, 255, 255];
  return d > -1.2 ? [76, 156, 255, 255] : [42, 128, 246, 255];
};
const radioSample = (x: number, y: number, checked: boolean): Rgba => {
  const dist = Math.hypot(x - 12, y - 12);
  if (dist > 8.2) return [0, 0, 0, 0];
  if (!checked) {
    return dist >= 6.5 ? [140, 172, 208, 255] : [20, 32, 48, 240];
  }
  if (dist <= 4.3 || dist >= 6.4) return [52, 140, 252, 255];
  return [20, 32, 48, 240];
};
const switchSample = (x: number, y: number, on: boolean): Rgba => {
  const thumbX = on ? 16.4 : 7.6;
  if (Math.hypot(x - thumbX, y - 12) <= 4.3) {
    return on ? [255, 255, 255, 255] : [236, 244, 255, 255];
  }
  const d = roundedBoxSdf(x, y, 12, 12, 10.2, 6, 6);
  if (d > 0) return [0, 0, 0, 0];
  if (on) {
    return d > -1.1 ? [76, 156, 255, 255] : [42, 128, 246, 255];
  }
  return d > -1.2 ? [108, 134, 162, 255] : [52, 68, 88, 255];
};
const whiteGlyph =
  (fn: (x: number, y: number) => boolean) =>
  (x: number, y: number): Rgba =>
    fn(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 0];
const shapes: Array<(x: number, y: number) => Rgba> = [
  (x, y) => checkboxSample(x, y, 'unchecked'),
  (x, y) => checkboxSample(x, y, 'checked'),
  (x, y) => checkboxSample(x, y, 'indeterminate'),
  (x, y) => radioSample(x, y, false),
  (x, y) => radioSample(x, y, true),
  (x, y) => switchSample(x, y, false),
  (x, y) => switchSample(x, y, true),
  whiteGlyph((x, y) =>
    line(x, y, [
      [6, 9],
      [12, 15],
      [18, 9]
    ])
  ),
  whiteGlyph((x, y) =>
    line(x, y, [
      [9, 6],
      [15, 12],
      [9, 18]
    ])
  ),
  whiteGlyph((x, y) =>
    line(x, y, [
      [6, 15],
      [12, 9],
      [18, 15]
    ])
  ),
  whiteGlyph((x, y) =>
    line(x, y, [
      [15, 6],
      [9, 12],
      [15, 18]
    ])
  ),
  whiteGlyph((x, y) => check(x, y)),
  whiteGlyph(
    (x, y) =>
      line(x, y, [
        [6, 6],
        [18, 18]
      ]) ||
      line(x, y, [
        [18, 6],
        [6, 18]
      ])
  ),
  whiteGlyph((x, y) =>
    [7, 12, 17].some((yy) =>
      line(x, y, [
        [5, yy],
        [19, yy]
      ])
    )
  ),
  whiteGlyph((x, y) => [7, 12, 17].some((xx) => Math.hypot(x - xx, y - 12) < 1.5)),
  whiteGlyph(
    (x, y) =>
      line(x, y, [
        [5, 12],
        [19, 12]
      ]) ||
      line(x, y, [
        [12, 5],
        [12, 19]
      ])
  )
];
for (let i = 0; i < shapes.length; i++) {
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        hits = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const [sr, sg, sb, sa] = shapes[i]!(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4);
          if (sa > 0) {
            r += sr;
            g += sg;
            b += sb;
            a += sa;
            hits++;
          }
        }
      const offset = ((Math.floor(i / 8) * size + y) * image.width + (i % 8) * size + x) * 4;
      image.data[offset] = hits ? Math.round(r / hits) : 0;
      image.data[offset + 1] = hits ? Math.round(g / hits) : 0;
      image.data[offset + 2] = hits ? Math.round(b / hits) : 0;
      image.data[offset + 3] = Math.round(a / 16);
    }
}
const png = PNG.sync.write(image);
writeFileSync(new URL('../assets/ui-icons.png', import.meta.url), png);
writeFileSync(
  new URL('../src/icons/embedded.ts', import.meta.url),
  `// Generated by scripts/generate-icons.ts.\nexport const UI_ICONS_PNG_BASE64 =\n  '${png.toString('base64')}';\n`
);
