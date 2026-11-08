import { describe, expect, test } from 'bun:test';
import { DebugLatencyTracker } from '../src/debug/latency-tracker';

describe('DebugLatencyTracker', () => {
  test('tracks exact frame distance between hover event, style mutation, and GPU dispatch', () => {
    DebugLatencyTracker.enable();
    DebugLatencyTracker.clear();

    // Frame 10: Pointer input triggers hover over element "btn-play"
    DebugLatencyTracker.setFrameId(10);
    DebugLatencyTracker.recordInput(10, {
      kind: 'pointer',
      type: 'move',
      windowId: 1,
      pointerId: 1,
      pointerType: 'mouse',
      position: [100, 100],
      delta: [0, 0],
      pressure: 0
    });
    DebugLatencyTracker.recordHover(10, {
      type: 'svg',
      svgId: 1,
      elementId: 'btn-play'
    });

    const hover = DebugLatencyTracker.getHoverRecord('btn-play');
    expect(hover).toBeDefined();
    expect(hover?.frameId).toBe(10);
    expect(hover?.inputFrameId).toBe(10);

    // Case 1: Instant response in same frame (Frame 10)
    DebugLatencyTracker.recordStyleUpdate(10, 1, 'btn-play', 'fill', '#3b82f6');
    expect(DebugLatencyTracker.getPendingCount()).toBe(1);

    DebugLatencyTracker.recordDispatch(10);
    expect(DebugLatencyTracker.getPendingCount()).toBe(0);

    // Case 2: Response delayed by 1 frame (e.g. dispatched on next tick)
    DebugLatencyTracker.setFrameId(20);
    DebugLatencyTracker.recordInput(20, {
      kind: 'pointer',
      type: 'move',
      windowId: 1,
      pointerId: 1,
      pointerType: 'mouse',
      position: [150, 150],
      delta: [0, 0],
      pressure: 0
    });
    DebugLatencyTracker.recordHover(20, {
      type: 'svg',
      svgId: 1,
      elementId: 'btn-settings'
    });

    // Next frame (Frame 21) the style update arrives
    DebugLatencyTracker.setFrameId(21);
    DebugLatencyTracker.recordStyleUpdate(21, 1, 'btn-settings', 'fill', '#60a5fa');
    expect(DebugLatencyTracker.getPendingCount()).toBe(1);

    DebugLatencyTracker.recordDispatch(21);
    expect(DebugLatencyTracker.getPendingCount()).toBe(0);

    DebugLatencyTracker.disable();
  });
});
