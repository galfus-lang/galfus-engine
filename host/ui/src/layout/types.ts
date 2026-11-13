/** Axis-aligned rectangle in 2D UI viewport coordinates. */
export interface UiRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Inner padding of a Panel container. */
export type UiPadding =
  | number
  | {
      readonly top?: number;
      readonly right?: number;
      readonly bottom?: number;
      readonly left?: number;
    };

/** Track or item size specification: fixed pixels, percentage ('50%'), flex fraction ('1fr'), or 'auto'. */
export type UiSizeSpec = number | `${number}%` | `${number}fr` | 'auto';

/** Sizing and positioning constraints for any layout child. */
export interface UiSizeConstraints {
  x?: number;
  y?: number;
  width?: UiSizeSpec;
  height?: UiSizeSpec;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Flex grow weight used in horizontal, vertical, flex, and split layouts. */
  flex?: number;
}

export type UiAlign = 'start' | 'center' | 'end' | 'stretch';
export type UiJustify = 'start' | 'center' | 'end' | 'space-between';

export interface LinearLayoutConfig {
  readonly type: 'horizontal' | 'vertical';
  readonly gap?: number;
  readonly align?: UiAlign;
  readonly justify?: UiJustify;
}

export interface FlexLayoutConfig {
  readonly type: 'flex';
  readonly direction?: 'row' | 'column';
  readonly gap?: number;
  readonly align?: UiAlign;
  readonly justify?: UiJustify;
  readonly wrap?: boolean;
}

export interface GridLayoutConfig {
  readonly type: 'grid';
  readonly columns: readonly UiSizeSpec[] | number;
  readonly rows?: readonly UiSizeSpec[] | number;
  readonly gap?: number;
  readonly gapX?: number;
  readonly gapY?: number;
  readonly rowHeight?: number;
}

export interface FreeLayoutConfig {
  readonly type: 'free';
}

export interface StackLayoutConfig {
  readonly type: 'stack' | 'relative';
  readonly fit?: 'expand' | 'passthrough';
}

export type LayoutConfig =
  LinearLayoutConfig | FlexLayoutConfig | GridLayoutConfig | FreeLayoutConfig | StackLayoutConfig;

/** Quad value specification: 1 value (all), 2 values (vertical, horizontal), 3 values (top, horizontal, bottom), or 4 values (top, right, bottom, left). */
export type QuadSpec<T> = T | readonly [T, T] | readonly [T, T, T] | readonly [T, T, T, T];
export type UiQuadSpec<T> = QuadSpec<T>;

export type UiBorderRadius = QuadSpec<number>;
export type UiBorderWidth = QuadSpec<number>;
export type UiColor = [number, number, number, number] | string;
export type UiBorderColor = QuadSpec<UiColor>;

/** Visual styling for a Panel and its optional header bar. */
export interface PanelStyle {
  readonly fill?: UiColor;
  readonly stroke?: UiBorderColor;
  readonly strokeWidth?: UiBorderWidth;
  readonly radius?: UiBorderRadius;
  readonly opacity?: number;
  readonly headerFill?: UiColor;
  readonly headerHeight?: number;
  readonly titleColor?: UiColor;
  readonly titleFontSize?: number;
}

export interface PanelResizeOptions {
  readonly edges?: readonly ('right' | 'bottom' | 'corner')[];
  readonly handleSize?: number;
}
