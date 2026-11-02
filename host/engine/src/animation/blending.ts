/**
 * Pose extraction, blending, and crossfading routines.
 */

import type { EntityId } from '../ecs/entity';
import { common, quat, vec3 } from '../math/index';
import { type AnimationClip, sampleTrack } from './clip';

export interface AnimationPose {
  translations: Map<EntityId, [number, number, number]>;
  rotations: Map<EntityId, [number, number, number, number]>;
  scales: Map<EntityId, [number, number, number]>;
  weights: Map<EntityId, Float32Array>;
}

export function createAnimationPose(): AnimationPose {
  return {
    translations: new Map(),
    rotations: new Map(),
    scales: new Map(),
    weights: new Map()
  };
}

export function clearAnimationPose(pose: AnimationPose): void {
  pose.translations.clear();
  pose.rotations.clear();
  pose.scales.clear();
  pose.weights.clear();
}

export function copyAnimationPose(from: AnimationPose, to: AnimationPose): void {
  clearAnimationPose(to);
  for (const [id, val] of from.translations) to.translations.set(id, [val[0], val[1], val[2]]);
  for (const [id, val] of from.rotations) to.rotations.set(id, [val[0], val[1], val[2], val[3]]);
  for (const [id, val] of from.scales) to.scales.set(id, [val[0], val[1], val[2]]);
  for (const [id, val] of from.weights) to.weights.set(id, new Float32Array(val));
}

// Reusable sampling and interpolation buffers; pose entries own their values.
const SCRATCH_VEC3 = new Float32Array(3);
const SCRATCH_VEC4 = new Float32Array(4);
const SCRATCH_BLEND_VEC3 = vec3.create();
const SCRATCH_BLEND_QUAT = quat.create();

function blendVectors(
  out: Map<EntityId, [number, number, number]>,
  poseA: Map<EntityId, [number, number, number]>,
  poseB: Map<EntityId, [number, number, number]>,
  t: number
): void {
  for (const [id, a] of poseA) {
    const b = poseB.get(id);
    if (b) {
      vec3.lerp(SCRATCH_BLEND_VEC3, a, b, t);
      out.set(id, [SCRATCH_BLEND_VEC3[0], SCRATCH_BLEND_VEC3[1], SCRATCH_BLEND_VEC3[2]]);
    } else out.set(id, [a[0], a[1], a[2]]);
  }
  for (const [id, b] of poseB) if (!poseA.has(id)) out.set(id, [b[0], b[1], b[2]]);
}

/**
 * Evaluates an AnimationClip at a specific timestamp and writes the resulting pose into `outPose`.
 */
export function evaluateClip(clip: AnimationClip, time: number, outPose: AnimationPose): void {
  for (const track of clip.tracks) {
    const id = track.targetEntity;

    switch (track.path) {
      case 'translation':
        sampleTrack(track, time, SCRATCH_VEC3);
        outPose.translations.set(id, [SCRATCH_VEC3[0]!, SCRATCH_VEC3[1]!, SCRATCH_VEC3[2]!]);
        break;

      case 'rotation':
        sampleTrack(track, time, SCRATCH_VEC4);
        outPose.rotations.set(id, [
          SCRATCH_VEC4[0]!,
          SCRATCH_VEC4[1]!,
          SCRATCH_VEC4[2]!,
          SCRATCH_VEC4[3]!
        ]);
        break;

      case 'scale':
        sampleTrack(track, time, SCRATCH_VEC3);
        outPose.scales.set(id, [SCRATCH_VEC3[0]!, SCRATCH_VEC3[1]!, SCRATCH_VEC3[2]!]);
        break;

      case 'weights': {
        const records = track.timestamps.length * (track.interpolation === 'cubicspline' ? 3 : 1);
        const weightCount = Math.floor(track.values.length / Math.max(1, records));
        let weightsBuf = outPose.weights.get(id);
        if (!weightsBuf || weightsBuf.length !== weightCount) {
          weightsBuf = new Float32Array(weightCount);
          outPose.weights.set(id, weightsBuf);
        }
        sampleTrack(track, time, weightsBuf);
        break;
      }
    }
  }
}

/**
 * Linearly and spherically blends two poses according to weight alpha (0.0 = poseA, 1.0 = poseB).
 */
export function blendPoses(
  out: AnimationPose,
  poseA: AnimationPose,
  poseB: AnimationPose,
  alpha: number
): void {
  const t = common.clamp(alpha, 0, 1);

  if (t === 0) {
    copyAnimationPose(poseA, out);
    return;
  }
  if (t === 1) {
    copyAnimationPose(poseB, out);
    return;
  }

  clearAnimationPose(out);

  blendVectors(out.translations, poseA.translations, poseB.translations, t);

  // Blend rotations with quaternion SLERP.
  for (const [id, a] of poseA.rotations) {
    const b = poseB.rotations.get(id);
    if (b) {
      quat.slerp(SCRATCH_BLEND_QUAT, a, b, t);
      out.rotations.set(id, [
        SCRATCH_BLEND_QUAT[0],
        SCRATCH_BLEND_QUAT[1],
        SCRATCH_BLEND_QUAT[2],
        SCRATCH_BLEND_QUAT[3]
      ]);
    } else out.rotations.set(id, [a[0], a[1], a[2], a[3]]);
  }
  for (const [id, b] of poseB.rotations)
    if (!poseA.rotations.has(id)) out.rotations.set(id, [b[0], b[1], b[2], b[3]]);

  // Blend scales.
  blendVectors(out.scales, poseA.scales, poseB.scales, t);

  // Blend weights.
  for (const [id, a] of poseA.weights) {
    const b = poseB.weights.get(id);
    if (b && a.length === b.length) {
      const blended = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) {
        blended[i] = common.lerp(a[i]!, b[i]!, t);
      }
      out.weights.set(id, blended);
    } else {
      out.weights.set(id, new Float32Array(a));
    }
  }
  for (const [id, b] of poseB.weights)
    if (!poseA.weights.has(id)) out.weights.set(id, new Float32Array(b));
}
