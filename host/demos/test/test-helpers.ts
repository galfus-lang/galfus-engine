import type { FrameCallback, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import type { MultiverseRuntime } from '@galfus/engine';

interface ControlledFrames {
  callback: FrameCallback;
  frameId: number;
  timeMs: number;
}

const frames = new WeakMap<MultiverseRuntime, ControlledFrames>();

/** Drives the runtime through a controlled transport callback in deterministic tests. */
export function advanceFrame(
  runtime: MultiverseRuntime,
  transport: GalfusTransport,
  dt = 0.016
): void {
  let controller = frames.get(runtime);
  if (!controller) {
    let callback: FrameCallback | undefined;
    transport.startLoop = (fn) => {
      callback = fn;
    };
    runtime.start();
    if (!callback) throw new Error('Transport did not register a frame callback');
    controller = { callback, frameId: 0, timeMs: 0 };
    frames.set(runtime, controller);
  }
  controller.timeMs += dt * 1000;
  controller.callback({
    timeMs: controller.timeMs,
    deltaMs: dt * 1000,
    dt,
    frameId: ++controller.frameId,
    fps: dt > 0 ? 1 / dt : 0
  });
}

export function move(windowId: number, x: number, y: number): PlatformEvent {
  return {
    kind: 'pointer',
    type: 'move',
    windowId,
    pointerId: 0,
    pointerType: 'mouse',
    position: [x, y],
    delta: [0, 0],
    pressure: 0
  };
}

export function button(
  windowId: number,
  x: number,
  y: number,
  state: 'pressed' | 'released'
): PlatformEvent {
  return {
    kind: 'pointer',
    type: 'button',
    windowId,
    pointerId: 0,
    pointerType: 'mouse',
    position: [x, y],
    button: 'primary',
    state,
    pressure: 0
  };
}

export function tab(windowId: number, shift = false): PlatformEvent {
  return {
    kind: 'keyboard',
    type: 'input',
    windowId,
    physicalKey: 'tab',
    logicalKey: 'Tab',
    state: 'pressed',
    repeat: false,
    modifiers: { shift, ctrl: false, alt: false, superKey: false }
  };
}
