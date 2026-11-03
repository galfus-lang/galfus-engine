import type { FrameCallback, GalfusTransport } from '@galfus/transport-types';
import type { MultiverseRuntime } from '../src/runtime';

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
