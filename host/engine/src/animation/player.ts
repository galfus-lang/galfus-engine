/**
 * Multi-track Animation Player component and ECS evaluation system.
 */
import type { Transform3DComponent } from '../anchors/component';
import type { Component } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
import type { System } from '../ecs/system';
import type { EcsWorld } from '../ecs/world';
import { common } from '../math/index';
import type { Model3DComponent } from '../realm3d/components';
import type { Realm3D } from '../realm3d/realm';
import {
  blendPoses,
  clearAnimationPose,
  copyAnimationPose,
  createAnimationPose,
  evaluateClip,
  type AnimationPose
} from './blending';
import type { AnimationClip } from './clip';

export type AnimationLoopMode = 'once' | 'repeat' | 'ping-pong';

export interface ActiveClipState {
  clipName: string;
  clip: AnimationClip;
  time: number;
  weight: number;
  speed: number;
  loopMode: AnimationLoopMode;
  isPlaying: boolean;
  isForward: boolean;
}

export interface AnimationPlayer3DComponent extends Component {
  readonly type: 'AnimationPlayer3D';
  clips: Map<string, AnimationClip>;
  activeStates: Map<string, ActiveClipState>;
  fadeTransition?: {
    fromClip: string;
    toClip: string;
    duration: number;
    elapsed: number;
  };

  /** Adds a clip to the player repository */
  addClip(clip: AnimationClip): void;

  /** Starts playing a clip with an initial weight and loop mode */
  play(clipName: string, loopMode?: AnimationLoopMode, speed?: number): ActiveClipState | undefined;

  /** Stops playback of a specific clip or all active clips */
  stop(clipName?: string): void;

  /** Initiates a smooth crossfade from the currently playing clip to target clip */
  crossfade(
    toClipName: string,
    durationSecs: number,
    loopMode?: AnimationLoopMode
  ): ActiveClipState | undefined;
}

export function createAnimationPlayer3D(clips?: AnimationClip[]): AnimationPlayer3DComponent {
  const clipMap = new Map<string, AnimationClip>();
  if (clips) {
    for (const clip of clips) {
      clipMap.set(clip.name, clip);
    }
  }

  const player: AnimationPlayer3DComponent = {
    type: 'AnimationPlayer3D',
    clips: clipMap,
    activeStates: new Map(),

    addClip(clip: AnimationClip) {
      this.clips.set(clip.name, clip);
    },

    play(clipName: string, loopMode: AnimationLoopMode = 'repeat', speed = 1.0) {
      const clip = this.clips.get(clipName);
      if (!clip) return undefined;

      const state: ActiveClipState = {
        clipName,
        clip,
        time: 0,
        weight: 1.0,
        speed,
        loopMode,
        isPlaying: true,
        isForward: true
      };

      this.activeStates.set(clipName, state);
      return state;
    },

    stop(clipName?: string) {
      if (clipName) {
        this.activeStates.delete(clipName);
      } else {
        this.activeStates.clear();
      }
    },

    crossfade(toClipName: string, durationSecs: number, loopMode: AnimationLoopMode = 'repeat') {
      const targetClip = this.clips.get(toClipName);
      if (!targetClip) return undefined;

      // Find first playing clip to crossfade from
      let fromClipName: string | undefined;
      for (const [name, state] of this.activeStates) {
        if (state.isPlaying && state.weight > 0 && name !== toClipName) {
          fromClipName = name;
          break;
        }
      }

      const toState: ActiveClipState = {
        clipName: toClipName,
        clip: targetClip,
        time: 0,
        weight: fromClipName ? 0.0 : 1.0,
        speed: 1.0,
        loopMode,
        isPlaying: true,
        isForward: true
      };
      this.activeStates.set(toClipName, toState);

      if (fromClipName && durationSecs > 0) {
        this.fadeTransition = {
          fromClip: fromClipName,
          toClip: toClipName,
          duration: durationSecs,
          elapsed: 0
        };
      } else {
        this.fadeTransition = undefined;
        if (fromClipName) {
          this.activeStates.delete(fromClipName);
        }
      }

      return toState;
    }
  };

  return player;
}

// Scratch poses for zero-allocation ECS updates
const SCRATCH_COMBINED_POSE = createAnimationPose();
const SCRATCH_CLIP_POSE = createAnimationPose();
const SCRATCH_ACCUMULATOR_POSE = createAnimationPose();

/**
 * Creates the ECS System driving continuous animation playback and blending.
 */
