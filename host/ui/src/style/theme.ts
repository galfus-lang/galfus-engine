import type { UiDimensionDesc, UiLayoutStyleDesc } from '@galfus/transport-types';

export type UiThemeColor = [number, number, number, number];
export type UiBox = [number, number, number, number];
export type UiStyleState =
  'hover' | 'focus' | 'focusVisible' | 'active' | 'checked' | 'invalid' | 'readOnly' | 'disabled';
export const UI_STYLE_STATE_ORDER: readonly UiStyleState[] = Object.freeze([
  'hover',
  'focus',
  'focusVisible',
  'active',
  'checked',
  'invalid',
  'readOnly',
  'disabled'
]);

export interface UiTypography {
  fontFamily?: string;
  fontAxes?: Record<string, number>;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  lineHeight?: number;
}
export interface UiTokens {
  colors: Record<string, UiThemeColor>;
  typography: Record<string, UiTypography>;
  spacing: Record<string, number>;
  borders: Record<string, number[]>;
  radii: Record<string, number[]>;
  sizes: Record<string, number>;
}
export type UiTokenOverrides = { [K in keyof UiTokens]?: Partial<UiTokens[K]> };
type Token<K extends keyof UiTokens> = { readonly token: `${K}.${string}` };

/** Style properties translated to ModelUI; typography and text color can be inherited. */
export interface UiStyle {
  /** Additional non-inherited ModelUI layout properties. */
  layout?: UiLayoutStyleDesc;
  typography?: UiTypography | Token<'typography'>;
  color?: UiThemeColor | Token<'colors'>;
  backgroundColor?: UiThemeColor | Token<'colors'>;
  borderColor?: UiThemeColor | Token<'colors'>;
  borderColors?: UiThemeColor[];
  borderWidth?: number[] | Token<'borders'>;
  borderRadius?: number[] | Token<'radii'>;
  opacity?: number;
  clip?: boolean;
  padding?: UiBox | Token<'spacing'>;
  gap?: [number, number] | Token<'spacing'>;
  width?: UiDimensionDesc | Token<'sizes'>;
  height?: UiDimensionDesc | Token<'sizes'>;
}
export interface UiComponentTheme {
  base?: UiStyle;
  variants?: Record<string, UiStyle>;
  states?: Partial<Record<UiStyleState, UiStyle>>;
}
export type UiComponentStyleKind =
  | 'button'
  | 'buttonGroup'
  | 'appBar'
  | 'toolbar'
  | 'inputText'
  | 'textArea'
  | 'checkbox'
  | 'radio'
  | 'radioGroup'
  | 'switch'
  | 'slider'
  | 'select'
  | 'dialog'
  | 'progressBar'
  | 'progressFill';
export type UiThemeComponent = 'panel' | 'text' | UiComponentStyleKind;
export interface UiTheme {
  tokens: UiTokens;
  components: Record<UiThemeComponent, UiComponentTheme>;
}
export interface UiThemeOverrides {
  tokens?: UiTokenOverrides;
  components?: Partial<Record<UiThemeComponent, UiComponentTheme>>;
}
export interface UiStyleConfig {
  /** @internal Theme for a panel-based package component. */
  component?: UiComponentStyleKind;
  style?: UiStyle;
  variant?: string;
  states?: Partial<Record<UiStyleState, UiStyle>>;
  activeStates?: UiStyleState[];
  tokens?: UiTokenOverrides;
}

