import { describe, expect, it } from 'bun:test';
import type { MultiverseRuntime } from '@galfus/engine';
import type { KeyboardEvent } from '@galfus/transport-types';
import { setup } from '../../engine/test/interactive-fixture';
import { advanceFrame } from './test-helpers';
import { createUi, UiButton } from '@galfus/ui';
import { canExitAfterOverlays, runDemoLoop } from '../src/common/loop';

const key = (windowId: number, logicalKey: string, repeat = false): KeyboardEvent => ({
  kind: 'keyboard',
  type: 'input',
  windowId,
  logicalKey,
  physicalKey: logicalKey,
  state: 'pressed',
  repeat,
  modifiers: { ctrl: false, shift: false, alt: false, superKey: false }
});

describe('demo Escape handling', () => {
  it('closes the top overlay first and exits on the next Escape', async () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const root = ui.createComponentRoot(f.realm, {
        width: 100,
        height: 100,
        windowId: f.windowId
      });
      const anchor = new UiButton(root.root, { label: 'Open' });
      f.transport.engine.realm2dGetUiLayout = () =>
        JSON.stringify({ absoluteRect: [0, 0, 100, 100] });
      root.flush();
      advanceFrame(f.runtime, f.transport);
      const manager = ui.createOverlayManager(root, f.windowId);
      const popover = manager.createPopover({
        anchor: anchor.panel,
        width: 40,
        height: 30,
        build: () => {}
      });
      popover.open();
      let keyboard: ((event: KeyboardEvent) => void) | undefined;
      let stopped = 0;
      const demoRuntime = {
        on: (type: string, callback: (event: KeyboardEvent) => void) => {
          if (type === 'keyboard') keyboard = callback;
        },
        start: () => {},
        stop: () => {
          stopped++;
        }
      } as unknown as MultiverseRuntime;
      const done = runDemoLoop(demoRuntime, {
        windowId: f.windowId,
        exitKeys: ['escape', 'q'],
        canExit: (event) => canExitAfterOverlays(event, manager)
      });
      const send = (event: KeyboardEvent) => {
        f.runtime.interaction.handleKeyboard(event);
        keyboard!(event);
      };
      send(key(f.windowId, 'Escape'));
      expect(popover.isOpen).toBe(false);
      expect(stopped).toBe(0);
      send(key(f.windowId, 'Escape', true));
      expect(stopped).toBe(0);
      send(key(f.windowId, 'Escape'));
      await done;
      expect(stopped).toBe(1);
    } finally {
      f.runtime.dispose();
    }
  });
});
