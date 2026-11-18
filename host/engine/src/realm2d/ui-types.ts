/** Layout from the last frame in which the core solved the UI tree. */
export interface UiComputedLayout {
  readonly localRect: [number, number, number, number];
  readonly absoluteRect: [number, number, number, number];
  readonly clipRect: [number, number, number, number] | null;
  readonly accumulatedOpacity: number;
  readonly contentSize: [number, number];
}

/** One visually ordered shaped cluster in UI coordinates and logical UTF-16 offsets. */
export interface UiTextCluster {
  readonly start: number;
  readonly end: number;
  readonly rect: [number, number, number, number];
  readonly rightToLeft: boolean;
  /** Interior UTF-16 boundaries with positions supplied by the font, when available. */
  readonly carets?: readonly {
    readonly offset: number;
    readonly x: number;
    readonly approximate?: boolean;
  }[];
}

/** A line's UTF-16 range excludes the line break; empty lines have equal endpoints. */
export interface UiTextLineGeometry {
  readonly start: number;
  readonly end: number;
  readonly rect: [number, number, number, number];
}

export interface UiTextGeometry {
  readonly lines: UiTextLineGeometry[];
  readonly clusters: UiTextCluster[];
}
