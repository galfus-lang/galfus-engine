import type { UiCommandDesc } from '@galfus/transport-types';
import type { StyledNode } from '../style/reconcile';
import { sameUiValue } from '../style/resolve';

/** Update staged and resolved data together so subsequent style reconciliation keeps the UV. */
export function stageSpriteUv(
  node: StyledNode,
  uvRect: [number, number, number, number],
  commands: UiCommandDesc[]
): boolean {
  if (node.kind.type !== 'spritePanel') throw new Error('Expected a sprite panel.');
  if (uvRect.length !== 4 || !uvRect.every(Number.isFinite))
    throw new RangeError('Sprite UV requires four finite coordinates.');
  if (sameUiValue(node.kind.uvRect, uvRect)) return false;
  node.kind.uvRect = [...uvRect];
  node.resolved!.kind.uvRect = [...uvRect];
  commands.push({ type: 'setSpriteUvRect', id: node.id, uvRect: [...uvRect] });
  return true;
}
