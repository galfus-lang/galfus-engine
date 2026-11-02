/**
 * AnimationCoordinator orchestrates native property transitions, path followers, and animation events.
 */

import type {
  AnimationEvent,
  AnimationTarget,
  AnimValue,
  GalfusEngine,
  PathCommand,
  PathFollowConfig,
  PathFollowState,
  TransitionConfig,
  TransitionState
} from '@galfus/transport-types';
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import { mat4, quat, vec3 } from '../math/index';
import type { Model2DComponent } from '../realm2d/components';
import type { Model3DComponent } from '../realm3d/components';
import { IdAllocator, type PathId, type TransitionId } from '../types';

export type AnimationEventListener = (event: AnimationEvent) => void;
export type EcsAnimProperty = 'position' | 'rotation' | 'scale' | 'transform3d' | 'transform2d';

export interface EcsAnimBinding {
  readonly transitionId: TransitionId;
  readonly world: EcsWorld;
  readonly entityId: EntityId;
  readonly property: EcsAnimProperty;
}

export class AnimationCoordinator {
  private _engine: GalfusEngine | null = null;
  private readonly _transitionIdAllocator = new IdAllocator<TransitionId>(1);
  private readonly _pathIdAllocator = new IdAllocator<PathId>(1);
  private readonly _transitions = new Set<TransitionId>();
  private readonly _paths = new Set<PathId>();
  private readonly _eventListeners = new Set<AnimationEventListener>();
  private readonly _ecsBindings = new Map<TransitionId, EcsAnimBinding>();
  private readonly _entityPropertyBindings = new Map<string, TransitionId>();

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------
  createTransition(
    initialValue: AnimValue,
    config: TransitionConfig,
    target?: AnimationTarget
  ): TransitionId {
    const id = this._transitionIdAllocator.allocate('TransitionId');
    if (this._engine) {
      this._engine.animationCreateTransition(id, initialValue, config);
      if (target) {
        this._engine.animationBindTarget(id, target);
      }
    }
    this._transitions.add(id);
    return id;
  }

  bindTarget(transitionId: TransitionId, target: AnimationTarget): void {
    if (this._engine) {
      this._engine.animationBindTarget(transitionId, target);
    }
  }

  unbindTarget(transitionId: TransitionId): void {
    if (this._engine) {
      this._engine.animationUnbindTarget(transitionId);
    }
  }

  transitionTo(transitionId: TransitionId, targetValue: AnimValue, config: TransitionConfig): void {
    if (this._engine) {
      this._engine.animationTransitionTo(transitionId, targetValue, config);
    }
  }

  createScalarTransition(
    initialScalar: number,
    duration: number,
    delay = 0,
    easingId = 0,
    target?: AnimationTarget
  ): TransitionId {
    const id = this._transitionIdAllocator.allocate('TransitionId');
    if (this._engine) {
      this._engine.animationCreateScalarTransition(id, initialScalar, duration, delay, easingId);
      if (target) {
        this._engine.animationBindTarget(id, target);
      }
    }
    this._transitions.add(id);
    return id;
  }

  transitionToScalar(
    transitionId: TransitionId,
    targetScalar: number,
    duration: number,
    delay = 0,
    easingId = 0
  ): void {
    if (this._engine) {
      this._engine.animationTransitionToScalar(
        transitionId,
        targetScalar,
        duration,
        delay,
        easingId
      );
    }
  }

  transitionToTransform3d(
    transitionId: TransitionId,
    floats: Float32Array,
    duration: number,
    delay = 0,
    easingId = 0
  ): void {
    if (this._engine) {
      this._engine.animationTransitionToTransform3d(
        transitionId,
        floats,
        duration,
        delay,
        easingId
      );
    }
  }

  transitionToTransform2d(
    transitionId: TransitionId,
    floats: Float32Array,
    duration: number,
    delay = 0,
    easingId = 0
  ): void {
    if (this._engine) {
      this._engine.animationTransitionToTransform2d(
        transitionId,
        floats,
        duration,
        delay,
        easingId
      );
    }
  }

  getState(transitionId: TransitionId): TransitionState | undefined {
    return this._engine?.animationGetState(transitionId);
  }

  getValue(transitionId: TransitionId): AnimValue | undefined {
    return this._engine?.animationGetValue(transitionId);
  }

