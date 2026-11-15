import { isKey, type MultiverseRuntime, type WindowId } from '@galfus/engine';
import type { KeyboardEvent } from '@galfus/transport-types';
import type { UiOverlayManager } from '@galfus/ui';

/** Runs a demo until its window closes, an exit key is pressed, or its frame limit is reached. */
export function runDemoLoop(
  runtime: MultiverseRuntime,
  options: {
    windowId?: WindowId;
    maxFrames?: number;
    exitKeys: string[];
    canExit?: (event: KeyboardEvent) => boolean;
  }
): Promise<void> {
  return new Promise<void>((resolve) => {
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      runtime.stop();
      resolve();
    };
    runtime.on('window', (event) => {
      if (event.type === 'closeRequested' && event.windowId === options.windowId) stop();
    });
    runtime.on('keyboard', (event) => {
      if (
        event.type === 'input' &&
        event.state === 'pressed' &&
        !event.repeat &&
        isKey(event, ...options.exitKeys) &&
        (options.canExit?.(event) ?? true)
      )
        stop();
    });
    runtime.on('tick', ({ frameId }) => {
      if (options.maxFrames !== undefined && frameId >= options.maxFrames) stop();
    });
    runtime.start();
  });
}

/** Let an overlay or active composition consume Escape before the demo exits. */
export function canExitAfterOverlays(event: KeyboardEvent, manager?: UiOverlayManager): boolean {
  return event.type !== 'input' || event.logicalKey !== 'Escape' || !manager?.consumeEscape();
}
