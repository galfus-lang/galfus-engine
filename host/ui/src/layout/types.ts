/** Axis-aligned rectangle in SVG viewport coordinates. */
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

export type LayoutConfig =
  LinearLayoutConfig | FlexLayoutConfig | GridLayoutConfig | FreeLayoutConfig;

/** Visual styling for a Panel and its optional header bar. */
export interface PanelStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly opacity?: number;
  readonly headerFill?: string;
  readonly headerHeight?: number;
  readonly titleColor?: string;
  readonly titleFontSize?: number;
}