  destroyTransition(transitionId: TransitionId): void {
    this.unbindEcsTarget(transitionId);
    if (!this._transitions.has(transitionId)) return;
    if (this._engine) {
      this._engine.animationDestroyTransition(transitionId);
    }
    this._transitions.delete(transitionId);
  }

  // ---------------------------------------------------------------------------
  // ECS Integration
  // ---------------------------------------------------------------------------
  bindEcsTarget(
    transitionId: TransitionId,
    world: EcsWorld,
    entityId: EntityId,
    property: EcsAnimProperty
  ): void {
    const binding: EcsAnimBinding = { transitionId, world, entityId, property };
    this._ecsBindings.set(transitionId, binding);
    const key = `${entityId}:${property}`;
    this._entityPropertyBindings.set(key, transitionId);
  }

  unbindEcsTarget(transitionId: TransitionId): void {
    const binding = this._ecsBindings.get(transitionId);
    if (binding) {
      const key = `${binding.entityId}:${binding.property}`;
      if (this._entityPropertyBindings.get(key) === transitionId) {
        this._entityPropertyBindings.delete(key);
      }
      this._ecsBindings.delete(transitionId);
    }
  }

  getEcsBinding(transitionId: TransitionId): EcsAnimBinding | undefined {
    return this._ecsBindings.get(transitionId);
  }

