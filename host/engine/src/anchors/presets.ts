/**
 * Built-in Anchor Strategy Presets (`presetsAnchor`) and kinematic 2D/3D implementations
 * for 'rope', 'chain', and 'spring'.
 */

import { mat2d, mat4, quat } from '../math/index';
import type { AnchorPresetDescriptor, AnchorStrategyParams } from './component';
import type { AnchorStrategy2D, AnchorStrategy3D } from './strategy';

const tempQuat = quat.create();

export interface RopeAnchorOptions {
  /** Maximum distance before pulling the origin towards the target. */
  maxLength: number;
  /** Optional damping factor [0..1] when used with physics or spring relaxation. */
  damping?: number;
  /** Optional target offset ([x, y] or [x, y, z]). */
  offset?: readonly number[];
  /** Optional local attachment point on origin entity ([x, y] or [x, y, z]). */
  localAnchorOrigin?: readonly number[];
  /** Optional local attachment point on target entity ([x, y] or [x, y, z]). */
  localAnchorTarget?: readonly number[];
}

export interface ChainAnchorOptions {
  /** Exact distance maintained between origin and target. */
  length: number;
  /** Whether to align origin's orientation towards the target (defaults to true). */
  alignRotation?: boolean;
  /** Optional target offset ([x, y] or [x, y, z]). */
  offset?: readonly number[];
  /** Optional local attachment point on origin entity ([x, y] or [x, y, z]). */
  localAnchorOrigin?: readonly number[];
  /** Optional local attachment point on target entity ([x, y] or [x, y, z]). */
  localAnchorTarget?: readonly number[];
}

export interface SpringAnchorOptions {
  /** Spring stiffness coefficient (defaults to 120). */
  stiffness?: number;
  /** Spring damping coefficient (defaults to 14). */
  damping?: number;
  /** Rest distance from target (defaults to 0). */
  restLength?: number;
  /** Optional world/target offset vector ([x, y] or [x, y, z]). */
  offset?: readonly number[];
  /** Optional local attachment point on origin entity ([x, y] or [x, y, z]). */
  localAnchorOrigin?: readonly number[];
  /** Optional local attachment point on target entity ([x, y] or [x, y, z]). */
  localAnchorTarget?: readonly number[];
}

export interface HingeAnchorOptions {
  /** Local rotation axis on 3D hinge joints ([x, y, z], defaults to [0, 1, 0]). */
  axis?: readonly number[];
  /** Minimum rotation angle in radians for hinge joints. */
  minAngle?: number;
  /** Maximum rotation angle in radians for hinge joints. */
  maxAngle?: number;
  /** Angular limit pair [minAngle, maxAngle] in radians for hinge joints. */
  limits?: readonly [number, number];
  /** Target equilibrium rotation angle in radians for angular spring motor. */
  targetAngle?: number;
  /** Rotational/torsional stiffness coefficient for angular spring motor. */
  stiffness?: number;
  /** Rotational/torsional damping coefficient for angular spring motor. */
  damping?: number;
  /** Optional world/target offset vector ([x, y] or [x, y, z]). */
  offset?: readonly number[];
  /** Optional local attachment point on origin entity ([x, y] or [x, y, z]). */
  localAnchorOrigin?: readonly number[];
  /** Optional local attachment point on target entity ([x, y] or [x, y, z]). */
  localAnchorTarget?: readonly number[];
  /** Whether connected bodies should collide with each other (defaults to false). */
  collideConnected?: boolean;
}

export interface AngularSpringAnchorOptions {
  /** Target equilibrium rotation angle in radians (defaults to 0). */
  targetAngle?: number;
  /** Rotational/torsional stiffness coefficient (defaults to 60). */
  stiffness?: number;
  /** Rotational/torsional damping coefficient (defaults to 6). */
  damping?: number;
  /** Local rotation axis on 3D angular spring joints ([x, y, z], defaults to [0, 1, 0]). */
  axis?: readonly number[];
  /** Minimum rotation angle in radians (optional limit clamp). */
  minAngle?: number;
  /** Maximum rotation angle in radians (optional limit clamp). */
  maxAngle?: number;
  /** Angular limit pair [minAngle, maxAngle] in radians. */
  limits?: readonly [number, number];
  /** Optional world/target offset vector ([x, y] or [x, y, z]). */
  offset?: readonly number[];
  /** Optional local attachment point on origin entity ([x, y] or [x, y, z]). */
  localAnchorOrigin?: readonly number[];
  /** Optional local attachment point on target entity ([x, y] or [x, y, z]). */
  localAnchorTarget?: readonly number[];
  /** Whether connected bodies should collide with each other (defaults to false). */
  collideConnected?: boolean;
}

