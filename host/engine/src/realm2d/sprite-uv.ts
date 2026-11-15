import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import type { Sprite2DComponent } from './components';

/** Updates host state so the next synchronization sends only changed UV coordinates. */
export function setSpriteUvRect(
  world: EcsWorld,
  entityId: EntityId,
  uvRect: [number, number, number, number]
): void {
  if (
    uvRect.length !== 4 ||
    !uvRect.every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)))
  )
    throw new RangeError('Sprite UV coordinates must be finite 32-bit floats.');
  const sprite = world.getComponent<Sprite2DComponent>(entityId, 'Sprite2D');
  if (!sprite) throw new Error(`Entity ${entityId} has no Sprite2D.`);
  if (sprite.desc.uvRect?.every((value, index) => value === uvRect[index])) return;
  sprite.desc = { ...sprite.desc, uvRect: [...uvRect] };
  sprite.uvDirty = true;
}
