/**
 * Scene graph construction, ECS entity spawning, hierarchy resolution, and GPU instancing.
 */

import type { Model3DComponent, Realm3D } from '@galfus/engine';
import { mat4, quat, vec3 } from '@galfus/engine';
import type {
  ModelImportOptions,
  ModelInstantiateOptions,
  ModelNodeDesc
} from '@galfus/model-loader-types';
import { readAccessor } from './parser';
import type { UploadedGltfResources } from './resources';
import type { GlTF, GlTFNode } from './types';

export interface SpawnedSceneResult {
  rootEntityId: number;
  entities: number[];
  nodeEntityMap: Map<number, number>; // gltfNodeIndex -> ecsEntityId
  primitiveEntities: Map<number, number[]>;
  instancedModelIds: number[];
}

/**
 * Checks whether a glTF node passes the user-provided import filter.
 */
function shouldImportNode(nodeDesc: ModelNodeDesc, options?: ModelImportOptions): boolean {
  if (!options?.filter) return true;
  if (typeof options.filter === 'function') {
    return options.filter(nodeDesc);
  }
  if (typeof options.filter === 'string') {
    return nodeDesc.name === options.filter;
  }
  if (options.filter instanceof RegExp) {
    return options.filter.test(nodeDesc.name ?? '');
  }
  return true;
}

/**
 * Spawns a complete glTF scene graph or sub-tree into the ECS and GPU.
 *
 * @param realm The target Realm3D.
 * @param gltf The root glTF descriptor.
 * @param buffers Array of resolved binary buffers.
 * @param resources Pre-uploaded GPU geometries, materials, and textures.
 * @param instantiateOptions Spatial offsets and optional parent hierarchy attachment.
 * @param importOptions Filtering rules, node renamers, and camera/light toggles.
 * @param rootNodeIndices Optional specific node indices to instantiate (for sub-factories).
 * @returns Object holding the root entity, entity collections, and node mappings.
 *
 * @example
 * ```typescript
 * const result = spawnSceneGraph(realm, gltf, buffers, resources, options);
 * console.log(`Spawned ${result.entities.length} entities in ECS`);
 * ```
 */