export function createAnimationPlaybackSystem(realm3d?: Realm3D): System<EcsWorld> {
  return (world: EcsWorld, context) => {
    const playerEntities = world.query('AnimationPlayer3D');
    if (playerEntities.length === 0) return;

    const dt = context.dt;

    for (const playerEntity of playerEntities) {
      const player = world.getComponent<AnimationPlayer3DComponent>(
        playerEntity,
        'AnimationPlayer3D'
      );
      if (!player || player.activeStates.size === 0) continue;

      // 1. Advance crossfade transition if active
      if (player.fadeTransition) {
        const trans = player.fadeTransition;
        trans.elapsed += dt;
        const progress = common.clamp(trans.elapsed / trans.duration, 0, 1);

        const fromState = player.activeStates.get(trans.fromClip);
        const toState = player.activeStates.get(trans.toClip);

        if (fromState) fromState.weight = 1.0 - progress;
        if (toState) toState.weight = progress;

        if (progress >= 1.0) {
          if (fromState) player.activeStates.delete(trans.fromClip);
          player.fadeTransition = undefined;
        }
      }

      // 2. Advance time for all active playing clips
      for (const [_, state] of player.activeStates) {
        if (!state.isPlaying || state.speed === 0) continue;

        const dur = Math.max(0.0001, state.clip.duration);
        const delta = dt * state.speed;

        if (state.loopMode === 'repeat') {
          state.time = (state.time + delta) % dur;
          if (state.time < 0) state.time += dur;
        } else if (state.loopMode === 'ping-pong') {
          if (state.isForward) {
            state.time += delta;
            if (state.time >= dur) {
              state.time = dur;
              state.isForward = false;
            }
          } else {
            state.time -= delta;
            if (state.time <= 0) {
              state.time = 0;
              state.isForward = true;
            }
          }
        } else {
          // 'once'
          state.time += delta;
          if (state.time >= dur) {
            state.time = dur;
            state.isPlaying = false;
          }
        }
      }

      // 3. Evaluate and blend poses
      clearAnimationPose(SCRATCH_COMBINED_POSE);
      let isFirst = true;

      for (const [_, state] of player.activeStates) {
        if (state.weight <= 0) continue;

        clearAnimationPose(SCRATCH_CLIP_POSE);
        evaluateClip(state.clip, state.time, SCRATCH_CLIP_POSE);

        if (isFirst) {
          copyAnimationPose(SCRATCH_CLIP_POSE, SCRATCH_COMBINED_POSE);
          isFirst = false;
        } else {
          copyAnimationPose(SCRATCH_COMBINED_POSE, SCRATCH_ACCUMULATOR_POSE);
          blendPoses(
            SCRATCH_COMBINED_POSE,
            SCRATCH_ACCUMULATOR_POSE,
            SCRATCH_CLIP_POSE,
            state.weight
          );
        }
      }

      if (isFirst) continue; // No active clips with weight > 0

      // 4. Apply combined pose to ECS entities
      // Apply Translations
      for (const [id, t] of SCRATCH_COMBINED_POSE.translations) {
        const tf = world.getComponent<Transform3DComponent>(id, 'Transform3D');
        if (tf) {
          tf.position[0] = t[0];
          tf.position[1] = t[1];
          tf.position[2] = t[2];
          tf.isDirty = true;
        }
      }

      // Apply Rotations
      for (const [id, r] of SCRATCH_COMBINED_POSE.rotations) {
        const tf = world.getComponent<Transform3DComponent>(id, 'Transform3D');
        if (tf) {
          tf.rotation[0] = r[0];
          tf.rotation[1] = r[1];
          tf.rotation[2] = r[2];
          tf.rotation[3] = r[3];
          tf.isDirty = true;
        }
      }

      // Apply Scales
      for (const [id, s] of SCRATCH_COMBINED_POSE.scales) {
        const tf = world.getComponent<Transform3DComponent>(id, 'Transform3D');
        if (tf) {
          tf.scale[0] = s[0];
          tf.scale[1] = s[1];
          tf.scale[2] = s[2];
          tf.isDirty = true;
        }
      }

      // Apply Morph Weights
      for (const [id, weights] of SCRATCH_COMBINED_POSE.weights) {
        if (realm3d) {
          const model = world.getComponent<Model3DComponent>(id, 'Model3D');
          if (model) {
            realm3d.setModelMorphWeights(model.modelId, weights);
          }
        }
      }
    }
  };
}
