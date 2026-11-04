/**
 * Rotational and torsional anchor strategies: 'hinge' and 'angularSpring'.
 */

import { mat2d, mat4, quat } from '../math/index';
import { resolveAnchorTarget2D, resolveAnchorTarget3D } from './presets';
import type { AnchorStrategy2D, AnchorStrategy3D } from './strategy';

const tempQuat = quat.create();

export const HingeAnchorStrategy2D: AnchorStrategy2D = {
  name: 'hinge',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty] = resolveAnchorTarget2D(targetWorld, offset, context.params);
    const p = context.params;
    mat2d.copy(outWorld, local);
    outWorld[4] = tx;
    outWorld[5] = ty;

    const min = p?.limits ? p.limits[0] : p?.minAngle;
    const max = p?.limits ? p.limits[1] : p?.maxAngle;
    if (min !== undefined && max !== undefined) {
      const currentAngle = Math.atan2(local[1]!, local[0]!);
      const clamped = Math.max(min, Math.min(max, currentAngle));
      const sx = Math.hypot(local[0]!, local[1]!) || 1;
      const sy = Math.hypot(local[2]!, local[3]!) || 1;
      outWorld[0] = Math.cos(clamped) * sx;
      outWorld[1] = Math.sin(clamped) * sx;
      outWorld[2] = -Math.sin(clamped) * sy;
      outWorld[3] = Math.cos(clamped) * sy;
    }
  }
};

export const HingeAnchorStrategy3D: AnchorStrategy3D = {
  name: 'hinge',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty, tz] = resolveAnchorTarget3D(targetWorld, offset, context.params);
    mat4.copy(outWorld, local);
    outWorld[12] = tx;
    outWorld[13] = ty;
    outWorld[14] = tz;
  }
};

interface AngularSpringState2D {
  initialized: boolean;
  angle: number;
  w: number;
}
const angularState2D = new WeakMap<Float32Array, AngularSpringState2D>();

export const AngularSpringAnchorStrategy2D: AnchorStrategy2D = {
  name: 'angularSpring',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty] = resolveAnchorTarget2D(targetWorld, offset, context.params);
    const p = context.params;
    const targetAngle = p?.targetAngle ?? 0;
    const k = p?.angularStiffness ?? p?.stiffness ?? 60;
    const d = p?.angularDamping ?? p?.damping ?? 6;
    const dt = Math.max(1e-4, Math.min(context.dt ?? 1 / 60, 0.1));

    let st = angularState2D.get(outWorld);
    if (!st || !st.initialized) {
      const curAngle = Math.atan2(local[1]!, local[0]!);
      st = { initialized: true, angle: curAngle, w: 0 };
      angularState2D.set(outWorld, st);
    }

    const diff = targetAngle - st.angle;
    const accel = diff * k - st.w * d;
    st.w += accel * dt;
    st.angle += st.w * dt;

    const min = p?.limits ? p.limits[0] : p?.minAngle;
    const max = p?.limits ? p.limits[1] : p?.maxAngle;
    if (min !== undefined && max !== undefined) {
      if (st.angle < min) {
        st.angle = min;
        st.w = 0;
      } else if (st.angle > max) {
        st.angle = max;
        st.w = 0;
      }
    }

    if (Math.abs(diff) > 1e-4 || Math.abs(st.w) > 1e-4) {
      context.keepAwake = true;
    }

    const sx = Math.hypot(local[0]!, local[1]!) || 1;
    const sy = Math.hypot(local[2]!, local[3]!) || 1;
    outWorld[0] = Math.cos(st.angle) * sx;
    outWorld[1] = Math.sin(st.angle) * sx;
    outWorld[2] = -Math.sin(st.angle) * sy;
    outWorld[3] = Math.cos(st.angle) * sy;
    outWorld[4] = tx;
    outWorld[5] = ty;
  }
};

interface AngularSpringState3D {
  initialized: boolean;
  angle: number;
  w: number;
}
const angularState3D = new WeakMap<Float32Array, AngularSpringState3D>();

export const AngularSpringAnchorStrategy3D: AnchorStrategy3D = {
  name: 'angularSpring',
  apply(targetWorld, _local, outWorld, offset, context) {
    const [tx, ty, tz] = resolveAnchorTarget3D(targetWorld, offset, context.params);
    const p = context.params;
    const targetAngle = p?.targetAngle ?? 0;
    const k = p?.angularStiffness ?? p?.stiffness ?? 60;
    const d = p?.angularDamping ?? p?.damping ?? 6;
    const dt = Math.max(1e-4, Math.min(context.dt ?? 1 / 60, 0.1));

    let st = angularState3D.get(outWorld);
    if (!st || !st.initialized) {
      st = { initialized: true, angle: targetAngle, w: 0 };
      angularState3D.set(outWorld, st);
    }

    const diff = targetAngle - st.angle;
    const accel = diff * k - st.w * d;
    st.w += accel * dt;
    st.angle += st.w * dt;

    const min = p?.limits ? p.limits[0] : p?.minAngle;
    const max = p?.limits ? p.limits[1] : p?.maxAngle;
    if (min !== undefined && max !== undefined) {
      if (st.angle < min) {
        st.angle = min;
        st.w = 0;
      } else if (st.angle > max) {
        st.angle = max;
        st.w = 0;
      }
    }

    if (Math.abs(diff) > 1e-4 || Math.abs(st.w) > 1e-4) {
      context.keepAwake = true;
    }

    const axisRaw = p?.axis ?? [0, 1, 0];
    const axisLen = Math.hypot(axisRaw[0]!, axisRaw[1]!, axisRaw[2]!) || 1;
    const normAxis: [number, number, number] = [
      axisRaw[0]! / axisLen,
      axisRaw[1]! / axisLen,
      axisRaw[2]! / axisLen
    ];

    quat.setAxisAngle(tempQuat, normAxis, st.angle);
    mat4.fromRotationTranslationScale(outWorld, tempQuat, [tx, ty, tz], [1, 1, 1]);
  }
};
