/** A rectangle in SVG viewport coordinates. */
export interface TextDecorationRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SvgTextDecorationOptions {
  /** An existing SVG rect reserved for the caret. */
  readonly cursorId: string;
  /** Existing SVG rects reserved for selection spans. */
  readonly selectionIds?: readonly string[];
  /** Alternatively, one existing SVG path can hold any number of selection spans. */
  readonly selectionPathId?: string;
  readonly cursorColor?: string;
  readonly selectionColor?: string;
}

interface SvgAttributeWriter {
  setSvgAttribute(svg: { svgId: number }, elementId: string, name: string, value: string): void;
}

/** Draws host-calculated caret and selection geometry in an existing SVG. */
export class SvgTextDecorations {
  private readonly cache = new Map<string, Map<string, string>>();
  private readonly selectionIds: readonly string[];
  private readonly cursorId: string;
  private readonly selectionPathId?: string;
  private readonly svg: { svgId: number };
  private cursorColor: string;
  private selectionColor: string;
  private disposed = false;

  constructor(
    private readonly realm: SvgAttributeWriter,
    svgId: number,
    options: SvgTextDecorationOptions
  ) {
    const selectionIds = options.selectionIds ?? [];
    if (!options.cursorId || selectionIds.some((id) => !id) || options.selectionPathId === '')
      throw new Error('Text decoration IDs must not be empty.');
    if (selectionIds.length && options.selectionPathId)
      throw new Error('Use selection rectangles or a selection path, not both.');
    const ids = [
      options.cursorId,
      ...selectionIds,
      ...(options.selectionPathId ? [options.selectionPathId] : [])
    ];
    if (new Set(ids).size !== ids.length) throw new Error('Text decoration IDs must be distinct.');
    this.selectionIds = [...selectionIds];
    this.selectionPathId = options.selectionPathId;
    this.cursorId = options.cursorId;
    this.svg = { svgId };
    this.cursorColor = SvgTextDecorations.color(options.cursorColor ?? '#ffffff');
    this.selectionColor = SvgTextDecorations.color(options.selectionColor ?? '#438cff80');
  }

  setColors(colors: { cursorColor?: string; selectionColor?: string }): void {
    this.assertLive();
    const cursorColor =
      colors.cursorColor === undefined
        ? this.cursorColor
        : SvgTextDecorations.color(colors.cursorColor);
    const selectionColor =
      colors.selectionColor === undefined
        ? this.selectionColor
        : SvgTextDecorations.color(colors.selectionColor);
    this.cursorColor = cursorColor;
    this.selectionColor = selectionColor;
    if (this.cache.get(this.cursorId)?.get('display') === 'inline')
      this.attribute(this.cursorId, 'fill', cursorColor);
    for (const id of this.selectionIds)
      if (this.cache.get(id)?.get('display') === 'inline')
        this.attribute(id, 'fill', selectionColor);
    if (this.selectionPathId && this.cache.get(this.selectionPathId)?.get('display') === 'inline')
      this.attribute(this.selectionPathId, 'fill', selectionColor);
  }

  /** Updates geometry and colors; absent rectangles are hidden. */
  update(cursor: TextDecorationRect | undefined, selections: readonly TextDecorationRect[]): void {
    this.assertLive();
    if (!this.selectionPathId && selections.length > this.selectionIds.length)
      throw new RangeError('Not enough SVG selection rectangles for the text layout.');
    if (cursor) SvgTextDecorations.validateRect(cursor);
    for (const rect of selections) SvgTextDecorations.validateRect(rect);
    this.rect(this.cursorId, cursor, this.cursorColor);
    if (this.selectionPathId) {
      if (selections.length) {
        const path = selections
          .map(({ x, y, width, height }) => `M${x} ${y}h${width}v${height}h${-width}z`)
          .join('');
        this.attribute(this.selectionPathId, 'd', path);
        this.attribute(this.selectionPathId, 'fill', this.selectionColor);
        this.attribute(this.selectionPathId, 'display', 'inline');
      } else this.attribute(this.selectionPathId, 'display', 'none');
    }
    for (let index = 0; index < this.selectionIds.length; index++)
      this.rect(this.selectionIds[index]!, selections[index], this.selectionColor);
  }

  dispose(): void {
    if (this.disposed) return;
    this.update(undefined, []);
    this.disposed = true;
    this.cache.clear();
  }

  private rect(id: string, rect: TextDecorationRect | undefined, color: string): void {
    if (!rect) {
      this.attribute(id, 'display', 'none');
      return;
    }
    this.attribute(id, 'x', String(rect.x));
    this.attribute(id, 'y', String(rect.y));
    this.attribute(id, 'width', String(rect.width));
    this.attribute(id, 'height', String(rect.height));
    this.attribute(id, 'fill', color);
    this.attribute(id, 'display', 'inline');
  }

  private attribute(id: string, name: string, value: string): void {
    let attributes = this.cache.get(id);
    if (attributes?.get(name) === value) return;
    this.realm.setSvgAttribute(this.svg, id, name, value);
    if (!attributes) this.cache.set(id, (attributes = new Map()));
    attributes.set(name, value);
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('SVG text decorations are disposed.');
  }

  private static color(value: string): string {
    if (!value.trim()) throw new Error('Text decoration color must not be empty.');
    return value;
  }

  private static validateRect(rect: TextDecorationRect): void {
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      rect.width < 0 ||
      rect.height < 0
    )
      throw new RangeError('Text decoration rectangle must be finite and non-negative in size.');
  }
}