/**
 * Ergonomic factory functions for configuring 2D and 3D Anchor relationships.
 * Works both kinematically (via `AnchorSolveSystem`) and physically (via `@galfus/physics-2d` / `3d`).
 */
export const presetsAnchor = {
  static(offset?: readonly number[]): AnchorPresetDescriptor {
    return { strategy: 'static', params: offset ? { offset } : undefined };
  },
  translation(offset?: readonly number[]): AnchorPresetDescriptor {
    return { strategy: 'translation', params: offset ? { offset } : undefined };
  },
  rope(options: RopeAnchorOptions): AnchorPresetDescriptor {
    return {
      strategy: 'rope',
      params: {
        maxLength: Math.max(0, options.maxLength),
        damping: options.damping,
        offset: options.offset,
        localAnchorOrigin: options.localAnchorOrigin,
        localAnchorTarget: options.localAnchorTarget
      }
    };
  },
  chain(options: ChainAnchorOptions): AnchorPresetDescriptor {
    return {
      strategy: 'chain',
      params: {
        length: Math.max(0, options.length),
        alignRotation: options.alignRotation ?? true,
        offset: options.offset,
        localAnchorOrigin: options.localAnchorOrigin,
        localAnchorTarget: options.localAnchorTarget
      }
    };
  },
  spring(options: SpringAnchorOptions = {}): AnchorPresetDescriptor {
    return {
      strategy: 'spring',
      params: {
        stiffness: options.stiffness ?? 120,
        damping: options.damping ?? 14,
        restLength: Math.max(0, options.restLength ?? 0),
        offset: options.offset,
        localAnchorOrigin: options.localAnchorOrigin,
        localAnchorTarget: options.localAnchorTarget
      }
    };
  },
  hinge(options: HingeAnchorOptions = {}): AnchorPresetDescriptor {
    return {
      strategy: 'hinge',
      params: {
        axis: options.axis,
        minAngle: options.minAngle,
        maxAngle: options.maxAngle,
        limits: options.limits,
        targetAngle: options.targetAngle,
        stiffness: options.stiffness,
        damping: options.damping,
        offset: options.offset,
        localAnchorOrigin: options.localAnchorOrigin,
        localAnchorTarget: options.localAnchorTarget,
        collideConnected: options.collideConnected
      }
    };
  },
  angularSpring(options: AngularSpringAnchorOptions = {}): AnchorPresetDescriptor {
    return {
      strategy: 'angularSpring',
      params: {
        targetAngle: options.targetAngle ?? 0,
        stiffness: options.stiffness ?? 60,
        damping: options.damping ?? 6,
        axis: options.axis,
        minAngle: options.minAngle,
        maxAngle: options.maxAngle,
        limits: options.limits,
        offset: options.offset,
        localAnchorOrigin: options.localAnchorOrigin,
        localAnchorTarget: options.localAnchorTarget,
        collideConnected: options.collideConnected
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Internal kinematic state for Rope, Chain, and Spring (indexed by origin EntityId)
// ---------------------------------------------------------------------------
interface KinematicState2D {
  initialized: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface KinematicState3D {
  initialized: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

const state2D = new WeakMap<Float32Array, KinematicState2D>();
const state3D = new WeakMap<Float32Array, KinematicState3D>();

function getOrInit2D(
  local: Float32Array,
  targetX: number,
  targetY: number,
  params: AnchorStrategyParams | undefined
): KinematicState2D {
  let st = state2D.get(local);
  if (!st || !st.initialized) {
    const dx = params?.initialDelta ? (params.initialDelta[0] ?? 0) : local[4]! - targetX;
    const dy = params?.initialDelta ? (params.initialDelta[1] ?? 0) : local[5]! - targetY;
    st = {
      initialized: true,
      x: targetX + dx,
      y: targetY + dy,
      vx: 0,
      vy: 0
    };
    state2D.set(local, st);
  }
  return st;
}

function getOrInit3D(
  local: Float32Array,
  targetX: number,
  targetY: number,
  targetZ: number,
  params: AnchorStrategyParams | undefined
): KinematicState3D {
  let st = state3D.get(local);
  if (!st || !st.initialized) {
    const dx = params?.initialDelta ? (params.initialDelta[0] ?? 0) : local[12]! - targetX;
    const dy = params?.initialDelta ? (params.initialDelta[1] ?? 0) : local[13]! - targetY;
    const dz = params?.initialDelta ? (params.initialDelta[2] ?? 0) : local[14]! - targetZ;
    st = {
      initialized: true,
      x: targetX + dx,
      y: targetY + dy,
      z: targetZ + dz,
      vx: 0,
      vy: 0,
      vz: 0
    };
    state3D.set(local, st);
  }
  return st;
}

export function resolveAnchorTarget2D(
  targetWorld: Float32Array,
  offset: Float32Array | undefined,
  params: AnchorStrategyParams | undefined
): [number, number] {
  const ox = params?.offset?.[0] ?? (offset ? offset[4]! : 0);
  const oy = params?.offset?.[1] ?? (offset ? offset[5]! : 0);
  return [targetWorld[4]! + ox, targetWorld[5]! + oy];
}

export function resolveAnchorTarget3D(
  targetWorld: Float32Array,
  offset: Float32Array | undefined,
  params: AnchorStrategyParams | undefined
): [number, number, number] {
  const ox = params?.offset?.[0] ?? (offset ? offset[12]! : 0);
  const oy = params?.offset?.[1] ?? (offset ? offset[13]! : 0);
  const oz = params?.offset?.[2] ?? (offset ? offset[14]! : 0);
  return [targetWorld[12]! + ox, targetWorld[13]! + oy, targetWorld[14]! + oz];
}

// ---------------------------------------------------------------------------
// 2D Kinematic Strategies: Rope, Chain, Spring
// ---------------------------------------------------------------------------
export const RopeAnchorStrategy2D: AnchorStrategy2D = {
  name: 'rope',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty] = resolveAnchorTarget2D(targetWorld, offset, context.params);
    const maxLen = Math.max(0, context.params?.maxLength ?? context.distance ?? 1);
    const st = getOrInit2D(local, tx, ty, context.params);

    const dx = st.x - tx;
    const dy = st.y - ty;
    const dist = Math.hypot(dx, dy);
    if (dist > maxLen && dist > 1e-6) {
      const scale = maxLen / dist;
      st.x = tx + dx * scale;
      st.y = ty + dy * scale;
    }

    mat2d.copy(outWorld, local);
    outWorld[4] = st.x;
    outWorld[5] = st.y;
  }
};

export const ChainAnchorStrategy2D: AnchorStrategy2D = {
  name: 'chain',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty] = resolveAnchorTarget2D(targetWorld, offset, context.params);
    const len = Math.max(0, context.params?.length ?? context.distance ?? 1);
    const align = context.params?.alignRotation ?? true;
    const st = getOrInit2D(local, tx, ty, context.params);

    let dx = st.x - tx;
    let dy = st.y - ty;
    let dist = Math.hypot(dx, dy);
    if (dist <= 1e-6) {
      dx = local[4]! !== 0 || local[5]! !== 0 ? local[4]! : 0;
      dy = local[4]! !== 0 || local[5]! !== 0 ? local[5]! : -1;
      dist = Math.hypot(dx, dy) || 1;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    st.x = tx + nx * len;
    st.y = ty + ny * len;

    mat2d.copy(outWorld, local);
    if (align && len > 1e-6) {
      const sx = Math.hypot(local[0]!, local[1]!) || 1;
      const sy = Math.hypot(local[2]!, local[3]!) || 1;
      const angle = Math.atan2(-ny, -nx);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      outWorld[0] = c * sx;
      outWorld[1] = s * sx;
      outWorld[2] = -s * sy;
      outWorld[3] = c * sy;
    }
    outWorld[4] = st.x;
    outWorld[5] = st.y;
  }
};

export const SpringAnchorStrategy2D: AnchorStrategy2D = {
  name: 'spring',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty] = resolveAnchorTarget2D(targetWorld, offset, context.params);
    const stiffness = context.params?.stiffness ?? 120;
    const damping = context.params?.damping ?? 14;
    const restLen = context.params?.restLength ?? 0;
    const st = getOrInit2D(local, tx, ty, context.params);

    const dt = Math.min(context.dt > 0 ? context.dt : 1 / 60, 0.1);
    const dx = st.x - tx;
    const dy = st.y - ty;
    const dist = Math.hypot(dx, dy);
    const stretch = dist - restLen;
    const nx = dist > 1e-6 ? dx / dist : 0;
    const ny = dist > 1e-6 ? dy / dist : 1;

    const ax = -stiffness * stretch * nx - damping * st.vx;
    const ay = -stiffness * stretch * ny - damping * st.vy;
    st.vx += ax * dt;
    st.vy += ay * dt;
    st.x += st.vx * dt;
    st.y += st.vy * dt;

    const errSq = stretch * stretch;
    const velSq = st.vx * st.vx + st.vy * st.vy;
    if (errSq > 1e-6 || velSq > 1e-6) {
      context.keepAwake = true;
    } else if (restLen === 0) {
      st.x = tx;
      st.y = ty;
      st.vx = 0;
      st.vy = 0;
    }

    mat2d.copy(outWorld, local);
    outWorld[4] = st.x;
    outWorld[5] = st.y;
  }
};

// ---------------------------------------------------------------------------
// 3D Kinematic Strategies: Rope, Chain, Spring
// ---------------------------------------------------------------------------
export const RopeAnchorStrategy3D: AnchorStrategy3D = {
  name: 'rope',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty, tz] = resolveAnchorTarget3D(targetWorld, offset, context.params);
    const maxLen = Math.max(0, context.params?.maxLength ?? context.distance ?? 1);
    const st = getOrInit3D(local, tx, ty, tz, context.params);

    const dx = st.x - tx;
    const dy = st.y - ty;
    const dz = st.z - tz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxLen && dist > 1e-6) {
      const scale = maxLen / dist;
      st.x = tx + dx * scale;
      st.y = ty + dy * scale;
      st.z = tz + dz * scale;
    }

    mat4.copy(outWorld, local);
    outWorld[12] = st.x;
    outWorld[13] = st.y;
    outWorld[14] = st.z;
  }
};

