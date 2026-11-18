import type { EcsWorld } from '../ecs/world';
import type { Collider2DComponent, Collider3DComponent } from './components';

/** Translate core model identifiers to the entities that own the colliders. */
export function translateColliderHits(world: EcsWorld, dimension: '2D' | '3D', hits: unknown) {
  if (!Array.isArray(hits)) return [];
  const owners = new Map<number, number>();
  for (const entityId of world.query(`Collider${dimension}`)) {
    const component = world.getComponent<Collider2DComponent | Collider3DComponent>(
      entityId,
      `Collider${dimension}`
    );
    if (component) {
      for (const entry of component.getShapes()) owners.set(entry.colliderId, entityId);
    }
  }
  return hits.flatMap((hit) => {
    const entityId = owners.get(hit.colliderId);
    if (entityId === undefined) return [];
    const { modelId: _modelId, ...rest } = hit;
    return [{ ...rest, entityId }];
  });
}
