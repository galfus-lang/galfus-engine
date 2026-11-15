import type { UiDimensionDesc, UiLayoutStyleDesc, UiNodeKindDesc } from '@galfus/transport-types';
import { mergeUiTokens, UI_STYLE_STATE_ORDER } from './theme';
import type {
  UiBox,
  UiStyle,
  UiStyleConfig,
  UiTheme,
  UiThemeColor,
  UiTokens,
  UiTypography
} from './theme';

export type InheritedText = UiTypography & { color?: UiThemeColor };
export interface ResolvedComponentStyle {
  kind: UiNodeKindDesc;
  layout: UiLayoutStyleDesc;
  inherited: InheritedText;
  tokens: UiTokens;
}

function token<T>(
  value: T | { readonly token: string },
  category: keyof UiTokens,
  tokens: UiTokens
): T {
  if (value && typeof value === 'object' && 'token' in value) {
    const prefix = `${category}.`;
    if (!value.token.startsWith(prefix)) throw new Error(`Expected a ${category} token.`);
    const key = value.token.slice(prefix.length);
    const values = tokens[category] as Record<string, unknown>;
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown UI token: ${value.token}`);
    return structuredClone(values[key]) as T;
  }
  return structuredClone(value) as T;
}

function apply(
  style: UiStyle | undefined,
  tokens: UiTokens,
  text: InheritedText,
  kind: UiNodeKindDesc,
  layout: UiLayoutStyleDesc
): void {
  if (!style) return;
  if (
    kind.type === 'text' &&
    (style.backgroundColor !== undefined ||
      style.borderColor !== undefined ||
      style.borderColors !== undefined ||
      style.borderWidth !== undefined ||
      style.borderRadius !== undefined ||
      style.opacity !== undefined ||
      style.clip !== undefined)
  )
    throw new Error('Panel paint properties cannot be applied to a text component.');
  if (style.layout) Object.assign(layout, structuredClone(style.layout));
  if (style.typography !== undefined)
    Object.assign(text, token<UiTypography>(style.typography, 'typography', tokens));
  if (style.color !== undefined) text.color = token<UiThemeColor>(style.color, 'colors', tokens);
  for (const name of ['backgroundColor', 'borderColor'] as const) {
    if (style[name] !== undefined) kind[name] = token<UiThemeColor>(style[name], 'colors', tokens);
  }
  if (style.borderColors !== undefined) kind.borderColors = structuredClone(style.borderColors);
  if (style.borderWidth !== undefined)
    kind.borderWidth = token<number[]>(style.borderWidth, 'borders', tokens);
  if (style.borderRadius !== undefined)
    kind.borderRadius = token<number[]>(style.borderRadius, 'radii', tokens);
  if (style.opacity !== undefined) kind.opacity = style.opacity;
  if (style.clip !== undefined) kind.clip = style.clip;
  if (style.padding !== undefined) {
    const value = token<UiBox | number>(style.padding, 'spacing', tokens);
    layout.padding = typeof value === 'number' ? [value, value, value, value] : value;
  }
  if (style.gap !== undefined) {
    const value = token<[number, number] | number>(style.gap, 'spacing', tokens);
    layout.gap = typeof value === 'number' ? [value, value] : value;
  }
  for (const name of ['width', 'height'] as const) {
    const value = style[name];
    if (value !== undefined) {
      const resolved = token<UiDimensionDesc | number>(value, 'sizes', tokens);
      layout[name] = typeof resolved === 'number' ? { type: 'exact', value: resolved } : resolved;
    }
  }
}

/** Resolves one node. Direct ModelUI properties take precedence over package styles. */
export function resolveComponentStyle(
  type: 'panel' | 'text',
  directKind: UiNodeKindDesc,
  directLayout: UiLayoutStyleDesc,
  config: UiStyleConfig,
  inherited: InheritedText,
  parentTokens: UiTokens,
  theme: UiTheme
): ResolvedComponentStyle {
  const tokens = mergeUiTokens(parentTokens, config.tokens);
  const source = theme.components[type];
  const component =
    type === 'panel' && config.component ? theme.components[config.component] : undefined;
  const baseText: InheritedText = {};
  const kind: UiNodeKindDesc = { type };
  const layout: UiLayoutStyleDesc = {};
  apply(source.base, tokens, baseText, kind, layout);
  apply(component?.base, tokens, baseText, kind, layout);
  Object.assign(baseText, structuredClone(inherited));
  if (config.variant !== undefined) {
    const variant = component?.variants?.[config.variant] ?? source.variants?.[config.variant];
    if (!variant) throw new Error(`Unknown ${type} variant: ${config.variant}`);
    apply(variant, tokens, baseText, kind, layout);
  }
  for (const state of UI_STYLE_STATE_ORDER) {
    if (!config.activeStates?.includes(state)) continue;
    apply(source.states?.[state], tokens, baseText, kind, layout);
    apply(component?.states?.[state], tokens, baseText, kind, layout);
    apply(config.states?.[state], tokens, baseText, kind, layout);
  }
  apply(config.style, tokens, baseText, kind, layout);
  const ownText: InheritedText = {};
  for (const key of [
    'fontFamily',
    'fontAxes',
    'fontSize',
    'fontWeight',
    'italic',
    'lineHeight',
    'color'
  ] as const) {
    const value = directKind[key];
    if (value !== undefined) Object.assign(ownText, { [key]: structuredClone(value) });
  }
  Object.assign(baseText, ownText);
  if (type === 'text') Object.assign(kind, baseText);
  for (const [key, value] of Object.entries(directKind)) {
    if (value !== undefined) Object.assign(kind, { [key]: structuredClone(value) });
  }
  for (const [key, value] of Object.entries(directLayout)) {
    if (value !== undefined) Object.assign(layout, { [key]: structuredClone(value) });
  }
  return { kind, layout, inherited: baseText, tokens };
}

/** Equality for JSON-like UI values, independent of object key insertion order. */
export function sameUiValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameUiValue(item, b[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameUiValue(left[key], right[key]))
  );
}