const DEFAULT_THEME: UiTheme = {
  tokens: {
    colors: { text: [1, 1, 1, 1], surface: [0, 0, 0, 0], accent: [0.2, 0.5, 1, 1] },
    typography: { body: { fontSize: 14, fontWeight: 400, italic: false } },
    spacing: { none: 0, small: 4, medium: 8, large: 16 },
    borders: { none: [0, 0, 0, 0], thin: [1, 1, 1, 1] },
    radii: { none: [0, 0, 0, 0], medium: [4, 4, 4, 4] },
    sizes: { small: 24, medium: 32, large: 40 }
  },
  components: {
    panel: {},
    text: { base: { typography: { token: 'typography.body' }, color: { token: 'colors.text' } } },
    button: {
      base: { backgroundColor: [0.17, 0.27, 0.39, 1], color: [1, 1, 1, 1] },
      states: {
        hover: { backgroundColor: [0.23, 0.38, 0.53, 1] },
        active: { backgroundColor: [0.1, 0.2, 0.31, 1] },
        focusVisible: { borderColor: [0.65, 0.85, 1, 1], borderWidth: [2, 2, 2, 2] },
        disabled: { backgroundColor: [0.16, 0.18, 0.21, 1], color: [0.55, 0.58, 0.62, 1] }
      }
    },
    buttonGroup: {},
    appBar: { base: { backgroundColor: [0.08, 0.13, 0.2, 1] } },
    toolbar: {},
    inputText: {
      base: {
        backgroundColor: [0.08, 0.12, 0.18, 1],
        borderColor: [0.55, 0.68, 0.8, 1],
        borderWidth: [2, 2, 2, 2]
      },
      states: {
        focus: { borderColor: [0.4, 0.75, 1, 1] },
        focusVisible: { borderColor: [0.65, 0.88, 1, 1] },
        invalid: { borderColor: [1, 0.35, 0.35, 1] },
        disabled: { opacity: 0.5 }
      }
    },
    textArea: {
      base: {
        backgroundColor: [0.08, 0.12, 0.18, 1],
        borderColor: [0.55, 0.68, 0.8, 1],
        borderWidth: [2, 2, 2, 2]
      },
      states: {
        focus: { borderColor: [0.4, 0.75, 1, 1] },
        focusVisible: { borderColor: [0.65, 0.88, 1, 1] },
        invalid: { borderColor: [1, 0.35, 0.35, 1] },
        disabled: { opacity: 0.5 }
      }
    },
    checkbox: {
      base: {
        backgroundColor: [0.1, 0.16, 0.23, 1],
        borderColor: [0.55, 0.68, 0.8, 1],
        borderWidth: [1, 1, 1, 1]
      },
      states: {
        hover: { backgroundColor: [0.16, 0.25, 0.35, 1] },
        checked: { backgroundColor: [0.12, 0.35, 0.48, 1] },
        focusVisible: { borderColor: [0.65, 0.88, 1, 1], borderWidth: [2, 2, 2, 2] },
        disabled: { opacity: 0.5 }
      }
    },
    radio: {
      base: {
        backgroundColor: [0.1, 0.16, 0.23, 1],
        borderColor: [0.55, 0.68, 0.8, 1],
        borderWidth: [1, 1, 1, 1]
      },
      states: {
        hover: { backgroundColor: [0.16, 0.25, 0.35, 1] },
        checked: { backgroundColor: [0.12, 0.35, 0.48, 1] },
        focusVisible: { borderColor: [0.65, 0.88, 1, 1], borderWidth: [2, 2, 2, 2] },
        disabled: { opacity: 0.5 }
      }
    },
    radioGroup: { base: { backgroundColor: [0, 0, 0, 0] } },
    switch: {
      base: {
        backgroundColor: [0.1, 0.16, 0.23, 1],
        borderColor: [0.55, 0.68, 0.8, 1],
        borderWidth: [1, 1, 1, 1]
      },
      states: {
        hover: { backgroundColor: [0.16, 0.25, 0.35, 1] },
        checked: { backgroundColor: [0.12, 0.35, 0.48, 1] },
        focusVisible: { borderColor: [0.65, 0.88, 1, 1], borderWidth: [2, 2, 2, 2] },
        disabled: { opacity: 0.5 }
      }
    },
    slider: {
      base: {
        backgroundColor: [0.08, 0.12, 0.18, 1],
        borderColor: [0.55, 0.68, 0.8, 1],
        borderWidth: [1, 1, 1, 1]
      },
      states: {
        focusVisible: { borderColor: [0.65, 0.88, 1, 1], borderWidth: [2, 2, 2, 2] },
        disabled: { opacity: 0.5 }
      }
    },
    select: {
      base: {
        backgroundColor: [0.1, 0.16, 0.23, 1],
        borderColor: [0.55, 0.68, 0.8, 1],
        borderWidth: [1, 1, 1, 1]
      },
      states: {
        hover: { backgroundColor: [0.16, 0.25, 0.35, 1] },
        focusVisible: { borderColor: [0.65, 0.88, 1, 1], borderWidth: [2, 2, 2, 2] },
        disabled: { opacity: 0.5 }
      }
    },
    dialog: {
      base: {
        backgroundColor: [0.08, 0.13, 0.2, 1],
        borderColor: [0.45, 0.65, 0.8, 1],
        borderWidth: [2, 2, 2, 2],
        borderRadius: [6, 6, 6, 6]
      }
    },
    progressBar: {
      base: {
        backgroundColor: [0.08, 0.12, 0.18, 1],
        borderColor: [0.45, 0.6, 0.72, 1],
        borderWidth: [1, 1, 1, 1]
      }
    },
    progressFill: { base: { backgroundColor: [0.25, 0.7, 0.9, 1] } }
  }
};

/** Returns an isolated default theme with optional overrides. */
export function createUiTheme(overrides: UiThemeOverrides = {}): UiTheme {
  return mergeUiTheme(DEFAULT_THEME, overrides);
}

/** Returns a copy with overrides; the inputs are never mutated. */
export function mergeUiTheme(base: UiTheme, overrides: UiThemeOverrides): UiTheme {
  const result = structuredClone(base);
  result.tokens = mergeUiTokens(result.tokens, overrides.tokens);
  for (const type of [
    'panel',
    'text',
    'button',
    'buttonGroup',
    'appBar',
    'toolbar',
    'inputText',
    'textArea',
    'checkbox',
    'radio',
    'radioGroup',
    'switch',
    'slider',
    'select',
    'dialog',
    'progressBar',
    'progressFill'
  ] as const) {
    const source = overrides.components?.[type];
    if (!source) continue;
    const target = result.components[type];
    if (source.base) target.base = { ...target.base, ...structuredClone(source.base) };
    if (source.variants) {
      target.variants ??= {};
      for (const [name, style] of Object.entries(source.variants))
        target.variants[name] = { ...target.variants[name], ...structuredClone(style) };
    }
    if (source.states) {
      target.states ??= {};
      for (const state of UI_STYLE_STATE_ORDER)
        if (source.states[state])
          target.states[state] = {
            ...target.states[state],
            ...structuredClone(source.states[state])
          };
    }
  }
  return result;
}

export function mergeUiTokens(base: UiTokens, overrides?: UiTokenOverrides): UiTokens {
  const result = structuredClone(base);
  if (!overrides) return result;
  for (const key of ['colors', 'typography', 'spacing', 'borders', 'radii', 'sizes'] as const) {
    if (key === 'typography' && overrides.typography) {
      for (const [name, style] of Object.entries(overrides.typography))
        result.typography[name] = { ...result.typography[name], ...structuredClone(style) };
    } else if (overrides[key]) Object.assign(result[key], structuredClone(overrides[key]));
  }
  return result;
}
