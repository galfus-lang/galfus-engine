import { describe, expect, it } from 'bun:test';
import { MultiverseCoordinator, type RealmConnector } from '../src/multiverse/index';
import type { GalfusEngine } from '@galfus/transport-types';
import { CORE_RESERVED_RANGE_START, GalfusPolicyError } from '@galfus/transport-types';

describe('@galfus/engine > Multiverse', () => {
  it('enforces ID policy on targets and invocations', () => {
    const coordinator = new MultiverseCoordinator();

    expect(() => {
      coordinator.createTarget(CORE_RESERVED_RANGE_START, {
        kind: { type: 'texture', width: 640, height: 480 }
      });
    }).toThrow(GalfusPolicyError);

    expect(() => {
      coordinator.createInvocation(CORE_RESERVED_RANGE_START + 1, {
        realmId: 1,
        targetId: 1,
        viewport: { width: { px: 640 }, height: { px: 480 } }
      });
    }).toThrow(GalfusPolicyError);
  });

  it('registers, syncs, and disposes realms with mock engine', () => {
    const coordinator = new MultiverseCoordinator();
    const calls: string[] = [];

    const mockEngine = {
      multiverseCreateTarget: (id: number) => calls.push(`createTarget:${id}`),
      multiverseDestroyTarget: (id: number) => calls.push(`destroyTarget:${id}`),
      multiverseCreateInvocation: (id: number) => calls.push(`createInv:${id}`),
      multiverseDestroyInvocation: (id: number) => calls.push(`destroyInv:${id}`),
      multiverseUnregisterRealm: (id: number) => calls.push(`unregRealm:${id}`),
      multiverseResolve: () => ({ targetBlocks: [] }),
      multiverseDispatch: (f: number, dt: number) => calls.push(`dispatch:${f}:${dt}`)
    } as unknown as GalfusEngine;

    coordinator.bindEngine(mockEngine);

    const mockRealm: RealmConnector = {
      realmId: 10,
      realmKind: '2d',
      bindEngine: () => calls.push('realm:bind'),
      sync: () => calls.push('realm:sync'),
      dispose: () => calls.push('realm:dispose')
    };

    coordinator.registerRealm(mockRealm);
    coordinator.createTarget(1, { kind: { type: 'texture', width: 800, height: 600 } });
    coordinator.createInvocation(100, {
      realmId: 10,
      targetId: 1,
      viewport: { width: { px: 800 }, height: { px: 600 } }
    });

    coordinator.syncAllRealms({ time: 0, dt: 0.016, frameId: 1, engine: mockEngine });
    const schedule = coordinator.resolve();
    expect(schedule).toBeDefined();

    coordinator.dispatch(1, 0.016);
    coordinator.dispose();

    expect(calls).toContain('realm:bind');
    expect(calls).toContain('createTarget:1');
    expect(calls).toContain('createInv:100');
    expect(calls).toContain('realm:sync');
    expect(calls).toContain('dispatch:1:0.016');
    expect(calls).toContain('destroyInv:100');
    expect(calls).toContain('realm:dispose');
    expect(calls).toContain('destroyTarget:1');
  });
});
