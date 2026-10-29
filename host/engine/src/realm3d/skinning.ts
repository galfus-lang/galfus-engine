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
import type { Model3DComponent, Skin3DComponent } from './components';

export class SkinningSolveSystem {
  // Pre-allocated scratch matrices for zero-GC execution
  private readonly _invModelMat: Mat4 = mat4.create();
  private readonly _tempMat: Mat4 = mat4.create();
  private readonly _skinMat: Mat4 = mat4.create();
  private readonly _invBindMat: Mat4 = mat4.create();
  private readonly _identityMat: Mat4 = mat4.create();

  constructor(
    readonly realmId: number,
    readonly cache: AnchorMatrixCache
  ) {}

  /**
   * Evaluates all active skins and submits bone matrices to the engine.
   */
  solve(world: EcsWorld, engine: GalfusEngine | null): void {
    const skinEntities = world.query('Skin3D');
    if (skinEntities.length === 0) return;

    for (const skinEntityId of skinEntities) {
      const skin = world.getComponent<Skin3DComponent>(skinEntityId, 'Skin3D');
      if (!skin || skin.joints.length === 0) continue;

      const model = world.getComponent<Model3DComponent>(skin.modelEntityId, 'Model3D');
      if (!model) continue;

      // 1. Get model world matrix from cache (or identity if not in cache)
      const modelWorld = this.cache.getWorld3D(skin.modelEntityId) ?? this._identityMat;

      // 2. Invert model world matrix
      if (!mat4.invert(this._invModelMat, modelWorld)) {
        mat4.identity(this._invModelMat);
      }

      // 3. For each joint bone, compute: SkinMatrix = inv(ModelWorld) * JointWorld * InvBind
      const jointCount = skin.joints.length;
      for (let j = 0; j < jointCount; j++) {
        const jointEntityId = skin.joints[j];
        if (jointEntityId === undefined) continue;

        const jointWorld = this.cache.getWorld3D(jointEntityId) ?? this._identityMat;
        const offset = j * 16;

        // Copy 16 floats of the inverse bind matrix into scratch
        for (let k = 0; k < 16; k++) {
          this._invBindMat[k] = skin.inverseBindMatrices[offset + k] ?? (k % 5 === 0 ? 1 : 0);
        }

        // temp = JointWorld * InvBind
        mat4.multiply(this._tempMat, jointWorld, this._invBindMat);

        // skinMat = inv(ModelWorld) * temp
        mat4.multiply(this._skinMat, this._invModelMat, this._tempMat);

        // Store into pre-allocated jointMatrices buffer
        for (let k = 0; k < 16; k++) {
          skin.jointMatrices[offset + k] = this._skinMat[k] ?? 0;
        }
      }

      // 4. Upload bone matrices to native core
      if (engine) {
        engine.realm3dUpdateBones(
          this.realmId,
          model.modelId,
          skin.jointMatrices,
          skin.jointMatrices.length
        );
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
