/**
 * Two-stage glTF asset factory and modular sub-factory implementations.
 */

import type { Realm3D, TextureId } from '@galfus/engine';
import { createAnimationPlayer3D } from '@galfus/engine';
import type {
  ModelAssetFactory,
  ModelBounds,
  ModelImportOptions,
  ModelInstance,
  ModelInstantiateOptions,
  SubModelAssetFactory
} from '@galfus/model-loader-types';
import { compileAnimationClips, setupSkins } from './animation';
import { computeGltfBounds } from './bounds';
import { GltfInstance } from './instance';
import type { UploadedGltfResources } from './resources';
import { spawnSceneGraph } from './scene';
import type { GlTF } from './types';

export interface GltfAssetFactoryInit {
  assetName: string;
  realm: Realm3D;
  gltf: GlTF;
  buffers: Uint8Array[];
  resources: UploadedGltfResources;
  importOptions?: ModelImportOptions;
}

/**
 * Concrete SubModelAssetFactory spawning a specific sub-tree or scene
 * while sharing the GPU resources uploaded by the parent GltfAssetFactory.
 */
export class SubGltfAssetFactory implements SubModelAssetFactory {
  readonly name: string;
  private readonly _parent: GltfAssetFactory;
  private readonly _targetNodeIndices: number[];
  private readonly _activeInstances = new Set<GltfInstance>();

  constructor(name: string, parent: GltfAssetFactory, targetNodeIndices: number[]) {
    this.name = name;
    this._parent = parent;
    this._targetNodeIndices = [...targetNodeIndices];
  }

  /**
   * Spawns a new independent instance of this specific sub-tree.
   */
  instantiate(options?: ModelInstantiateOptions): ModelInstance {
    const instance = this._parent._instantiateInternal(options, this._targetNodeIndices);
    this._activeInstances.add(instance);
    return instance;
  }

  /**
   * Destroys all active instances spawned through this sub-factory.
   */
  disposeAllInstances(): void {
    const list = [...this._activeInstances];
    for (const inst of list) {
      inst.dispose();
      this._activeInstances.delete(inst);
    }
  }
}

/**
 * Primary glTF asset factory.
 *
 * Holds all shared GPU resources (geometries, materials, textures) in VRAM and
 * provides high-performance instantiation of ECS entities and sub-factories.
 *
 * @example
 * ```typescript
 * const factory = await loadGltfAsset(realm, data);
 * const character1 = factory.instantiate({ transform: { position: [0, 0, 0] } });
 * const character2 = factory.instantiate({ transform: { position: [5, 0, 0] } });
 *
 * // Full cleanup
 * factory.dispose();
 * ```
 */
export class GltfAssetFactory implements ModelAssetFactory {
  readonly assetName: string;
  readonly createdGeometryIds: readonly number[];
  readonly createdMaterialIds: readonly number[];
  readonly createdTextureIds: readonly number[];
  readonly animationNames: readonly string[];
  readonly bounds?: ModelBounds;

  private readonly _realm: Realm3D;
  private readonly _gltf: GlTF;
  private readonly _buffers: Uint8Array[];
  private readonly _resources: UploadedGltfResources;
  private readonly _importOptions?: ModelImportOptions;
  private readonly _activeInstances = new Set<GltfInstance>();
  private _nextInstanceId = 1;
  private _isDisposed = false;

  constructor(init: GltfAssetFactoryInit) {
    this.assetName = init.assetName;
    this._realm = init.realm;
    this._gltf = init.gltf;
    this._buffers = init.buffers;
    this._resources = init.resources;
    this._importOptions = init.importOptions;

    this.createdGeometryIds = Object.freeze([...init.resources.createdGeometryIds]);
    this.createdMaterialIds = Object.freeze([...init.resources.createdMaterialIds]);
    this.createdTextureIds = Object.freeze([...init.resources.createdTextureIds]);
    this.animationNames = Object.freeze(
      (init.gltf.animations ?? []).map((a, i) => a.name ?? `Animation_${i}`)
    );
    this.bounds = computeGltfBounds(init.gltf);
  }

  /** Indicates whether this factory and its GPU resources have been destroyed. */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Spawns a new independent instance of the complete model graph in the ECS.
   */
  instantiate(options?: ModelInstantiateOptions): ModelInstance {
    return this._instantiateInternal(options);
  }

