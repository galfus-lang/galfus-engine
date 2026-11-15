import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { createUi } from '../src';

describe('native SpritePanel UV updates', () => {
  it('queues UV changes without replacing the panel', () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const ui = createUi(runtime);
      const root = ui.createNativeRoot(realm, { width: 100, height: 100 });
      const sprite = root.root.addSpritePanel({ textureId: 1, tintColor: [0.2, 0.3, 0.4, 1] });
      sprite.setSpriteUvRect([0.5, 0, 1, 1]);
      expect(() => realm.flush()).not.toThrow();
      sprite.setSpriteUvRect([1, 1, 0, 0]);
      expect(() => realm.flush()).not.toThrow();
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
