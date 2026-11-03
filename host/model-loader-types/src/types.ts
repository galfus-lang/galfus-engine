/**
 * Canonical contracts and types for 3D model loaders in the Galfus Engine ecosystem.
 *
 * This package provides format-agnostic interfaces for loading, instantiating,
 * and managing 3D assets (glTF, OBJ, FBX, USDZ, VOX, etc.) across the ECS and GPU.
 */

/**
 * Inspection descriptor of a single node inside a 3D asset graph.
 *
 * Used by import filters and custom node renamers to selectively include, exclude,
 * or tag entities during the loading process.
 *
 * @example
 * ```typescript
 * const filter = (node: ModelNodeDesc): boolean => {
 *   // Exclude editor cameras and helper empties
 *   if (node.name?.startsWith('Helper_')) return false;
 *   return true;
 * };
 * ```
 */
export interface ModelNodeDesc {
  /** The zero-based index of this node in the source model file. */
  readonly index: number;

  /** The raw human-readable identifier of this node from the authoring tool, if available. */
  readonly name?: string;

  /** Indicates whether this node has an associated geometry mesh to render. */
  readonly hasMesh: boolean;

  /** Indicates whether this node is linked to a skeletal deformation skin or bone hierarchy. */
  readonly hasSkin: boolean;

  /** Indicates whether this node carries a camera projection configuration. */
  readonly hasCamera: boolean;

  /** Indicates whether this node carries a light source (directional, point, or spot). */
  readonly hasLight: boolean;

  /** Custom metadata dictionary exported from the authoring tool (e.g. glTF 'extras'). */
  readonly extras?: Record<string, unknown>;
}

export interface ModelBounds {
  /** Minimum axis coordinates [minX, minY, minZ] in model space. */
  readonly min: [number, number, number];
  /** Maximum axis coordinates [maxX, maxY, maxZ] in model space. */
  readonly max: [number, number, number];
  /** Center point coordinates [(min + max) / 2] in model space. */
  readonly center: [number, number, number];
  /** Extents size [width, height, depth] along each coordinate axis. */
  readonly size: [number, number, number];
  /** Approximate bounding sphere radius from the center. */
  readonly radius: number;
}

/**
 * General configuration options controlling how a 3D model file is parsed and imported.
 *
 * @example
 * ```typescript
 * const options: ModelImportOptions = {
 *   importCameras: false, // Discard authoring cameras
 *   importLights: true,
 *   renameNode: (originalName) => originalName.replace('Mixamo_', ''),
 *   filter: (node) => !node.name?.includes('Lod2')
 * };
 * ```
 */
export interface ModelImportOptions {
  /**
   * Filter predicate, string name, or RegExp determining whether a node should be imported.
   * If a node is rejected, all its visual and hierarchical attachments are discarded.
   */
  filter?: ((node: ModelNodeDesc) => boolean) | string | RegExp;

  /**
   * Custom transformer to normalize entity names (e.g. stripping naming prefixes or suffixes).
   *
   * @param originalName The original node name from the source file.
   * @param node Description of the node being renamed.
   * @returns The normalized entity name to register in the ECS NameComponent.
   */
  renameNode?: (originalName: string, node: ModelNodeDesc) => string;

  /** Whether to import camera definitions present in the asset. Defaults to true. */
  importCameras?: boolean;

  /** Whether to import punctual light sources present in the asset. Defaults to true. */
  importLights?: boolean;

  /**
   * Optional custom decoder instances (e.g. Draco, Meshopt, Basis Universal).
   * If omitted, compliant loaders automatically detect and lazily initialize decoders.
   */
  decoders?: Record<string, unknown>;
}

/**
 * Spatial and hierarchical configuration for instantiating a model into the ECS.
 *
 * @example
 * ```typescript
 * const instance = factory.instantiate({
 *   transform: {
 *     position: [0, 1.5, 0],
 *     rotation: [0, 0, 0, 1],
 *     scale: [2, 2, 2]
 *   },
 *   parentEntity: characterEntityId
 * });
 * ```
 */
export interface ModelInstantiateOptions {
  /**
   * Initial spatial transform applied to the root entity of this instance.
   */
  transform?: {
    /** 3D world or parent-relative translation [x, y, z]. Defaults to [0, 0, 0]. */
    position?: [number, number, number];
    /** 3D rotation quaternion [x, y, z, w]. Defaults to identity [0, 0, 0, 1]. */
    rotation?: [number, number, number, number];
    /** 3D local scale [x, y, z]. Defaults to [1, 1, 1]. */
    scale?: [number, number, number];
  };

  /**
   * Optional parent entity in the Realm hierarchy to attach this instance's root entity to.
   * Uses `realm.hierarchy.attach(instance.rootEntityId, parentEntity)`.
   */
  parentEntity?: number;
}

/**
 * A live, spawned instance of a 3D model graph in the ECS.
 *
 * Holds references to all instantiated entities (models, meshes, bones, lights, cameras).
 * Allows isolated entity searches, animation playback control, and granular disposal
 * without affecting other instances sharing the same GPU assets.
 *
 * @example
 * ```typescript
 * const instance = factory.instantiate();
 * const hand = instance.getEntityByName('RightHand');
 * if (hand !== undefined) {
 *   realm.hierarchy.attach(swordEntity, hand);
 * }
 *
 * // Destroy this specific character without freeing shared textures or meshes
 * instance.dispose();
 * ```
 */
