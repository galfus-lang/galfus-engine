import type { DescSpec } from './types';

export const svgTextDescriptors: DescSpec[] = [
  {
    kind: 'object',
    name: 'SvgTextCluster',
    doc: 'A shaped cluster. Byte offsets index the normalized UTF-8 chunk; transform is in SVG viewport coordinates.',
    fields: {
      chunkIndex: { type: 'number' },
      byteStart: { type: 'number' },
      byteEnd: { type: 'number' },
      transform: { type: { tuple: ['number', 'number', 'number', 'number', 'number', 'number'] } },
      advance: { type: 'number' },
      ascent: { type: 'number' },
      descent: { type: 'number' },
      rightToLeft: { type: 'boolean' }
    }
  },
  {
    kind: 'object',
    name: 'SvgTextLayout',
    fields: {
      chunks: { type: { array: 'string' } },
      clusters: { type: { array: { ref: 'SvgTextCluster' } } },
      viewportWidth: { type: 'number' },
      viewportHeight: { type: 'number' }
    }
  },
  {
    kind: 'object',
    name: 'SvgTextLayoutResult',
    fields: { layout: { type: { ref: 'SvgTextLayout' }, optional: true } }
  }
];
