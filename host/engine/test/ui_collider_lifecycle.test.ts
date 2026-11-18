import { describe, expect, it } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '../src';

describe('UI collider lifecycle', () => {
  it('removes the collider before the core destroys its UI model', () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const ui = realm.createUi({});
      realm.addCollider(ui.entityId, { type: 'rectangle', halfExtents: [20, 10] });
      realm.flush();
      realm.destroyUi(ui);
      expect(() => realm.flush()).not.toThrow();
      expect(() => realm.flush()).not.toThrow();
    } finally {
      runtime.dispose();
    }
  });
});
