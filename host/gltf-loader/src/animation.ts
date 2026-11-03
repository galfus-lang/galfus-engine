/**
 * Skeletal skin binding and animation clip compilation for glTF assets.
 */

import type { AnimationClip, InterpolationMode, KeyframeTrack, Realm3D } from '@galfus/engine';
import { readAccessor } from './parser';
import type { SpawnedSceneResult } from './scene';
import type { GlTF } from './types';

/**
 * Creates and registers Skin3D components for all skinned models in a spawned scene.
 *
 * @param realm The target Realm3D.
 * @param gltf The root glTF descriptor.
 * @param buffers Array of resolved binary buffers.
 * @param sceneResult Result of the scene spawning phase.
 *
 * @example
 * ```typescript
 * setupSkins(realm, gltf, buffers, sceneResult);
 * ```
 */
export function setupSkins(
  realm: Realm3D,
  gltf: GlTF,
  buffers: Uint8Array[],
  sceneResult: SpawnedSceneResult
): void {
  if (!gltf.nodes || !gltf.skins) return;

  for (let nIdx = 0; nIdx < gltf.nodes.length; nIdx++) {
    const node = gltf.nodes[nIdx]!;
    if (node.skin === undefined || node.mesh === undefined) continue;

    const modelEntityId = sceneResult.nodeEntityMap.get(nIdx);
    if (modelEntityId === undefined) continue;

    const skin = gltf.skins[node.skin];
    if (!skin) continue;

    // Resolve joint entity IDs
    const joints: number[] = [];
    for (const jointNodeIdx of skin.joints) {
      const jointEntityId = sceneResult.nodeEntityMap.get(jointNodeIdx);
      if (jointEntityId !== undefined) {
        joints.push(jointEntityId);
      } else {
        throw new Error(`Skin ${node.skin} references missing joint node ${jointNodeIdx}`);
      }
    }

    if (joints.length === 0) continue;

    // Extract inverse bind matrices (16 floats per joint)
    let inverseBindMatrices: Float32Array;
    if (skin.inverseBindMatrices !== undefined) {
      inverseBindMatrices = readAccessor(gltf, buffers, skin.inverseBindMatrices) as Float32Array;
    } else {
      // Fallback: 16-float identity matrices
      inverseBindMatrices = new Float32Array(joints.length * 16);
      for (let j = 0; j < joints.length; j++) {
        const offset = j * 16;
        inverseBindMatrices[offset + 0] = 1;
        inverseBindMatrices[offset + 5] = 1;
        inverseBindMatrices[offset + 10] = 1;
        inverseBindMatrices[offset + 15] = 1;
      }
    }

    for (const entityId of sceneResult.primitiveEntities.get(nIdx) ?? [modelEntityId]) {
      const { entityId: skinEntityId } = realm.createSkin(entityId, joints, inverseBindMatrices);
      sceneResult.entities.push(skinEntityId);
    }
  }
}

/**
 * Compiles raw glTF animation channels and samplers into native Galfus AnimationClips.
 *
 * @param gltf The root glTF descriptor.
 * @param buffers Array of resolved binary buffers.
 * @param nodeEntityMap Mapping from glTF node indices to instantiated ECS entity IDs.
 * @returns Array of compiled, ready-to-play AnimationClips.
 *
 * @example
 * ```typescript
 * const clips = compileAnimationClips(gltf, buffers, sceneResult.nodeEntityMap);
 * console.log(`Compiled ${clips.length} animation clips`);
 * ```
 */
export function compileAnimationClips(
  gltf: GlTF,
  buffers: Uint8Array[],
  nodeEntityMap: Map<number, number>,
  primitiveEntities?: Map<number, number[]>
): AnimationClip[] {
  if (!gltf.animations || gltf.animations.length === 0) {
    return [];
  }

  const clips: AnimationClip[] = [];

  for (let aIdx = 0; aIdx < gltf.animations.length; aIdx++) {
    const anim = gltf.animations[aIdx]!;
    const tracks: KeyframeTrack[] = [];
    let maxDuration = 0;

    for (let cIdx = 0; cIdx < anim.channels.length; cIdx++) {
      const channel = anim.channels[cIdx]!;
      const targetNodeIdx = channel.target.node;
      if (targetNodeIdx === undefined) continue;

      const targetEntityId = nodeEntityMap.get(targetNodeIdx);
      if (targetEntityId === undefined) continue;

      const sampler = anim.samplers[channel.sampler];
      if (!sampler) continue;

      const timestamps = readAccessor(gltf, buffers, sampler.input) as Float32Array;
      const values = readAccessor(gltf, buffers, sampler.output) as Float32Array;

      if (timestamps.length > 0) {
        const lastTime = timestamps[timestamps.length - 1] ?? 0;
        if (lastTime > maxDuration) {
          maxDuration = lastTime;
        }
      }

      const interpolation: InterpolationMode =
        sampler.interpolation === 'STEP'
          ? 'step'
          : sampler.interpolation === 'CUBICSPLINE'
            ? 'cubicspline'
            : 'linear';

      const targets =
        channel.target.path === 'weights'
          ? (primitiveEntities?.get(targetNodeIdx) ?? [targetEntityId])
          : [targetEntityId];
      for (const targetEntity of targets)
        tracks.push({
          targetEntity,
          path: channel.target.path,
          timestamps,
          values,
          interpolation
        });
    }

    if (tracks.length > 0) {
      clips.push({
        name: anim.name ?? `Animation_${aIdx}`,
        duration: maxDuration,
        tracks
      });
    }
  }

  return clips;
}