  /**
   * Internal instantiation driver supporting scoped root node filtering for sub-factories.
   * @internal
   */
  _instantiateInternal(
    options?: ModelInstantiateOptions,
    rootNodeIndices?: number[]
  ): GltfInstance {
    if (this._isDisposed) {
      throw new Error(`Cannot instantiate from disposed GltfAssetFactory '${this.assetName}'`);
    }

    const instanceId = this._nextInstanceId++;

    // 1. Spawn Scene Graph entities in the ECS
    const sceneResult = spawnSceneGraph(
      this._realm,
      this._gltf,
      this._buffers,
      this._resources,
      options,
      this._importOptions,
      rootNodeIndices
    );

    // 2. Bind Skeletal Skins if present
    setupSkins(this._realm, this._gltf, this._buffers, sceneResult);

    // 3. Compile Animation Clips and bind AnimationPlayer3D
    const clips = compileAnimationClips(
      this._gltf,
      this._buffers,
      sceneResult.nodeEntityMap,
      sceneResult.primitiveEntities
    );
    let animationPlayer: ReturnType<typeof createAnimationPlayer3D> | undefined;

    if (clips.length > 0) {
      animationPlayer = createAnimationPlayer3D();
      for (const clip of clips) {
        animationPlayer.addClip(clip);
      }
      this._realm.world.attachComponent(sceneResult.rootEntityId, animationPlayer);
    }

    // 4. Construct GltfInstance wrapper
    const instance = new GltfInstance({
      instanceId,
      realm: this._realm,
      rootEntityId: sceneResult.rootEntityId,
      entities: sceneResult.entities,
      instancedModelIds: sceneResult.instancedModelIds,
      animationPlayer,
      onDispose: (inst) => {
        this._activeInstances.delete(inst);
      }
    });

    this._activeInstances.add(instance);
    return instance;
  }

  /**
   * Creates a sub-factory focused on a specific node or sub-tree by name or numerical index.
   *
   * @param nodeNameOrIndex The target node name or index.
   * @returns SubModelAssetFactory for modular instantiation.
   */
  createSubFactory(nodeNameOrIndex: string | number): SubModelAssetFactory {
    if (this._isDisposed) {
      throw new Error(
        `Cannot create sub-factory from disposed GltfAssetFactory '${this.assetName}'`
      );
    }

    let nodeIdx: number | undefined;
    if (typeof nodeNameOrIndex === 'number') {
      nodeIdx = nodeNameOrIndex;
    } else {
      const nodes = this._gltf.nodes ?? [];
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i]!.name === nodeNameOrIndex) {
          nodeIdx = i;
          break;
        }
      }
    }

    if (nodeIdx === undefined || !this._gltf.nodes?.[nodeIdx]) {
      throw new Error(`Node '${nodeNameOrIndex}' not found in glTF asset '${this.assetName}'`);
    }

    const subName = `${this.assetName}::${this._gltf.nodes[nodeIdx]!.name ?? `Node_${nodeIdx}`}`;
    return new SubGltfAssetFactory(subName, this, [nodeIdx]);
  }

  /**
   * Creates a sub-factory focused on an alternative scene by index.
   *
   * @param sceneIndex The zero-based scene index.
   * @returns SubModelAssetFactory for scene-scoped instantiation.
   */
  createSubFactoryByScene(sceneIndex: number): SubModelAssetFactory {
    if (this._isDisposed) {
      throw new Error(
        `Cannot create sub-factory from disposed GltfAssetFactory '${this.assetName}'`
      );
    }

    const scene = this._gltf.scenes?.[sceneIndex];
    if (!scene) {
      throw new Error(`Scene index ${sceneIndex} out of bounds in glTF asset '${this.assetName}'`);
    }

    const subName = `${this.assetName}::${scene.name ?? `Scene_${sceneIndex}`}`;
    return new SubGltfAssetFactory(subName, this, scene.nodes ?? []);
  }

  /**
   * Destroys all currently active instances spawned by this factory.
   */
  disposeAllInstances(): void {
    const list = [...this._activeInstances];
    for (const inst of list) {
      inst.dispose();
    }
    this._activeInstances.clear();
  }

  /**
   * Terminal teardown: destroys all instances and frees all geometries, materials,
   * and textures from the Realm and GPU.
   */
  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    // 1. Destroy all spawned instances
    this.disposeAllInstances();

    // 2. Free shared Realm Geometries
    for (const geoId of this.createdGeometryIds) {
      try {
        this._realm.destroyGeometry(geoId);
      } catch {
        // Ignored during shutdown
      }
    }

    // 3. Free shared Realm Materials
    for (const matId of this.createdMaterialIds) {
      try {
        this._realm.destroyMaterial(matId);
      } catch {
        // Ignored during shutdown
      }
    }

    // 4. Free shared GPU Textures
    for (const texId of this.createdTextureIds) {
      try {
        this._realm.resources.disposeTexture(texId as unknown as TextureId);
      } catch {
        // Ignored during shutdown
      }
    }
  }
}