export const ChainAnchorStrategy3D: AnchorStrategy3D = {
  name: 'chain',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty, tz] = resolveAnchorTarget3D(targetWorld, offset, context.params);
    const len = Math.max(0, context.params?.length ?? context.distance ?? 1);
    const align = context.params?.alignRotation ?? true;
    const st = getOrInit3D(local, tx, ty, tz, context.params);

    let dx = st.x - tx;
    let dy = st.y - ty;
    let dz = st.z - tz;
    let dist = Math.hypot(dx, dy, dz);
    if (dist <= 1e-6) {
      const hasLocal = local[12]! !== 0 || local[13]! !== 0 || local[14]! !== 0;
      dx = hasLocal ? local[12]! : 0;
      dy = hasLocal ? local[13]! : -1;
      dz = hasLocal ? local[14]! : 0;
      dist = Math.hypot(dx, dy, dz) || 1;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;
    st.x = tx + nx * len;
    st.y = ty + ny * len;
    st.z = tz + nz * len;

    mat4.copy(outWorld, local);
    if (align && len > 1e-6) {
      const sx = Math.hypot(local[0]!, local[1]!, local[2]!) || 1;
      const sy = Math.hypot(local[4]!, local[5]!, local[6]!) || 1;
      const sz = Math.hypot(local[8]!, local[9]!, local[10]!) || 1;
      quat.fromLookAt(tempQuat, [st.x, st.y, st.z], [tx, ty, tz]);
      mat4.fromRotationTranslationScale(outWorld, tempQuat, [st.x, st.y, st.z], [sx, sy, sz]);
    } else {
      outWorld[12] = st.x;
      outWorld[13] = st.y;
      outWorld[14] = st.z;
    }
  }
};

