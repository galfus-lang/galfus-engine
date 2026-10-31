/**
 * Extensible Anchor strategies for 2D and 3D hierarchical solving.
 */
import { mat2d, mat4, type Mat2d, type Mat4 } from '../math/index';

export interface AnchorContext {
  /** Delta time of the frame in seconds. */
  dt: number;
  /** Total elapsed time in seconds. */
  time: number;
}

export type AnchorConstraintCallback2D = (
  targetWorld: Mat2d,
  local: Mat2d,
  outWorld: Mat2d,
  context: AnchorContext
) => void;

export type AnchorConstraintCallback3D = (
  targetWorld: Mat4,
  local: Mat4,
  outWorld: Mat4,
  context: AnchorContext
) => void;

/**
 * 2D Anchor resolution strategy contract.
 */
export interface AnchorStrategy2D {
  readonly name: string;
  apply(
    targetWorld: Mat2d,
    local: Mat2d,
    outWorld: Mat2d,
    offset: Mat2d | undefined,
    context: AnchorContext
  ): void;
}

/**
 * 3D Anchor resolution strategy contract.
 */
export interface AnchorStrategy3D {
  readonly name: string;
  apply(
    targetWorld: Mat4,
    local: Mat4,
    outWorld: Mat4,
    offset: Mat4 | undefined,
    context: AnchorContext
  ): void;
}

/**
 * Default 'static' 2D strategy: multiplies targetWorld * (offset ? offset * local : local).
 */
export const StaticAnchorStrategy2D: AnchorStrategy2D = {
  name: 'static',
  apply(targetWorld, local, outWorld, offset) {
    if (offset) {
      const temp = mat2d.create();
      mat2d.multiply(temp, offset, local);
      mat2d.multiply(outWorld, targetWorld, temp);
    } else {
      mat2d.multiply(outWorld, targetWorld, local);
    }
  }
};

/**
 * Default 'static' 3D strategy: multiplies targetWorld * (offset ? offset * local : local).
 */
export const StaticAnchorStrategy3D: AnchorStrategy3D = {
  name: 'static',
  apply(targetWorld, local, outWorld, offset) {
    if (offset) {
      const temp = mat4.create();
      mat4.multiply(temp, offset, local);
      mat4.multiply(outWorld, targetWorld, temp);
    } else {
      mat4.multiply(outWorld, targetWorld, local);
    }
  }
};

/**
 * Pure 'translation' 2D strategy: follows targetWorld translation only without inheriting orientation or scale.
 */
export const TranslationAnchorStrategy2D: AnchorStrategy2D = {
  name: 'translation',
  apply(targetWorld, local, outWorld, offset) {
    mat2d.copy(outWorld, local);
    outWorld[4] += targetWorld[4] + (offset ? offset[4] : 0);
    outWorld[5] += targetWorld[5] + (offset ? offset[5] : 0);
  }
};

/**
 * Pure 'translation' 3D strategy: follows targetWorld translation only without inheriting orientation or scale.
 */
export const TranslationAnchorStrategy3D: AnchorStrategy3D = {
  name: 'translation',
  apply(targetWorld, local, outWorld, offset) {
    mat4.copy(outWorld, local);
    outWorld[12] += targetWorld[12] + (offset ? offset[12] : 0);
    outWorld[13] += targetWorld[13] + (offset ? offset[13] : 0);
    outWorld[14] += targetWorld[14] + (offset ? offset[14] : 0);
  }
};

/**
 * Registry holding custom Anchor strategies.
 */
export class AnchorStrategyRegistry {
  private readonly _strategies2D = new Map<string, AnchorStrategy2D>();
  private readonly _strategies3D = new Map<string, AnchorStrategy3D>();

  constructor() {
    this.register2D(StaticAnchorStrategy2D);
    this.register2D(TranslationAnchorStrategy2D);
    this.register3D(StaticAnchorStrategy3D);
    this.register3D(TranslationAnchorStrategy3D);
  }

  register2D(strategy: AnchorStrategy2D): void {
    this._strategies2D.set(strategy.name, strategy);
  }

  register3D(strategy: AnchorStrategy3D): void {
    this._strategies3D.set(strategy.name, strategy);
  }

  get2D(name: string): AnchorStrategy2D {
    return this._strategies2D.get(name) ?? StaticAnchorStrategy2D;
  }

  get3D(name: string): AnchorStrategy3D {
    return this._strategies3D.get(name) ?? StaticAnchorStrategy3D;
  }
}
