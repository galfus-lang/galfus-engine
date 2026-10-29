/**
 * Pose extraction, blending, and crossfading routines.
 */
import type { EntityId } from '../ecs/entity';
import { common, quat, vec3, type Quat, type Vec3 } from '../math/index';
import { sampleTrack, type AnimationClip } from './clip';

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

// Scratch buffers for evaluation without GC overhead
const SCRATCH_VEC3 = new Float32Array(3);
const SCRATCH_VEC4 = new Float32Array(4);

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
        const weightCount = Math.floor(track.values.length / Math.max(1, track.timestamps.length));
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

  // 1. Blend Translations
  const transEntities = new Set([...poseA.translations.keys(), ...poseB.translations.keys()]);
  for (const id of transEntities) {
    const a = poseA.translations.get(id);
    const b = poseB.translations.get(id);
    if (a && b) {
      const blended = vec3.create();
      vec3.lerp(blended, a, b, t);
      out.translations.set(id, [blended[0], blended[1], blended[2]]);
    } else if (a) {
      out.translations.set(id, [a[0], a[1], a[2]]);
    } else if (b) {
      out.translations.set(id, [b[0], b[1], b[2]]);
    }
  }

  // 2. Blend Rotations (Quaternion SLERP)
  const rotEntities = new Set([...poseA.rotations.keys(), ...poseB.rotations.keys()]);
  for (const id of rotEntities) {
    const a = poseA.rotations.get(id);
    const b = poseB.rotations.get(id);
    if (a && b) {
      const blended = quat.create();
      quat.slerp(blended, a, b, t);
      out.rotations.set(id, [blended[0], blended[1], blended[2], blended[3]]);
    } else if (a) {
      out.rotations.set(id, [a[0], a[1], a[2], a[3]]);
    } else if (b) {
      out.rotations.set(id, [b[0], b[1], b[2], b[3]]);
    }
  }

  // 3. Blend Scales
  const scaleEntities = new Set([...poseA.scales.keys(), ...poseB.scales.keys()]);
  for (const id of scaleEntities) {
    const a = poseA.scales.get(id);
    const b = poseB.scales.get(id);
    if (a && b) {
      const blended = vec3.create();
      vec3.lerp(blended, a, b, t);
      out.scales.set(id, [blended[0], blended[1], blended[2]]);
    } else if (a) {
      out.scales.set(id, [a[0], a[1], a[2]]);
    } else if (b) {
      out.scales.set(id, [b[0], b[1], b[2]]);
    }
  }

  // 4. Blend Weights
  const weightEntities = new Set([...poseA.weights.keys(), ...poseB.weights.keys()]);
  for (const id of weightEntities) {
    const a = poseA.weights.get(id);
    const b = poseB.weights.get(id);
    if (a && b && a.length === b.length) {
      const blended = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) {
        blended[i] = common.lerp(a[i]!, b[i]!, t);
      }
      out.weights.set(id, blended);
    } else if (a) {
      out.weights.set(id, new Float32Array(a));
    } else if (b) {
      out.weights.set(id, new Float32Array(b));
    }
  }
}
