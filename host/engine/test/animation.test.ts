import { describe, expect, it } from 'bun:test';
import type { AnimationEvent, GalfusEngine } from '@galfus/transport-types';
import { AnimationCoordinator } from '../src/animation/coordinator';

describe('@galfus/engine > AnimationCoordinator', () => {
  it('manages property transitions, path followers, and animation event dispatch', () => {
    const anim = new AnimationCoordinator();
    const calls: string[] = [];
    const eventsToPump: AnimationEvent[] = [];

    const mockEngine = {
      animationCreateScalarTransition: (id: number, val: number) =>
        calls.push(`createScalar:${id}:${val}`),
      animationTransitionToScalar: (id: number, target: number) =>
        calls.push(`transitionToScalar:${id}:${target}`),
      animationDestroyTransition: (id: number) => calls.push(`destroyTransition:${id}`),
      animationCreatePathFollow: (id: number) => calls.push(`createPath:${id}`),
      animationDestroyPathFollow: (id: number) => calls.push(`destroyPath:${id}`),
      animationStep: (dt: number) => calls.push(`step:${dt.toFixed(3)}`),
      animationPumpEvents: () => [...eventsToPump]
    } as unknown as GalfusEngine;

    anim.bindEngine(mockEngine);

    // 1. Create scalar transition
    const transId = anim.createScalarTransition(0.0, 1.0);
    expect(calls).toContain(`createScalar:${transId}:0`);

    anim.transitionToScalar(transId, 100.0, 0.5);
    expect(calls).toContain(`transitionToScalar:${transId}:100`);

    // 2. Create path follower
    const pathId = anim.createPathFollow(
      [
        { type: 'moveTo', to: [0, 0] },
        { type: 'lineTo', to: [10, 10] }
      ],
      { duration: 2.0 }
    );
    expect(calls).toContain(`createPath:${pathId}`);

    // 3. Step and pump events
    let receivedEvents = 0;
    anim.onEvent(() => {
      receivedEvents++;
    });

    eventsToPump.push({
      transitionId: transId,
      eventType: 'completed',
      value: { type: 'scalar', value: 100 },
      elapsed: 1.0
    });

    anim.step(0.016);
    expect(calls).toContain('step:0.016');
    expect(receivedEvents).toBe(1);

    // 4. Dispose
    anim.dispose();
    expect(calls).toContain(`destroyTransition:${transId}`);
    expect(calls).toContain(`destroyPath:${pathId}`);
  });
});
