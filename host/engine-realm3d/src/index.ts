import { EngineRuntime, type EntityId } from '@galfus/engine-core';
import type {
  Model3DDesc,
  Camera3DDesc,
  Light3DDesc,
  Material3DDesc,
  EnvironmentRealm3DDesc,
  Transform3DDesc,
  Transform3D
} from '@galfus/transport-types';

export interface World3DConfig {
  realmId: number;
}

const DEFAULT_TRANSFORM_3D: Transform3DDesc = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1]
};

/** Represents a 3D graphical realm in the ECS. */
export class World3D {
  readonly realmId: number;

  constructor(config: World3DConfig) {
    this.realmId = config.realmId;
  }

  createModel(
    entityId: EntityId,
    desc: Model3DDesc,
    transform: Transform3DDesc = DEFAULT_TRANSFORM_3D
  ): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm3dCreateModel(this.realmId, entityId, desc, transform);
  }

  createCamera(
    entityId: EntityId,
    desc: Camera3DDesc,
    transform: Transform3DDesc = DEFAULT_TRANSFORM_3D
  ): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm3dCreateCamera(this.realmId, entityId, desc, transform);
  }

  createLight(
    entityId: EntityId,
    desc: Light3DDesc,
    transform: Transform3DDesc = DEFAULT_TRANSFORM_3D
  ): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm3dCreateLight(this.realmId, entityId, desc, transform);
  }

  createMaterial(materialId: number, desc: Material3DDesc): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm3dCreateMaterial(this.realmId, materialId, desc);
  }

  setEnvironment(desc: EnvironmentRealm3DDesc): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm3dSetEnvironment(this.realmId, desc);
  }

  setModelTransform(modelId: number, transform: Transform3D): void {
    const engine = EngineRuntime.getInstance().engine;
    engine.realm3dSetModelTransform(this.realmId, modelId, transform);
  }
}

export function createWorld3D(realmId: number): World3D {
  return new World3D({ realmId });
}
