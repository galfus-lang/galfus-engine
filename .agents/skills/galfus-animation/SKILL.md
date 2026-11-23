---
name: galfus-animation
description: >-
  Use this skill to configure keyframe and skeletal animations and native property transitions
  in Galfus Engine, including AnimationClip, AnimationPlayer3D, crossfading, loop modes,
  and core-evaluated transitions for models, cameras, lights, projectors/decals, and IK targets.
---

# Galfus Engine Animation System

Galfus Engine provides a hardware-accelerated skeletal and keyframe animation system. It supports multi-track sampling, cubic spline/linear interpolation, crossfade transitions, and skeletal skinning.

## 1. Core Concepts

- **KeyframeTrack**: Samples translation (`vec3`), rotation (`quat`), scale (`vec3`), or morph weights over time.
- **AnimationClip**: A named collection of tracks with a total duration.
- **AnimationPlayer3DComponent**: ECS component attached to an entity to coordinate playback, weights, and crossfading.
- **createAnimationSystem3D**: The ECS system that evaluates active player clips and applies transformations every tick.

## 2. Setting Up the Animation System

Attach the animation evaluation system to your realm's ECS world:

```typescript
import { createAnimationSystem3D, type AnimationPlayer3DComponent } from '@galfus/engine';

// Register the animation system with the realm's ECS world
const animSystem = createAnimationSystem3D(realm3d.world, realm3d);
realm3d.world.addSystem(animSystem);
```

## 3. Creating & Attaching an Animation Player

```typescript
import { attachAnimationPlayer3D } from '@galfus/engine';

// Attach player component to a character root entity
const player = attachAnimationPlayer3D(realm3d.world, characterEntity);

// Register animation clips (e.g. from glTF loader or procedurally created)
player.addClip(walkClip);
player.addClip(runClip);
player.addClip(idleClip);
```

## 4. Playback Controls & Loop Modes

Supported loop modes: `'repeat'` (infinite loop), `'once'` (plays once and stops), `'ping-pong'` (reverses at boundaries).

```typescript
// 1. Play idle animation looped at normal speed
player.play('Idle', 'repeat', 1.0);

// 2. Play attack animation once at 1.5x speed
player.play('Attack', 'once', 1.5);

// 3. Stop specific clip or all playing clips
player.stop('Walk');
// player.stop(); // Stops all
```

## 5. Smooth Crossfading Between Clips

Smoothly interpolate between two animation states (e.g. from Idle to Run) over a specified duration in seconds:

```typescript
// Crossfade from current active clip to 'Run' over 0.35 seconds
player.crossfade('Run', 0.35, 'repeat');
```

## 6. Procedural Keyframe Tracks

You can also construct `AnimationClip` instances manually in code:

```typescript
import type { AnimationClip, KeyframeTrack } from '@galfus/engine';

const bounceTrack: KeyframeTrack = {
  targetEntity: cube.entityId,
  path: 'translation',
  interpolation: 'linear',
  timestamps: new Float32Array([0.0, 0.5, 1.0]),
  values: new Float32Array([
    0,
    0,
    0, // t = 0.0s: position [0, 0, 0]
    0,
    2,
    0, // t = 0.5s: position [0, 2, 0]
    0,
    0,
    0 // t = 1.0s: position [0, 0, 0]
  ])
};

const bounceClip: AnimationClip = {
  name: 'Bounce',
  duration: 1.0,
  tracks: [bounceTrack]
};

player.addClip(bounceClip);
player.play('Bounce', 'repeat');
```

## 7. Native Property Transitions (Projectors, Decals & IK Targets)

Use `runtime.animation.createTransition` and `transitionTo` to animate core properties with native easing and loop modes (`'once'`, `'loop'`, `'pingPong'`) without per-frame JS overhead:

```typescript
const animId = runtime.animation.createTransition(
  { type: 'vec4', value: [1.0, 0.25, 0.35, 0.95] },
  { duration: 2.0, easing: 'easeInOutSine', loopMode: 'pingPong' },
  { kind: 'projector3DColor', realmId: realm3d.realmId, projectorId }
);
runtime.animation.transitionTo(
  animId,
  { type: 'vec4', value: [0.2, 0.85, 1.0, 0.85] },
  { duration: 2.0, easing: 'easeInOutSine', loopMode: 'pingPong' }
);
```

Supported 3D projector & IK native `AnimationTarget` kinds:

- `projector3DTransform` (`vec3` position or `transform3D`), `projector3DColor` (`vec4`), `projector3DSize` (`vec3`), `projector3DFov` (`scalar`), `projector3DUvRect` (`vec4`), `projector3DAngleFade` (`scalar`)
- `ik3DTarget` (`vec3` world target for an active `ikId`)

## Best Practices

1. **ECS System Order**: Ensure `createAnimationSystem3D` runs before render synchronization in your tick pipeline.
2. **glTF Automatic Binding**: When using `@galfus/gltf-loader`, clips and skinning matrices are pre-configured automatically on instantiated models.
3. **Crossfade Hygiene**: Avoid triggering rapid, overlapping crossfades in the same frame; wait for transitions to complete or use discrete state machines.