  animateEcsProperty(
    world: EcsWorld,
    entityId: EntityId,
    property: EcsAnimProperty,
    targetValue: unknown,
    config: TransitionConfig
  ): TransitionId | undefined {
    if (!world.isAlive(entityId)) return undefined;

    const model3d = world.getComponent<Model3DComponent>(entityId, 'Model3D');
    const model2d = world.getComponent<Model2DComponent>(entityId, 'Model2D');

    if (!model3d && !model2d) return undefined;

    let initialValue: AnimValue;
    let normalizedTarget: AnimValue;

    if (model3d) {
      switch (property) {
        case 'position': {
          initialValue = {
            type: 'vec3',
            value: [model3d.localMatrix[12]!, model3d.localMatrix[13]!, model3d.localMatrix[14]!]
          };
          normalizedTarget = Array.isArray(targetValue)
            ? { type: 'vec3', value: [targetValue[0]!, targetValue[1]!, targetValue[2]!] }
            : (targetValue as AnimValue);
          break;
        }
        case 'rotation': {
          const q = quat.create();
          mat4.getRotation(q, model3d.localMatrix);
          initialValue = {
            type: 'quat',
            value: [q[0], q[1], q[2], q[3]]
          };
          normalizedTarget = Array.isArray(targetValue)
            ? {
                type: 'quat',
                value: [targetValue[0]!, targetValue[1]!, targetValue[2]!, targetValue[3]!]
              }
            : (targetValue as AnimValue);
          break;
        }
        case 'scale': {
          const s = vec3.create();
          mat4.getScaling(s, model3d.localMatrix);
          initialValue = {
            type: 'vec3',
            value: [s[0], s[1], s[2]]
          };
          normalizedTarget = Array.isArray(targetValue)
            ? { type: 'vec3', value: [targetValue[0]!, targetValue[1]!, targetValue[2]!] }
            : (targetValue as AnimValue);
          break;
        }
        case 'transform3d': {
          const t = vec3.create();
          const q = quat.create();
          const s = vec3.create();
          mat4.getTranslation(t, model3d.localMatrix);
          mat4.getRotation(q, model3d.localMatrix);
          mat4.getScaling(s, model3d.localMatrix);
          initialValue = {
            type: 'transform3D',
            value: [t[0], t[1], t[2], q[0], q[1], q[2], q[3], s[0], s[1], s[2]]
          };
          if (targetValue && typeof targetValue === 'object') {
            const raw = targetValue as Record<string, unknown>;
            if (raw.type === 'transform3D' && Array.isArray(raw.value)) {
              normalizedTarget = targetValue as AnimValue;
            } else if (Array.isArray(targetValue)) {
              normalizedTarget = {
                type: 'transform3D',
                value: targetValue as unknown as [
                  number,
                  number,
                  number,
                  number,
                  number,
                  number,
                  number,
                  number,
                  number,
                  number
                ]
              };
            } else {
              const pos = (raw.position as number[]) ?? [t[0], t[1], t[2]];
              const rot = (raw.rotation as number[]) ?? [q[0], q[1], q[2], q[3]];
              const sc = (raw.scale as number[]) ?? [s[0], s[1], s[2]];
              normalizedTarget = {
                type: 'transform3D',
                value: [
                  pos[0]!,
                  pos[1]!,
                  pos[2]!,
                  rot[0]!,
                  rot[1]!,
                  rot[2]!,
                  rot[3]!,
                  sc[0]!,
                  sc[1]!,
                  sc[2]!
                ]
              };
            }
          } else {
            normalizedTarget = targetValue as AnimValue;
          }
          break;
        }
        default:
          return undefined;
      }
    } else if (model2d) {
      switch (property) {
        case 'position': {
          initialValue = {
            type: 'vec2',
            value: [model2d.localMatrix[4]!, model2d.localMatrix[5]!]
          };
          normalizedTarget = Array.isArray(targetValue)
            ? { type: 'vec2', value: [targetValue[0]!, targetValue[1]!] }
            : (targetValue as AnimValue);
          break;
        }
        case 'rotation': {
          const rot = Math.atan2(model2d.localMatrix[1]!, model2d.localMatrix[0]!);
          initialValue = {
            type: 'scalar',
            value: rot
          };
          normalizedTarget =
            typeof targetValue === 'number'
              ? { type: 'scalar', value: targetValue }
              : (targetValue as AnimValue);
          break;
        }
        case 'scale': {
          const sx = Math.hypot(model2d.localMatrix[0]!, model2d.localMatrix[1]!);
          const sy =
            Math.hypot(model2d.localMatrix[2]!, model2d.localMatrix[3]!) *
            (model2d.localMatrix[0]! * model2d.localMatrix[3]! -
              model2d.localMatrix[1]! * model2d.localMatrix[2]! <
            0
              ? -1
              : 1);
          initialValue = {
            type: 'vec2',
            value: [sx, sy]
          };
          normalizedTarget = Array.isArray(targetValue)
            ? { type: 'vec2', value: [targetValue[0]!, targetValue[1]!] }
            : (targetValue as AnimValue);
          break;
        }
        case 'transform2d': {
          const px = model2d.localMatrix[4]!;
          const py = model2d.localMatrix[5]!;
          const rot = Math.atan2(model2d.localMatrix[1]!, model2d.localMatrix[0]!);
          const sx = Math.hypot(model2d.localMatrix[0]!, model2d.localMatrix[1]!);
          const sy =
            Math.hypot(model2d.localMatrix[2]!, model2d.localMatrix[3]!) *
            (model2d.localMatrix[0]! * model2d.localMatrix[3]! -
              model2d.localMatrix[1]! * model2d.localMatrix[2]! <
            0
              ? -1
              : 1);
          initialValue = {
            type: 'transform2D',
            value: [px, py, rot, sx, sy, 0]
          };
          if (targetValue && typeof targetValue === 'object') {
            const raw = targetValue as Record<string, unknown>;
            if (raw.type === 'transform2D' && Array.isArray(raw.value)) {
              normalizedTarget = targetValue as AnimValue;
            } else if (Array.isArray(targetValue)) {
              normalizedTarget = {
                type: 'transform2D',
                value: targetValue as unknown as [number, number, number, number, number, number]
              };
            } else {
              const pos = (raw.position as number[]) ?? [px, py];
              const r = (raw.rotation as number) ?? rot;
              const sc = (raw.scale as number[]) ?? [sx, sy];
              const skew = (raw.skew as number) ?? 0;
              normalizedTarget = {
                type: 'transform2D',
                value: [pos[0]!, pos[1]!, r, sc[0]!, sc[1]!, skew]
              };
            }
          } else {
            normalizedTarget = targetValue as AnimValue;
          }
          break;
        }
        default:
          return undefined;
      }
    } else {
      return undefined;
    }

    // Cancel existing transition on the same entity and property (deterministic single transition per property)
    const key = `${entityId}:${property}`;
    const existingTransitionId = this._entityPropertyBindings.get(key);
    if (existingTransitionId !== undefined) {
      this.destroyTransition(existingTransitionId);
    }

    // Create mathematical transition without native core targets
    const transitionId = this.createTransition(initialValue, config);
    this.bindEcsTarget(transitionId, world, entityId, property);
    this.transitionTo(transitionId, normalizedTarget, config);

    return transitionId;
  }