export interface ModelInstance {
  /** Unique sequential identifier for this instance. */
  readonly instanceId: number;

  /**
   * The top-level root entity ID created for this model graph.
   * Can be manipulated directly or attached to other scene hierarchies.
   */
  readonly rootEntityId: number;

  /**
   * Read-only collection of all ECS entity IDs belonging to this specific instance.
   */
  readonly entities: readonly number[];

  /**
   * Active multi-clip animation player bound to this instance, if animations were present.
   */
  readonly animationPlayer?: unknown;

  /**
   * Indicates whether this instance has already been disposed.
   */
  readonly isDisposed?: boolean;

  /**
   * Resolves an entity ID by its assigned name within this instance.
   *
   * @param name The entity name to look up.
   * @returns The entity ID, or undefined if not found.
   */
  getEntityByName(name: string): number | undefined;

  /**
   * Queries all entities within this instance matching a metadata key and optional value.
   *
   * @param key The metadata entry key.
   * @param value Optional expected value to match.
   * @returns Array of matching entity IDs.
   */
  getEntitiesByMetadata(key: string, value?: unknown): number[];

  /**
   * Destroys all ECS entities and components associated with this instance.
   *
   * Automatically stops bound animation players and detaches from parent hierarchies.
   * Shared GPU resources (geometries, materials, textures) in the factory remain alive.
   */
  dispose(): void;
}

/**
 * A specialized sub-factory responsible for instantiating a specific sub-tree or scene
 * while sharing the underlying GPU resources uploaded by the parent factory.
 *
 * Ideal for modular asset kits (e.g. modular dungeon packs, weapon sets, armor pieces).
 *
 * @example
 * ```typescript
 * const wallFactory = dungeonAsset.createSubFactory('Wall_Straight');
 * const wallA = wallFactory.instantiate({ transform: { position: [0, 0, 0] } });
 * const wallB = wallFactory.instantiate({ transform: { position: [2, 0, 0] } });
 * ```
 */
export interface SubModelAssetFactory {
  /** Descriptive identifier of this sub-factory (e.g. node name or scene name). */
  readonly name: string;

  /** Spawns a new independent instance of this specific sub-tree. */
  instantiate(options?: ModelInstantiateOptions): ModelInstance;

  /** Destroys all currently active instances created through this sub-factory. */
  disposeAllInstances(): void;
}

/**
 * Two-stage 3D model asset factory.
 *
 * Uploads all shared geometries, textures, and materials to the GPU once during asset loading.
 * Spawns multiple lightweight ECS instances on demand and provides sub-factory partitioning.
 *
 * @example
 * ```typescript
 * const factory = await loadGltfAsset(realm, data);
 *
 * // Spawn 100 soldiers sharing the same GPU mesh & textures
 * for (let i = 0; i < 100; i++) {
 *   factory.instantiate({ transform: { position: [i * 2, 0, 0] } });
 * }
 *
 * // Clear all soldier instances from the ECS
 * factory.disposeAllInstances();
 *
 * // Fully unload VRAM assets and purge the factory
 * factory.dispose();
 * ```
 */
export interface ModelAssetFactory {
  /** Human-readable asset name or source path. */
  readonly assetName: string;

  /** Read-only collection of all Realm geometry IDs created and managed by this factory. */
  readonly createdGeometryIds: readonly number[];

  /** Read-only collection of all Realm material IDs created and managed by this factory. */
  readonly createdMaterialIds: readonly number[];

  /** Read-only collection of all shared GPU texture IDs created and managed by this factory. */
  readonly createdTextureIds: readonly number[];

  /** Approximate spatial bounding box and radius of the model asset, if computable. */
  readonly bounds?: ModelBounds;

  /**
   * Spawns a new independent instance of the complete model graph in the ECS.
   *
   * @param options Optional spatial transform and parent hierarchy attachment.
   * @returns The newly spawned ModelInstance.
   */
  instantiate(options?: ModelInstantiateOptions): ModelInstance;

  /**
   * Creates a sub-factory focused on a specific node or sub-tree by name or index.
   *
   * @param nodeNameOrIndex The target node name or numerical index in the model.
   * @returns SubModelAssetFactory for modular instantiation.
   */
  createSubFactory(nodeNameOrIndex: string | number): SubModelAssetFactory;

  /**
   * Creates a sub-factory focused on an alternative scene by index.
   *
   * @param sceneIndex The zero-based scene index.
   * @returns SubModelAssetFactory for scene-scoped instantiation.
   */
  createSubFactoryByScene(sceneIndex: number): SubModelAssetFactory;

  /**
   * Destroys all active instances previously spawned by this factory.
   * Retains GPU geometries, materials, and textures for future instantiations.
   */
  disposeAllInstances(): void;

  /**
   * Terminal teardown: destroys all active instances and unloads all geometries,
   * materials, and textures from the Realm and GPU.
   */
  dispose(): void;
}
