import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import type { Camera3DComponent, ParticleEmitter3DComponent } from './components';

export function resolveCameraId(
  world: EcsWorld,
  camera: number | { cameraId?: number; entityId?: EntityId }
): number {
  if (typeof camera === 'number') {
    return (
      world.getComponent<Camera3DComponent>(camera as EntityId, 'Camera3D')?.cameraId ?? camera
    );
  }
  const resolved =
    camera.cameraId ??
    (camera.entityId
      ? world.getComponent<Camera3DComponent>(camera.entityId, 'Camera3D')?.cameraId
      : undefined);
  if (resolved === undefined)
    throw new Error('Cannot resolve Camera3D ID: entity does not have a Camera3DComponent.');
  return resolved;
}

export function resolveEmitterId(
  world: EcsWorld,
  emitter: number | { emitterId?: number; entityId?: EntityId }
): number {
  if (typeof emitter === 'number') {
    return (
      world.getComponent<ParticleEmitter3DComponent>(emitter as EntityId, 'ParticleEmitter3D')
        ?.emitterId ?? emitter
    );
  }
  const resolved =
    emitter.emitterId ??
    (emitter.entityId
      ? world.getComponent<ParticleEmitter3DComponent>(emitter.entityId, 'ParticleEmitter3D')
          ?.emitterId
      : undefined);
  if (resolved === undefined)
    throw new Error(
      'Cannot resolve ParticleEmitter3D ID: entity does not have a ParticleEmitter3DComponent.'
    );
  return resolved;
}
