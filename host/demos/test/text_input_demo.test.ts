import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime } from '@galfus/engine';
import { createTextInputScene } from '../src/host/text-input';
import { advanceFrame } from './test-helpers';
import { createMockInteractionEngine } from '../../engine/test/mock-core-interaction';

describe('text input demo', () => {
  it('edits fields, navigates by Tab, and displays composition state', () => {
    const events: PlatformEvent[] = [];
    const ime: Array<[number, number]> = [];
    let runtimeRef: any;
    const mockInteractions = createMockInteractionEngine((id) =>
      runtimeRef?.multiverse.getRealm(id)
    );
    const engine = new Proxy(
      {
        ...mockInteractions,
        multiverseDispatch: () => {
          mockInteractions.multiverseDispatch();
        },
        platformPumpEvents: () => events.splice(0),
        windowSetImeAllowed: (id: number, enabled: number) => ime.push([id, enabled]),
        multiverseResolve: () => ({
          targetBlocks: [
            {
              targetId: 1,
              invocations: [
                {
                  invocationId: 1,
                  realmId: 1,
                  resolvedViewport: [0, 0, 960, 720],
                  zIndex: 0,
                  filters: []
                }
              ]
            }
          ]
        })
      },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => {}) }
    ) as unknown as GalfusEngine;
    const transport = {
      engine,
      isInitialized: true,
      isDisposed: false,
      isRunning: false,
      startLoop: () => {},
      stopLoop: () => {},
      dispose: () => {}
    } as unknown as GalfusTransport;
    const runtime = createRuntime(transport);
    runtimeRef = runtime;
    const windowId = runtime.platform.window.create();
    const target = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
    const { fields, ui, statusText, fieldStates } = createTextInputScene(runtime, target, windowId);
    const tab = (shift = false): PlatformEvent => ({
      kind: 'keyboard',
      type: 'input',
      windowId,
      physicalKey: 'tab',
      logicalKey: 'Tab',
      state: 'pressed',
      repeat: false,
      modifiers: { shift, ctrl: false, alt: false, superKey: false }
    });
    try {
      advanceFrame(runtime, transport);
      fields[0]!.requestFocus(windowId);
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(fields[0]!.focusable);
      expect(statusText.text).toBe('Focused: Name');
      fields[0]!.setSelection(1, 3);
      advanceFrame(runtime, transport);
      fields[0]!.setSelection(3);
      events.push({ kind: 'keyboard', type: 'textInput', windowId, text: '!' });
      events.push(tab());
      advanceFrame(runtime, transport);
      expect(fields[0]!.value).toBe('Ada!');
      expect(ui.getFocused(windowId)).toBe(fields[1]!.focusable);
      events.push(tab());
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(fields[2]!.focusable);
      events.push({ kind: 'keyboard', type: 'imePreedit', windowId, text: 'かな' });
      advanceFrame(runtime, transport);
      expect(fieldStates[2]!.textNode.text).toBe('かな');
      expect(statusText.text).toBe('Composing: Note');
      expect(fields[2]!.value).toBe('');
      events.push({ kind: 'keyboard', type: 'imeCommit', windowId, text: '仮名' });
      events.push({ kind: 'keyboard', type: 'textInput', windowId, text: '仮名' });
      events.push(tab(true));
      advanceFrame(runtime, transport);
      expect(fields[2]!.value).toBe('仮名');
      expect(ui.getFocused(windowId)).toBe(fields[1]!.focusable);
      expect(ime.length).toBeGreaterThan(0);
    } finally {
      runtime.dispose();
    }
  });
});
