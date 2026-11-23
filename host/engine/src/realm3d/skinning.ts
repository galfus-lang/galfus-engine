/**
 * Skeletal skinning resolution system for Galfus Engine.
 *
 * Runs during the `preRender` stage after AnchorSolveSystem, reading world matrices
 * directly from AnchorMatrixCache and uploading deformation matrices via realm3dUpdateBones.
 */

import type { GalfusEngine } from '@galfus/transport-types';
import type { AnchorMatrixCache } from '../anchors/cache';
import type { System } from '../ecs/system';
import type { EcsWorld } from '../ecs/world';
import { mat4, type Mat4 } from '../math/index';
import { SpatialDirtyFlags } from '../spatial/flags';
import type { Model3DComponent, Skin3DComponent } from './components';

export class SkinningSolveSystem {
  // Pre-allocated scratch matrices for zero-GC fallback execution
  private readonly _invModelMat: Mat4 = mat4.create();
  private readonly _tempMat: Mat4 = mat4.create();
  private readonly _skinMat: Mat4 = mat4.create();
  private readonly _invBindMat: Mat4 = mat4.create();
  private readonly _identityMat: Mat4 = mat4.create();
  private readonly _registeredSkins = new Set<number>();

  constructor(
    readonly realmId: number,
    readonly cache: AnchorMatrixCache
  ) {}

  /**
   * Evaluates or registers all active skins with the engine.
   * Uses core-owned `realm3dCreateSkin` when supported to avoid per-frame FFI bone uploads.
   */
  solve(world: EcsWorld, engine: GalfusEngine | null): void {
    const skinEntities = world.query('Skin3D');
    const useCoreSkins =
      engine !== null &&
      'realm3dCreateSkin' in engine &&
      typeof engine.realm3dCreateSkin === 'function';

    const activeSkinIds = new Set<number>();
    for (const skinEntityId of skinEntities) {
      const skin = world.getComponent<Skin3DComponent>(skinEntityId, 'Skin3D');
      if (!skin || skin.joints.length === 0) continue;

      if (
        !world.isAlive(skin.modelEntityId) ||
        !world.getComponent<Model3DComponent>(skin.modelEntityId, 'Model3D')
      ) {
        world.destroyEntity(skinEntityId);
        continue;
      }

      const model = world.getComponent<Model3DComponent>(skin.modelEntityId, 'Model3D');
      if (!model) continue;

      if (useCoreSkins && engine) {
        activeSkinIds.add(skinEntityId);
        if (!this._registeredSkins.has(skinEntityId) || skin.isDirty) {
          const jointModelIds: number[] = [];
          for (let j = 0; j < skin.joints.length; j++) {
            const jointEntityId = skin.joints[j];
            const jointModel =
              jointEntityId !== undefined
                ? world.getComponent<Model3DComponent>(jointEntityId, 'Model3D')
                : undefined;
            jointModelIds.push(jointModel?.modelId ?? 0);
          }
          if (jointModelIds.every((id) => id > 0)) {
            engine.realm3dCreateSkin(this.realmId, skinEntityId, {
              modelId: model.modelId,
              jointModelIds,
              inverseBindMatrices: Array.from(skin.inverseBindMatrices)
            });
            this._registeredSkins.add(skinEntityId);
            skin.isDirty = false;
          }
        }
        continue;
      }

      // Fallback for mock/offline transports without core skinning
      const isModelDirty = (model.flags & SpatialDirtyFlags.WorldDirty) !== 0;
      let isAnyJointDirty = false;
      for (let j = 0; j < skin.joints.length; j++) {
        const jointEntityId = skin.joints[j];
        if (jointEntityId === undefined) continue;
        const jointModel = world.getComponent<Model3DComponent>(jointEntityId, 'Model3D');
        if (jointModel && (jointModel.flags & SpatialDirtyFlags.WorldDirty) !== 0) {
          isAnyJointDirty = true;
          break;
        }
      }

      if (!skin.isDirty && !isModelDirty && !isAnyJointDirty) {
        continue;
      }

      const modelWorld =
        model.worldMatrix ?? this.cache.getWorld3D(skin.modelEntityId) ?? this._identityMat;
      if (!mat4.invert(this._invModelMat, modelWorld)) {
        mat4.identity(this._invModelMat);
      }

      const jointCount = skin.joints.length;
      for (let j = 0; j < jointCount; j++) {
        const jointEntityId = skin.joints[j];
        if (jointEntityId === undefined) continue;

        const jointModel = world.getComponent<Model3DComponent>(jointEntityId, 'Model3D');
        const jointWorld =
          jointModel?.worldMatrix ?? this.cache.getWorld3D(jointEntityId) ?? this._identityMat;
        const offset = j * 16;

        for (let k = 0; k < 16; k++) {
          this._invBindMat[k] = skin.inverseBindMatrices[offset + k] ?? (k % 5 === 0 ? 1 : 0);
        }

        mat4.multiply(this._tempMat, jointWorld, this._invBindMat);
        mat4.multiply(this._skinMat, this._invModelMat, this._tempMat);

        for (let k = 0; k < 16; k++) {
          skin.jointMatrices[offset + k] = this._skinMat[k] ?? 0;
        }
      }

      if (engine) {
        engine.realm3dUpdateBones(
          this.realmId,
          model.modelId,
          skin.jointMatrices,
          skin.jointMatrices.length
        );
      }

      skin.isDirty = false;
    }

    if (useCoreSkins && engine && this._registeredSkins.size > 0) {
      for (const skinId of this._registeredSkins) {
        if (!activeSkinIds.has(skinId)) {
          engine.realm3dDestroySkin(this.realmId, skinId);
          this._registeredSkins.delete(skinId);
        }
      }
    }
  }

  /**
   * Helper function creating an ECS System instance running this solver in `preRender`.
   */
  createSystem(getEngine: () => GalfusEngine | null): System<EcsWorld> {
    return (world, context) => {
      const engine = context.engine ?? getEngine();
      this.solve(world, engine);
    };
  }
}
