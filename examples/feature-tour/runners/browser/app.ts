/// <reference lib="dom" />

import {
  type GalfusBrowser,
  initializeGalfusBrowser,
  type GalfusBrowserWasmModule
} from '../../../../sdk/browser/galfus.ts';
import { runFeatureTour, type TourController, type TourFrameState } from '../../tour_runner.ts';

const canvasId = 'galfus-browser-tour';

declare global {
  var galfusBrowserWasmModule: Promise<GalfusBrowserWasmModule> | undefined;
}

function requiredElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`The browser feature tour page is missing ${selector}.`);
  }
  return element;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.status = 'failed';
  document.body.dataset.error = message;
  console.error('[Browser Tour Error]', error);
}

function bindControls(
  controller: TourController,
  galfus: GalfusBrowser,
  publishState: (state: TourFrameState) => void
): void {
  const actions: Record<string, () => void> = {
    previous: () => controller.previous(),
    pause: () => controller.togglePause(),
    next: () => controller.next(),
    restart: () => controller.restart()
  };
  const runAction = (action: string) => {
    const handler = actions[action];
    if (!handler) return;
    document.body.dataset.lastTourAction = action;
    handler();
    publishState(controller.getState());
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tour-action]')) {
    button.addEventListener('click', () => runAction(button.dataset.tourAction ?? ''));
  }

  const audioButton = requiredElement<HTMLButtonElement>('[data-tour-audio]');
  audioButton.addEventListener('click', () => {
    void galfus
      .enableAudio()
      .then(() => {
        audioButton.textContent = 'Sound On';
        audioButton.disabled = true;
      })
      .catch((error: unknown) => {
        console.warn('[Browser Tour Audio] Audio requires a user gesture:', error);
      });
  });

  window.addEventListener('keydown', (event) => {
    const actionsByKey: Record<string, string> = {
      ' ': 'pause',
      ArrowLeft: 'previous',
      ArrowRight: 'next',
      r: 'restart',
      R: 'restart'
    };
    const action = actionsByKey[event.key];
    if (action) {
      event.preventDefault();
      runAction(action);
    }
  });

  window.addEventListener('pagehide', controller.stop, { once: true });
  window.addEventListener('galfus-tour-stop', controller.stop, { once: true });
  document.body.dataset.controlsReady = 'true';
}

async function main(): Promise<void> {
  const wasmModule = globalThis.galfusBrowserWasmModule;
  if (!wasmModule) {
    throw new Error('The wasm-bindgen browser module did not start loading.');
  }

  const galfus = await initializeGalfusBrowser(await wasmModule);
  const canvas = requiredElement<HTMLCanvasElement>(`#${canvasId}`);
  const pauseButton = requiredElement<HTMLButtonElement>('[data-tour-action="pause"]');
  const progress = requiredElement<HTMLProgressElement>('[data-tour-progress]');
  const viewport = requiredElement<HTMLElement>('[data-tour-viewport]');
  const windowId = 1;
  let renderedFrames = 0;
  const publishState = (state: TourFrameState) => {
    const [width, height] = galfus.windowGetSize(windowId);
    document.body.dataset.status = 'running';
    document.body.dataset.renderedFrames = String(renderedFrames);
    document.body.dataset.roomIndex = String(state.roomIndex);
    document.body.dataset.paused = String(state.paused);
    document.body.dataset.viewport = `${width}x${height}`;
    progress.value = Math.max(0, Math.min(1, state.tourClock / state.duration));
    viewport.textContent = `${width} × ${height}`;
    pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
  };

  await runFeatureTour({
    engine: galfus,
    activeBinding: 'Browser / WASM',
    windowConfig: {
      canvasId,
      size: [Math.max(canvas.clientWidth, 1), Math.max(canvas.clientHeight, 1)]
    },
    nextFrame: nextAnimationFrame,
    onReady: (controller) => bindControls(controller, galfus, publishState),
    onFrame: (state) => {
      renderedFrames++;
      publishState(state);
    }
  });
  document.body.dataset.status = 'stopped';
}

main().catch(fail);
