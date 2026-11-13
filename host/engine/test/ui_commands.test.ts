import { describe, expect, it } from 'bun:test';
import { advanceFrame } from './controlled-transport';
import { setup } from './interactive-fixture';

describe('core UI command synchronization', () => {
  it('creates the model before applying queued batches and retries a failed batch', () => {
    const { runtime, transport, realm } = setup();
    const calls: string[] = [];
    let fail = true;
    try {
      transport.engine.realm2dCreateUi = () => {
        calls.push('create');
      };
      transport.engine.realm2dApplyUiCommands = (_realm, _ui, commands) => {
        calls.push(`commands:${JSON.stringify(commands)}`);
        if (fail) throw new Error('command rejected');
      };
      const ui = realm.createUi({});
      const commands = [{ type: 'create', id: 1, kind: { type: 'panel' } }] as const;
      realm.applyUiCommands(ui, commands);
      expect(() => advanceFrame(runtime, transport)).toThrow('command rejected');
      expect(calls[0]).toBe('create');
      expect(calls[1]).toContain('commands:');
      fail = false;
      advanceFrame(runtime, transport);
      expect(calls.filter((value) => value === 'create')).toHaveLength(1);
      expect(calls.filter((value) => value.startsWith('commands:'))).toHaveLength(2);
    } finally {
      runtime.dispose();
    }
  });
});
