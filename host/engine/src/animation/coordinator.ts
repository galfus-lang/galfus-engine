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
import { assertValidLogicalId } from '@galfus/transport-types';

export type AnimationEventListener = (event: AnimationEvent) => void;

export class AnimationCoordinator {
  private _engine: GalfusEngine | null = null;
  private _nextTransitionId = 1;
  private _nextPathId = 1;
  private readonly _transitions = new Set<number>();
  private readonly _paths = new Set<number>();
  private readonly _eventListeners = new Set<AnimationEventListener>();

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
  }

  allocateTransitionId(): number {
    const id = this._nextTransitionId++;
    assertValidLogicalId(id, 'TransitionId');
    return id;
  }

  allocatePathId(): number {
    const id = this._nextPathId++;
    assertValidLogicalId(id, 'PathId');
    return id;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------
  createTransition(initialValue: AnimValue, config: TransitionConfig): number {
    const id = this.allocateTransitionId();
    if (this._engine) {
      this._engine.animationCreateTransition(id, initialValue, config);
    }
    this._transitions.add(id);
    return id;
  }

  bindTarget(transitionId: number, target: AnimationTarget): void {
    if (this._engine) {
      this._engine.animationBindTarget(transitionId, target);
    }
  }

  unbindTarget(transitionId: number): void {
    if (this._engine) {
      this._engine.animationUnbindTarget(transitionId);
    }
  }

  transitionTo(transitionId: number, targetValue: AnimValue, config: TransitionConfig): void {
    if (this._engine) {
      this._engine.animationTransitionTo(transitionId, targetValue, config);
    }
  }

  createScalarTransition(initialScalar: number, duration: number, delay = 0, easingId = 0): number {
    const id = this.allocateTransitionId();
    if (this._engine) {
      this._engine.animationCreateScalarTransition(id, initialScalar, duration, delay, easingId);
    }
    this._transitions.add(id);
    return id;
  }

  transitionToScalar(
    transitionId: number,
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
    transitionId: number,
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
    transitionId: number,
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

  getState(transitionId: number): TransitionState | undefined {
    return this._engine?.animationGetState(transitionId);
  }

  getValue(transitionId: number): AnimValue | undefined {
    return this._engine?.animationGetValue(transitionId);
  }

  destroyTransition(transitionId: number): void {
    if (!this._transitions.has(transitionId)) return;
    if (this._engine) {
      this._engine.animationDestroyTransition(transitionId);
    }
    this._transitions.delete(transitionId);
  }

  // ---------------------------------------------------------------------------
  // Path Followers
  // ---------------------------------------------------------------------------
  createPathFollow(commands: PathCommand[], config: PathFollowConfig): number {
    const id = this.allocatePathId();
    if (this._engine) {
      this._engine.animationCreatePathFollow(id, commands, config);
    }
    this._paths.add(id);
    return id;
  }

  bindPathFollowTarget(pathId: number, target: AnimationTarget): void {
    if (this._engine) {
      this._engine.animationBindPathFollowTarget(pathId, target);
    }
  }

  unbindPathFollowTarget(pathId: number): void {
    if (this._engine) {
      this._engine.animationUnbindPathFollowTarget(pathId);
    }
  }

  getPathFollowState(pathId: number): PathFollowState | undefined {
    return this._engine?.animationGetPathFollowState(pathId);
  }

  destroyPathFollow(pathId: number): void {
    if (!this._paths.has(pathId)) return;
    if (this._engine) {
      this._engine.animationDestroyPathFollow(pathId);
    }
    this._paths.delete(pathId);
  }

  // ---------------------------------------------------------------------------
  // Step & Lifecycle Events
  // ---------------------------------------------------------------------------
  step(dt: number): void {
    if (!this._engine) return;

    this._engine.animationStep(dt);

    if (this._eventListeners.size > 0) {
      const events = this._engine.animationPumpEvents();
      for (const event of events) {
        for (const listener of this._eventListeners) {
          listener(event);
        }
      }
    }
  }

  onEvent(listener: AnimationEventListener): () => void {
    this._eventListeners.add(listener);
    return () => {
      this._eventListeners.delete(listener);
    };
  }

  dispose(): void {
    if (this._engine) {
      for (const id of this._transitions) {
        this._engine.animationDestroyTransition(id);
      }
      for (const id of this._paths) {
        this._engine.animationDestroyPathFollow(id);
      }
    }
    this._transitions.clear();
    this._paths.clear();
    this._eventListeners.clear();
    this._engine = null;
  }
}
