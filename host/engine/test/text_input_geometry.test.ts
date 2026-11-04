import { describe, expect, it } from 'bun:test';
import type { SvgTextLayout } from '@galfus/transport-types';
import { textInputGeometry } from '../../demos/src/host/text-input-geometry';

describe('text input demo geometry', () => {
  it('maps UTF-8 cluster offsets to UTF-16 selection positions', () => {
    const layout: SvgTextLayout = {
      chunks: ['Aé'],
      viewportWidth: 760,
      viewportHeight: 560,
      clusters: [
        {
          chunkIndex: 0,
          byteStart: 0,
          byteEnd: 1,
          transform: [1, 0, 0, 1, 56, 161],
          advance: 10,
          ascent: 15,
          descent: -4,
          rightToLeft: false
        },
        {
          chunkIndex: 0,
          byteStart: 1,
          byteEnd: 3,
          transform: [1, 0, 0, 1, 66, 161],
          advance: 12,
          ascent: 15,
          descent: -4,
          rightToLeft: false
        }
      ]
    };
    const geometry = textInputGeometry(layout, 'Aé', { anchor: 1, focus: 2 }, undefined, 161)!;
    expect(geometry.cursor.x).toBe(78);
    expect(geometry.selections).toEqual([{ x: 66, y: 146, width: 12, height: 19 }]);
  });

  it('uses right-to-left visual edges and supports an empty field and IME preview', () => {
    const layout: SvgTextLayout = {
      chunks: ['אב'],
      viewportWidth: 760,
      viewportHeight: 560,
      clusters: [
        {
          chunkIndex: 0,
          byteStart: 2,
          byteEnd: 4,
          transform: [1, 0, 0, 1, 56, 355],
          advance: 10,
          ascent: 15,
          descent: -4,
          rightToLeft: true
        },
        {
          chunkIndex: 0,
          byteStart: 0,
          byteEnd: 2,
          transform: [1, 0, 0, 1, 66, 355],
          advance: 10,
          ascent: 15,
          descent: -4,
          rightToLeft: true
        }
      ]
    };
    const selected = textInputGeometry(layout, 'אב', { anchor: 0, focus: 1 }, undefined, 355)!;
    expect(selected.selections).toEqual([{ x: 66, y: 340, width: 10, height: 19 }]);
    expect(selected.cursor.x).toBe(66);
    const preview = textInputGeometry(layout, 'אב', { anchor: 0, focus: 0 }, { text: 'אב' }, 355)!;
    expect(preview.cursor.x).toBe(56);
    expect(
      textInputGeometry(undefined, '', { anchor: 0, focus: 0 }, undefined, 355)?.cursor.x
    ).toBe(56);
  });
});