export function spawnSceneGraph(
  realm: Realm3D,
  gltf: GlTF,
  buffers: Uint8Array[],
  resources: UploadedGltfResources,
  instantiateOptions?: ModelInstantiateOptions,
  importOptions?: ModelImportOptions,
  rootNodeIndices?: number[]
): SpawnedSceneResult {
  const nodeCount = gltf.nodes?.length ?? 0;
  const nodeEntityMap = new Map<number, number>();
  const entities: number[] = [];
  const instancedModelIds: number[] = [];
  const primitiveEntities = new Map<number, number[]>();

  // Determine root nodes: either user-specified or from active glTF scene
  let candidateRoots: number[] = [];
  if (rootNodeIndices && rootNodeIndices.length > 0) {
    candidateRoots = rootNodeIndices;
  } else {
    const activeSceneIdx = gltf.scene ?? 0;
    const activeScene = gltf.scenes?.[activeSceneIdx];
    candidateRoots = activeScene?.nodes ?? (nodeCount > 0 ? [0] : []);
  }

  // 1. Create a root container entity for this instance
  const rootEntityId = realm.createSpatialNode({
    position: instantiateOptions?.transform?.position ?? [0, 0, 0],
    rotation: instantiateOptions?.transform?.rotation ?? [0, 0, 0, 1],
    scale: instantiateOptions?.transform?.scale ?? [1, 1, 1]
  });
  entities.push(rootEntityId);
  realm.setEntityName(rootEntityId, 'GltfInstance_Root');

  if (instantiateOptions?.parentEntity !== undefined) {
    realm.hierarchy.attach(rootEntityId, instantiateOptions.parentEntity);
  }

  // Fallback default material if a primitive omits material definition
  let defaultMaterialId: number | undefined;
  function getDefaultMaterial(): number {
    if (defaultMaterialId === undefined) {
      defaultMaterialId = realm.createMaterial({ baseColor: [1, 1, 1, 1] }).materialId;
    }
    return defaultMaterialId;
  }

  // Helper to extract TRS from glTF node
  function getNodeTRS(node: GlTFNode): {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
  } {
    if (node.matrix) {
      // Decompose 4x4 column-major matrix
      const m = node.matrix;
      const pos: [number, number, number] = [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
      const scl: [number, number, number] = [
        Math.hypot(m[0] ?? 1, m[1] ?? 0, m[2] ?? 0),
        Math.hypot(m[4] ?? 0, m[5] ?? 1, m[6] ?? 0),
        Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 1)
      ];
      // Orientation from rotation matrix
      const rot: [number, number, number, number] = [0, 0, 0, 1];
      quat.fromMat4(rot as any, m as any);
      return { position: pos, rotation: rot, scale: scl };
    }

    return {
      position: node.translation ?? [0, 0, 0],
      rotation: node.rotation ?? [0, 0, 0, 1],
      scale: node.scale ?? [1, 1, 1]
    };
  }

  // 2. Instantiate Nodes as ECS entities (or GPU Instanced Models)
  for (let nIdx = 0; nIdx < nodeCount; nIdx++) {
    const node = gltf.nodes![nIdx]!;
    const nodeDesc: ModelNodeDesc = {
      index: nIdx,
      name: node.name,
      hasMesh: node.mesh !== undefined,
      hasSkin: node.skin !== undefined,
      hasCamera: node.camera !== undefined,
      hasLight: node.extensions?.['KHR_lights_punctual'] !== undefined,
      extras:
        typeof node.extras === 'object' && node.extras !== null
          ? (node.extras as Record<string, unknown>)
          : undefined
    };

    if (!shouldImportNode(nodeDesc, importOptions)) {
      continue;
    }

    const normalizedName = importOptions?.renameNode
      ? importOptions.renameNode(node.name ?? `Node_${nIdx}`, nodeDesc)
      : (node.name ?? `Node_${nIdx}`);

    // A) Check for Hardware GPU Instancing (EXT_mesh_gpu_instancing)
    const gpuInstancingExt = node.extensions?.EXT_mesh_gpu_instancing;
    if (gpuInstancingExt && node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      if (mesh) {
        const transAcc = gpuInstancingExt.attributes['TRANSLATION'];
        const rotAcc = gpuInstancingExt.attributes['ROTATION'];
        const scaleAcc = gpuInstancingExt.attributes['SCALE'];

        const translations =
          transAcc !== undefined
            ? (readAccessor(gltf, buffers, transAcc) as Float32Array)
            : undefined;
        const rotations =
          rotAcc !== undefined ? (readAccessor(gltf, buffers, rotAcc) as Float32Array) : undefined;
        const scales =
          scaleAcc !== undefined
            ? (readAccessor(gltf, buffers, scaleAcc) as Float32Array)
            : undefined;

        const count = translations
          ? translations.length / 3
          : rotations
            ? rotations.length / 4
            : scales
              ? scales.length / 3
              : 0;
        // 32 floats per instance record required by Galfus Core
        const instanceData = new Float32Array(count * 32);

        const tempMat = mat4.create();
        const tempPos = vec3.create();
        const tempRot = quat.create();
        const tempScale = vec3.create();

        for (let i = 0; i < count; i++) {
          tempPos[0] = translations ? translations[i * 3 + 0]! : 0;
          tempPos[1] = translations ? translations[i * 3 + 1]! : 0;
          tempPos[2] = translations ? translations[i * 3 + 2]! : 0;

          if (rotations) {
            tempRot[0] = rotations[i * 4 + 0]!;
            tempRot[1] = rotations[i * 4 + 1]!;
            tempRot[2] = rotations[i * 4 + 2]!;
            tempRot[3] = rotations[i * 4 + 3]!;
          } else {
            quat.identity(tempRot);
          }

          if (scales) {
            tempScale[0] = scales[i * 3 + 0]!;
            tempScale[1] = scales[i * 3 + 1]!;
            tempScale[2] = scales[i * 3 + 2]!;
          } else {
            vec3.set(tempScale, 1, 1, 1);
          }

          mat4.fromRotationTranslationScale(tempMat, tempRot, tempPos, tempScale);

          const offset = i * 32;
          for (let m = 0; m < 16; m++) {
            instanceData[offset + m] = tempMat[m]!;
          }
          // Color (default white)
          instanceData[offset + 16] = 1;
          instanceData[offset + 17] = 1;
          instanceData[offset + 18] = 1;
          instanceData[offset + 19] = 1;
          // Emissive (default black)
          instanceData[offset + 20] = 0;
          instanceData[offset + 21] = 0;
          instanceData[offset + 22] = 0;
          instanceData[offset + 23] = 0;
          // PBR params (metallic, roughness, etc.)
          instanceData[offset + 24] = 1;
          instanceData[offset + 25] = 1;
          instanceData[offset + 26] = 0;
          instanceData[offset + 27] = 0;
        }

        for (let primIdx = 0; primIdx < mesh.primitives.length; primIdx++) {
          const prim = mesh.primitives[primIdx]!;
          const key = `${node.mesh}_${primIdx}`;
          const geometryId = resources.geometryMap.get(key);
          const materialId =
            (prim.material !== undefined ? resources.materialMap.get(prim.material) : undefined) ??
            getDefaultMaterial();

          if (geometryId !== undefined) {
            const instancedEntityId = realm.createInstancedModel({
              geometryId,
              materialId
            });
            realm.setInstancedModelData(instancedEntityId, instanceData);
            instancedModelIds.push(instancedEntityId);
          }
        }
      }
      continue;
    }

    // B) Standard ECS Model Entity
    const trs = getNodeTRS(node);
    const entityId = realm.createSpatialNode(trs);
    entities.push(entityId);
    nodeEntityMap.set(nIdx, entityId);

    realm.setEntityName(entityId, normalizedName);

    // Attach metadata extras if present
    if (nodeDesc.extras) {
      for (const [k, v] of Object.entries(nodeDesc.extras)) {
        realm.setMetadataKV(entityId, k, v);
      }
    }

    // Attach Renderable Mesh if present
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      if (mesh) {
        for (let primIdx = 0; primIdx < mesh.primitives.length; primIdx++) {
          const prim = mesh.primitives[primIdx]!;
          const key = `${node.mesh}_${primIdx}`;
          const geometryId = resources.geometryMap.get(key);
          const materialId =
            (prim.material !== undefined ? resources.materialMap.get(prim.material) : undefined) ??
            getDefaultMaterial();

          if (geometryId !== undefined) {
            let primitiveEntityId = entityId;
            if (primIdx === 0) {
              realm.createMesh(entityId, {
                geometryId,
                materialId
              });
            } else {
              // Sub-primitive: spawn a child spatial node attached to the primary entity
              const subEntityId = realm.createSpatialNode();
              primitiveEntityId = subEntityId;
              realm.setEntityName(subEntityId, `${normalizedName}_prim${primIdx}`);
              realm.createMesh(subEntityId, {
                geometryId,
                materialId
              });
              realm.hierarchy.attach(subEntityId, entityId);
              entities.push(subEntityId);
            }
            const mapped = primitiveEntities.get(nIdx) ?? [];
            mapped.push(primitiveEntityId);
            primitiveEntities.set(nIdx, mapped);
            if (prim.targets?.length) {
              const weights =
                node.weights ?? mesh.weights ?? new Array(prim.targets.length).fill(0);
              const model = realm.world.getComponent<Model3DComponent>(
                primitiveEntityId,
                'Model3D'
              );
              if (model) realm.setModelMorphWeights(model.modelId, new Float32Array(weights));
            }
          }
        }
      }
    }
  }

  // 3. Connect Hierarchy Relationships via Anchor HierarchyCoordinator
  for (let nIdx = 0; nIdx < nodeCount; nIdx++) {
    const parentEntityId = nodeEntityMap.get(nIdx);
    if (parentEntityId === undefined) continue;

    const node = gltf.nodes![nIdx]!;
    if (node.children) {
      for (const childIdx of node.children) {
        const childEntityId = nodeEntityMap.get(childIdx);
        if (childEntityId !== undefined) {
          realm.hierarchy.attach(childEntityId, parentEntityId);
        }
      }
    }
  }

  // 4. Attach Candidate Roots to Instance Root Container
  for (const rootIdx of candidateRoots) {
    const rootChildEntityId = nodeEntityMap.get(rootIdx);
    if (rootChildEntityId !== undefined) {
      realm.hierarchy.attach(rootChildEntityId, rootEntityId);
    }
  }

  return {
    rootEntityId,
    entities,
    nodeEntityMap,
    primitiveEntities,
    instancedModelIds
  };
}
