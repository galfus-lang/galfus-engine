/**
 * Animation track and clip structures supporting keyframe sampling for glTF animations.
 */
import type { EntityId } from '../ecs/entity';
import { common, quat, vec3, type Quat, type Vec3 } from '../math/index';

export type InterpolationMode = 'step' | 'linear' | 'cubicspline';
export type AnimationPath = 'translation' | 'rotation' | 'scale' | 'weights';

export interface KeyframeTrack {
  targetEntity: EntityId;
  path: AnimationPath;
  /** Monotonically increasing keyframe timestamps in seconds */
  timestamps: Float32Array;
  /** Flattened keyframe values: 3 floats per key for pos/scale, 4 for quat, N for weights */
  values: Float32Array;
  interpolation: InterpolationMode;
}

export interface AnimationClip {
  name: string;
  duration: number;
  tracks: KeyframeTrack[];
}

/**
 * Samples an individual keyframe track at a given time and outputs interpolated values into `out`.
 */
export function sampleTrack(track: KeyframeTrack, time: number, out: Float32Array): void {
  const times = track.timestamps;
  const values = track.values;
  const count = times.length;
  if (count === 0) return;

  const isCubic = track.interpolation === 'cubicspline';
  const stride = track.path === 'rotation' ? 4 : track.path === 'weights' ? out.length : 3;

  // In glTF cubic spline, each keyframe stores 3 values: [in-tangent, value, out-tangent]
  const recordSize = isCubic ? stride * 3 : stride;

  // Edge case 1: Before or at first keyframe
  if (time <= times[0]!) {
    const valOffset = isCubic ? stride : 0;
    for (let i = 0; i < stride; i++) {
      out[i] = values[valOffset + i] ?? 0;
    }
    return;
  }

  // Edge case 2: After or at last keyframe
  if (time >= times[count - 1]!) {
    const valOffset = (count - 1) * recordSize + (isCubic ? stride : 0);
    for (let i = 0; i < stride; i++) {
      out[i] = values[valOffset + i] ?? 0;
    }
    return;
  }

  // Binary search for keyframe interval [k, k + 1] such that times[k] <= time < times[k + 1]
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (times[mid]! <= time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const k = Math.max(0, low - 1);
  const t0 = times[k]!;
  const t1 = times[k + 1]!;
  const deltaT = t1 - t0;
  const factor = deltaT > 0 ? common.clamp((time - t0) / deltaT, 0, 1) : 0;

  // 1. STEP interpolation
  if (track.interpolation === 'step') {
    const valOffset = k * recordSize + (isCubic ? stride : 0);
    for (let i = 0; i < stride; i++) {
      out[i] = values[valOffset + i] ?? 0;
    }
    return;
  }

  // 2. LINEAR interpolation
  if (track.interpolation === 'linear') {
    const offset0 = k * recordSize;
    const offset1 = (k + 1) * recordSize;

    if (track.path === 'rotation') {
      const q0 = values.subarray(offset0, offset0 + 4) as unknown as Quat;
      const q1 = values.subarray(offset1, offset1 + 4) as unknown as Quat;
      quat.slerp(out as unknown as Quat, q0, q1, factor);
    } else {
      for (let i = 0; i < stride; i++) {
        const v0 = values[offset0 + i] ?? 0;
        const v1 = values[offset1 + i] ?? 0;
        out[i] = common.lerp(v0, v1, factor);
      }
    }
    return;
  }

  // 3. CUBIC SPLINE interpolation
  // Hermite polynomial coefficients:
  // p(tau) = (2*tau^3 - 3*tau^2 + 1)*p0 + (tau^3 - 2*tau^2 + tau)*dt*m0 + (-2*tau^3 + 3*tau^2)*p1 + (tau^3 - tau^2)*dt*m1
  const tau = factor;
  const tau2 = tau * tau;
  const tau3 = tau2 * tau;

  const h00 = 2 * tau3 - 3 * tau2 + 1;
  const h10 = (tau3 - 2 * tau2 + tau) * deltaT;
  const h01 = -2 * tau3 + 3 * tau2;
  const h11 = (tau3 - tau2) * deltaT;

  const base0 = k * recordSize;
  const base1 = (k + 1) * recordSize;

  for (let i = 0; i < stride; i++) {
    const p0 = values[base0 + stride + i] ?? 0;
    const m0 = values[base0 + 2 * stride + i] ?? 0; // out-tangent of k
    const p1 = values[base1 + stride + i] ?? 0;
    const m1 = values[base1 + i] ?? 0; // in-tangent of k + 1

    out[i] = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
  }

  if (track.path === 'rotation') {
    quat.normalize(out as unknown as Quat, out as unknown as Quat);
  }
}