export const SpringAnchorStrategy3D: AnchorStrategy3D = {
  name: 'spring',
  apply(targetWorld, local, outWorld, offset, context) {
    const [tx, ty, tz] = resolveAnchorTarget3D(targetWorld, offset, context.params);
    const stiffness = context.params?.stiffness ?? 120;
    const damping = context.params?.damping ?? 14;
    const restLen = context.params?.restLength ?? 0;
    const st = getOrInit3D(local, tx, ty, tz, context.params);

    const dt = Math.min(context.dt > 0 ? context.dt : 1 / 60, 0.1);
    const dx = st.x - tx;
    const dy = st.y - ty;
    const dz = st.z - tz;
    const dist = Math.hypot(dx, dy, dz);
    const stretch = dist - restLen;
    const nx = dist > 1e-6 ? dx / dist : 0;
    const ny = dist > 1e-6 ? dy / dist : -1;
    const nz = dist > 1e-6 ? dz / dist : 0;

    const ax = -stiffness * stretch * nx - damping * st.vx;
    const ay = -stiffness * stretch * ny - damping * st.vy;
    const az = -stiffness * stretch * nz - damping * st.vz;
    st.vx += ax * dt;
    st.vy += ay * dt;
    st.vz += az * dt;
    st.x += st.vx * dt;
    st.y += st.vy * dt;
    st.z += st.vz * dt;

    const errSq = stretch * stretch;
    const velSq = st.vx * st.vx + st.vy * st.vy + st.vz * st.vz;
    if (errSq > 1e-6 || velSq > 1e-6) {
      context.keepAwake = true;
    } else if (restLen === 0) {
      st.x = tx;
      st.y = ty;
      st.z = tz;
      st.vx = 0;
      st.vy = 0;
      st.vz = 0;
    }

    mat4.copy(outWorld, local);
    outWorld[12] = st.x;
    outWorld[13] = st.y;
    outWorld[14] = st.z;
  }
};

export {
  AngularSpringAnchorStrategy2D,
  AngularSpringAnchorStrategy3D,
  HingeAnchorStrategy2D,
  HingeAnchorStrategy3D
} from './strategies-rotational';
