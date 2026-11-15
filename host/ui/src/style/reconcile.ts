import type { UiCommandDesc, UiLayoutStyleDesc, UiNodeKindDesc } from '@galfus/transport-types';
import { resolveComponentStyle, sameUiValue } from './resolve';
import type { ResolvedComponentStyle } from './resolve';
import type { UiStyleConfig, UiStyleState, UiTheme } from './theme';

export interface StyledNode {
  readonly id: number;
  readonly type: 'panel' | 'text';
  readonly parent: number | null;
  children: number[];
  kind: UiNodeKindDesc;
  layout: UiLayoutStyleDesc;
  visible: boolean;
  style: UiStyleConfig;
  interactionStates?: UiStyleState[];
  resolved?: ResolvedComponentStyle;
}

/** Recalculates a subtree and returns only changed core properties. */
export function reconcileStyles(
  nodes: Map<number, StyledNode>,
  start: number,
  theme: UiTheme,
  force = false
): UiCommandDesc[] {
  const updates: UiCommandDesc[] = [];
  const visit = (id: number) => {
    const node = nodes.get(id);
    if (!node) throw new Error('UI style tree is invalid.');
    const parent = node.parent === null ? undefined : nodes.get(node.parent)?.resolved;
    if (node.parent !== null && !parent) throw new Error('Parent style is unavailable.');
    const previous = node.resolved;
    const next = resolveComponentStyle(
      node.type,
      node.kind,
      node.layout,
      {
        ...node.style,
        activeStates: [
          ...new Set([...(node.style.activeStates ?? []), ...(node.interactionStates ?? [])])
        ]
      },
      parent?.inherited ?? {},
      parent?.tokens ?? theme.tokens,
      theme
    );
    node.resolved = next;
    if (previous && !sameUiValue(previous.kind, next.kind))
      updates.push({ type: 'setKind', id, kind: structuredClone(next.kind) });
    if (previous && !sameUiValue(previous.layout, next.layout))
      updates.push({ type: 'setLayout', id, layout: structuredClone(next.layout) });
    if (
      force ||
      !previous ||
      !sameUiValue(previous.inherited, next.inherited) ||
      !sameUiValue(previous.tokens, next.tokens)
    ) {
      for (const child of node.children) visit(child);
    }
  };
  visit(start);
  return updates;
}
