import { expect, it } from 'bun:test';
import type { MultiverseRuntime } from '@galfus/engine';
import { runDemoLoop } from '../src/common/loop';

it('ignores an exit key while composition is active, then stops exactly once', async () => {
  const listeners = new Map<string, (event: any) => void>();
  let stopped = 0;
  let composing = true;
  const runtime = {
    on: (type: string, listener: (event: any) => void) => listeners.set(type, listener),
    start: () => {},
    stop: () => {
      stopped++;
    }
  } as unknown as MultiverseRuntime;
  const done = runDemoLoop(runtime, {
    windowId: 1 as any,
    maxFrames: 10,
    exitKeys: ['escape'],
    canExit: () => !composing
  });
  const escape = {
    type: 'input',
    state: 'pressed',
    logicalKey: 'Escape',
    physicalKey: 'escape',
    modifiers: { shift: false, ctrl: false, alt: false, superKey: false }
  };
  listeners.get('keyboard')!(escape);
  expect(stopped).toBe(0);
  composing = false;
  listeners.get('keyboard')!(escape);
  listeners.get('tick')!({ frameId: 10 });
  await done;
  expect(stopped).toBe(1);
});
