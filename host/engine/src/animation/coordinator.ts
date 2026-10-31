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
import { IdAllocator, type PathId, type TransitionId } from '../types';

export type AnimationEventListener = (event: AnimationEvent) => void;

export class AnimationCoordinator {
  private _engine: GalfusEngine | null = null;
  private readonly _transitionIdAllocator = new IdAllocator<TransitionId>(1);
  private readonly _pathIdAllocator = new IdAllocator<PathId>(1);
  private readonly _transitions = new Set<TransitionId>();
  private readonly _paths = new Set<PathId>();
  private readonly _eventListeners = new Set<AnimationEventListener>();

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
    if (!this._transitions.has(transitionId)) return;
    if (this._engine) {
      this._engine.animationDestroyTransition(transitionId);
    }
    this._transitions.delete(transitionId);
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

  onEvent(listener: AnimationEventListener): () => void {
    return this.on('animation', listener);
  }

  clearListeners(): void {
    this._eventListeners.clear();
  }

  step(dt?: number): void {
    if (!this._engine) return;
    if (dt !== undefined && this._engine.animationStep) {
      this._engine.animationStep(dt);
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
    this._eventListeners.clear();
    this._engine = null;
  }
}
