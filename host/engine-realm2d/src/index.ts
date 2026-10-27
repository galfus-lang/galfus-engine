import { EngineRuntime, type EntityId } from '@galfus/engine-core';
import type {
  Sprite2DDesc,
  Shape2DDesc,
  Light2DDesc,
  Camera2DDesc,
  Transform2DDesc,
  Transform2D
} from '@galfus/transport-types';

export interface World2DConfig {
  realmId: number;
}

const DEFAULT_TRANSFORM_2D: Transform2DDesc = {
  position: [0, 0],
  rotation: 0,
  scale: [1, 1],
  zLayer: 0,
  drawOrder: 0
};

/** Represents a 2D graphical realm in the ECS. */
export class World2D {
  readonly realmId: number;

  constructor(config: World2DConfig) {
    this.realmId = config.realmId;
  }

  createSprite(
    entityId: EntityId,
    desc: Sprite2DDesc,
    transform: Transform2DDesc = DEFAULT_TRANSFORM_2D
  ): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm2dCreateSprite(this.realmId, entityId, desc, transform);
  }

  createShape(
    entityId: EntityId,
    desc: Shape2DDesc,
    transform: Transform2DDesc = DEFAULT_TRANSFORM_2D
  ): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm2dCreateShape(this.realmId, entityId, desc, transform);
  }

  createLight(
    entityId: EntityId,
    desc: Light2DDesc,
    transform: Transform2DDesc = DEFAULT_TRANSFORM_2D
  ): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm2dCreateLight(this.realmId, entityId, desc, transform);
  }

  createCamera(
    entityId: EntityId,
    desc: Camera2DDesc,
    transform: Transform2DDesc = DEFAULT_TRANSFORM_2D
  ): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm2dCreateCamera(this.realmId, entityId, desc, transform);
  }

  setSpriteTransform(spriteId: number, transform: Transform2D): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm2dSetSpriteTransform(this.realmId, spriteId, transform);
  }
}

export function createWorld2D(realmId: number): World2D {
  return new World2D({ realmId });
}
