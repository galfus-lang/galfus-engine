import { describe, expect, it } from 'bun:test';
import {
  createAnimationPlayer3D,
  createAnimationPlaybackSystem,
  type AnimationClip,
  type KeyframeTrack
} from '../src/animation/index';
import { blendPoses, createAnimationPose, evaluateClip } from '../src/animation/blending';
import { sampleTrack } from '../src/animation/clip';
import { createModel3D, type Model3DComponent } from '../src/realm3d/components';
import { EcsWorld } from '../src/ecs/world';
import { quat } from '../src/math/index';
import type { SystemContext } from '../src/ecs/system';

describe('@galfus/engine > Animation Clips, Sampling & Blending', () => {
  it('samples keyframe tracks with step, linear, and cubic spline interpolation', () => {
    // 1. Linear Translation Track: (t=0 -> [0, 0, 0], t=2 -> [10, 20, 30])
    const linearTrack: KeyframeTrack = {
      targetEntity: 1,
      path: 'translation',
      timestamps: new Float32Array([0.0, 2.0]),
      values: new Float32Array([0, 0, 0, 10, 20, 30]),
      interpolation: 'linear'
    };

    const out3 = new Float32Array(3);
    sampleTrack(linearTrack, 0.0, out3);
    expect(out3[0]).toBeCloseTo(0);
    expect(out3[1]).toBeCloseTo(0);
    expect(out3[2]).toBeCloseTo(0);

    sampleTrack(linearTrack, 1.0, out3); // t=1.0 is 50%
    expect(out3[0]).toBeCloseTo(5);
    expect(out3[1]).toBeCloseTo(10);
    expect(out3[2]).toBeCloseTo(15);

    sampleTrack(linearTrack, 3.0, out3); // after last keyframe clamped
    expect(out3[0]).toBeCloseTo(10);
    expect(out3[1]).toBeCloseTo(20);
    expect(out3[2]).toBeCloseTo(30);

    // 2. Linear Rotation Track (Quat SLERP): 0 deg -> 180 deg Y
    const qStart = quat.create(); // [0, 0, 0, 1]
    const qEnd = quat.fromValues(0, 1, 0, 0); // 180 deg Y
    const rotTrack: KeyframeTrack = {
      targetEntity: 1,
      path: 'rotation',
      timestamps: new Float32Array([0.0, 1.0]),
      values: new Float32Array([...qStart, ...qEnd]),
      interpolation: 'linear'
    };

    const out4 = new Float32Array(4);
    sampleTrack(rotTrack, 0.5, out4); // 90 deg Y
    expect(out4[1]).toBeCloseTo(Math.SQRT1_2);
    expect(out4[3]).toBeCloseTo(Math.SQRT1_2);

    // 3. Step Track
    const stepTrack: KeyframeTrack = {
      targetEntity: 1,
      path: 'scale',
      timestamps: new Float32Array([0.0, 1.0, 2.0]),
      values: new Float32Array([1, 1, 1, 2, 2, 2, 3, 3, 3]),
      interpolation: 'step'
    };

    sampleTrack(stepTrack, 0.99, out3);
    expect(out3[0]).toBeCloseTo(1);
    sampleTrack(stepTrack, 1.0, out3);
    expect(out3[0]).toBeCloseTo(2);
  });

  it('evaluates clips into AnimationPose and blends them mathematically', () => {
    const clipA: AnimationClip = {
      name: 'PoseA',
      duration: 1.0,
      tracks: [
        {
          targetEntity: 10,
          path: 'translation',
          timestamps: new Float32Array([0.0, 1.0]),
          values: new Float32Array([0, 0, 0, 0, 0, 0]),
          interpolation: 'linear'
        }
      ]
    };

    const clipB: AnimationClip = {
      name: 'PoseB',
      duration: 1.0,
      tracks: [
        {
          targetEntity: 10,
          path: 'translation',
          timestamps: new Float32Array([0.0, 1.0]),
          values: new Float32Array([10, 20, 30, 10, 20, 30]),
          interpolation: 'linear'
        }
      ]
    };

    const poseA = createAnimationPose();
    const poseB = createAnimationPose();
    const blendedPose = createAnimationPose();

    evaluateClip(clipA, 0.5, poseA);
    evaluateClip(clipB, 0.5, poseB);

    blendPoses(blendedPose, poseA, poseB, 0.5); // 50% blend

    const t = blendedPose.translations.get(10)!;
    expect(t).toBeDefined();
    expect(t[0]).toBeCloseTo(5);
    expect(t[1]).toBeCloseTo(10);
    expect(t[2]).toBeCloseTo(15);
  });

  it('drives ECS entities over time with AnimationPlayer3D and crossfade transitions', () => {
    const world = new EcsWorld();
    const playbackSystem = createAnimationPlaybackSystem();
    world.addSystem('update', playbackSystem);

    const targetEntity = world.createEntity();
    const model = createModel3D(1);
    model.setPosition(0, 0, 0);
    world.attachComponent(targetEntity, model);

    // Clip 1: Idle (Moves Y from 0 to 4 over 2 seconds)
    const idleClip: AnimationClip = {
      name: 'Idle',
      duration: 2.0,
      tracks: [
        {
          targetEntity,
          path: 'translation',
          timestamps: new Float32Array([0.0, 2.0]),
          values: new Float32Array([0, 0, 0, 0, 4, 0]),
          interpolation: 'linear'
        }
      ]
    };

    // Clip 2: Run (Moves X from 0 to 10 over 2 seconds)
    const runClip: AnimationClip = {
      name: 'Run',
      duration: 2.0,
      tracks: [
        {
          targetEntity,
          path: 'translation',
          timestamps: new Float32Array([0.0, 2.0]),
          values: new Float32Array([0, 0, 0, 10, 0, 0]),
          interpolation: 'linear'
        }
      ]
    };

    const playerComp = createAnimationPlayer3D([idleClip, runClip]);
    const playerEntity = world.createEntity();
    world.attachComponent(playerEntity, playerComp);

    // Play Idle
    playerComp.play('Idle', 'repeat');

    const stepFrame = (dt: number) => {
      const ctx: SystemContext = { time: 0, dt, frameId: 1 };
      world.step(ctx);
    };

    // Step 0.5s -> Y should reach ~1.0
    stepFrame(0.5);

    const m = world.getComponent<Model3DComponent>(targetEntity, 'Model3D')!;
    expect(m.localMatrix[12]).toBeCloseTo(0);
    expect(m.localMatrix[13]).toBeCloseTo(1.0);

    // Crossfade to Run over 1.0s
    playerComp.crossfade('Run', 1.0);

    // Step 0.5s into crossfade (progress = 50%)
    // Idle is at time 1.0s (Y = 2.0) with 50% weight -> contribution Y: 1.0
    // Run is at time 0.5s (X = 2.5) with 50% weight -> contribution X: 1.25
    stepFrame(0.5);

    expect(m.localMatrix[12]).toBeCloseTo(1.25);
    expect(m.localMatrix[13]).toBeCloseTo(1.0);

    // Step another 0.5s (crossfade finishes, 100% Run at time 1.0s -> X = 5.0)
    stepFrame(0.5);
    expect(playerComp.fadeTransition).toBeUndefined();
    expect(m.localMatrix[12]).toBeCloseTo(5.0);
    expect(m.localMatrix[13]).toBeCloseTo(0);
  });
});