  // ---------------------------------------------------------------------------
  // Path Followers
  // ---------------------------------------------------------------------------
  createPathFollow(
    commands: PathCommand[],
    config: PathFollowConfig,
    target?: AnimationTarget
  ): PathId {
    const id = this._pathIdAllocator.allocate('PathId');
    if (this._engine) {
      this._engine.animationCreatePathFollow(id, commands, config);
      if (target) {
        this._engine.animationBindPathFollowTarget(id, target);
      }
    }
    this._paths.add(id);
    return id;
  }

  bindPathFollowTarget(pathId: PathId, target: AnimationTarget): void {
    if (this._engine) {
      this._engine.animationBindPathFollowTarget(pathId, target);
    }
  }

  unbindPathFollowTarget(pathId: PathId): void {
    if (this._engine) {
      this._engine.animationUnbindPathFollowTarget(pathId);
    }
  }

  getPathState(pathId: PathId): PathFollowState | undefined {
    return this._engine?.animationGetPathFollowState(pathId);
  }

  destroyPath(pathId: PathId): void {
    if (!this._paths.has(pathId)) return;
    if (this._engine) {
      this._engine.animationDestroyPathFollow(pathId);
    }
    this._paths.delete(pathId);
  }

  // ---------------------------------------------------------------------------
  // Event Pump & Lifecycle
  // ---------------------------------------------------------------------------
  on(_type: 'animation', listener: AnimationEventListener): () => void {
    this._eventListeners.add(listener);
    return () => {
      this._eventListeners.delete(listener);
    };
  }

  clearListeners(): void {
    this._eventListeners.clear();
  }

  step(dt?: number): void {
    if (!this._engine) return;
    if (dt !== undefined && this._engine.animationStep) {
      this._engine.animationStep(dt);
    }

    // Apply values to ECS targets prior to AnchorSolveSystem
    for (const [transitionId, binding] of this._ecsBindings) {
      if (!binding.world.isAlive(binding.entityId)) {
        this.destroyTransition(transitionId);
        continue;
      }

      const val = this.getValue(transitionId);
      if (!val) continue;

      const model3d = binding.world.getComponent<Model3DComponent>(binding.entityId, 'Model3D');
      const model2d = binding.world.getComponent<Model2DComponent>(binding.entityId, 'Model2D');

      if (model3d) {
        if (val.type === 'vec3' && binding.property === 'position') {
          model3d.setPosition(val.value[0], val.value[1], val.value[2]);
        } else if (val.type === 'quat' && binding.property === 'rotation') {
          model3d.setRotation(val.value[0], val.value[1], val.value[2], val.value[3]);
        } else if (val.type === 'vec3' && binding.property === 'scale') {
          model3d.setScale(val.value[0], val.value[1], val.value[2]);
        } else if (val.type === 'transform3D') {
          const v = val.value;
          model3d.setTRS([v[0], v[1], v[2]], [v[3], v[4], v[5], v[6]], [v[7], v[8], v[9]]);
        }
      } else if (model2d) {
        if (val.type === 'vec2' && binding.property === 'position') {
          model2d.setPosition(val.value[0], val.value[1]);
        } else if (val.type === 'scalar' && binding.property === 'rotation') {
          model2d.setRotation(val.value);
        } else if (val.type === 'vec2' && binding.property === 'scale') {
          model2d.setScale(val.value[0], val.value[1]);
        } else if (val.type === 'transform2D') {
          const v = val.value;
          model2d.setTRS([v[0], v[1]], v[2], [v[3], v[4]]);
        }
      }
    }

    const events = this._engine.animationPumpEvents ? this._engine.animationPumpEvents() : [];
    if (events && events.length > 0) {
      for (const event of events) {
        for (const listener of this._eventListeners) {
          listener(event);
        }
      }
    }
  }

  dispose(): void {
    if (this._engine) {
      for (const transitionId of this._transitions) {
        this._engine.animationDestroyTransition(transitionId);
      }
      for (const pathId of this._paths) {
        this._engine.animationDestroyPathFollow(pathId);
      }
    }
    this._transitions.clear();
    this._paths.clear();
    this._ecsBindings.clear();
    this._entityPropertyBindings.clear();
    this._eventListeners.clear();
    this._engine = null;
  }
}
