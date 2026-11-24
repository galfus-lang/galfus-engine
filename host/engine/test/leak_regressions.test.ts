import { describe, expect, test } from 'bun:test';
import { AnimationCoordinator } from '../src/animation/coordinator';
import { AudioManager } from '../src/audio/manager';
import { EcsWorld } from '../src/ecs/world';
import { Model2DComponent } from '../src/realm2d/components';
import { IdAllocator, type SoundId } from '../src/types';

describe('Leak regressions', () => {
  test('IdAllocator keeps internal _used set bounded on sequential allocations', () => {
    const alloc = new IdAllocator(1);
    alloc.markUsed(500);
    for (let i = 0; i < 1000; i++) {
      alloc.allocate();
    }
    const usedSet = (alloc as unknown as { _used: Set<number> })._used;
    expect(usedSet.size).toBe(0);
  });

  test('AudioManager cleans voices on unloadSound and reaps dead spatial voices on listener move', () => {
    const audio = new AudioManager();
    let voiceSeq = 0;
    const deadVoices = new Set<number>();
    const mockEngine = {
      audioLoadSound: () => {},
      audioUnloadSound: () => {},
      audioPlaySound: () => ++voiceSeq,
      audioPlaySoundSpatial: () => ++voiceSeq,
      audioUpdateSoundSpatial: (voiceId: number) => {
        if (deadVoices.has(voiceId)) throw new Error('VoiceNotFound');
      },
      audioStopSound: () => {},
      audioPauseSound: () => {},
      audioResumeSound: () => {},
      audioSetVolume: () => {},
      audioSetPanning: () => {}
    };
    audio.bindEngine(mockEngine as any);

    const s1 = audio.loadSound(new Uint8Array([1, 2, 3]));
    const s2 = audio.loadSound(new Uint8Array([4, 5, 6]));
    const v1 = audio.playSoundSpatial(s1, [1, 0, 0]);
    const v2 = audio.playSoundSpatial(s2, [2, 0, 0]);
    expect(audio.getActiveSpatialVoiceCount()).toBe(2);

    // Unloading s1 cleans up its spatial voice
    audio.unloadSound(s1 as SoundId);
    expect(audio.getActiveSpatialVoiceCount()).toBe(1);

    // When v2 finishes naturally in core and listener moves, it is reaped
    deadVoices.add(v2);
    audio.setListenerPosition(10, 0, 0);
    expect(audio.getActiveSpatialVoiceCount()).toBe(0);
    expect(v1).not.toBe(v2);
  });

  test('AnimationCoordinator auto-destroys completed ECS transitions and isolates worlds', () => {
    const coordinator = new AnimationCoordinator();
    const destroyed: number[] = [];
    const pendingEvents: any[] = [];
    const mockEngine = {
      animationCreateTransition: () => {},
      animationTransitionTo: () => {},
      animationDestroyTransition: (id: number) => destroyed.push(id),
      animationStep: () => {},
      animationGetValue: () => ({ type: 'vec2', value: [5, 6] }),
      animationPumpEvents: () => pendingEvents.splice(0)
    };
    coordinator.bindEngine(mockEngine as any);

    const worldA = new EcsWorld();
    const worldB = new EcsWorld();
    const entA = worldA.createEntity();
    const entB = worldB.createEntity();
    expect(entA).toBe(entB); // Same entityId across distinct worlds
    worldA.attachComponent(entA, new Model2DComponent(1));
    worldB.attachComponent(entB, new Model2DComponent(2));

    const tA = coordinator.animateEcsProperty(worldA, entA, 'position', [10, 0], {
      duration: 0.1
    })!;
    const tB = coordinator.animateEcsProperty(worldB, entB, 'position', [20, 0], {
      duration: 0.1
    })!;

    // Animating entB in worldB must not cancel entA in worldA
    expect(coordinator.getEcsBinding(tA)).toBeDefined();
    expect(coordinator.getEcsBinding(tB)).toBeDefined();

    // Completing tA destroys it automatically during step()
    pendingEvents.push({
      transitionId: tA,
      eventType: 'completed',
      value: { type: 'vec2', value: [10, 0] },
      elapsed: 0.1
    });
    coordinator.step(0.1);
    expect(coordinator.getEcsBinding(tA)).toBeUndefined();
    expect(destroyed).toContain(tA);
    expect(coordinator.getEcsBinding(tB)).toBeDefined();
  });
});
