import { describe, expect, it } from 'bun:test';
import { createUi } from '../src';
import { setup } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';

describe('UI presentation ownership', () => {
  it('prevents competing focus systems and permits replacement after disposal', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      expect(() => createUi(f.runtime)).toThrow('one UiSystem');
      ui.reset();
      expect(() => createUi(f.runtime)).toThrow('one UiSystem');
      f.runtime.reset();
      expect(() => createUi(f.runtime)).toThrow('one UiSystem');
      const realm = f.runtime.createRealm2D(2);
      const root = ui.createComponentRoot(realm, { width: 100, height: 100 });
      root.flush();
      ui.dispose();
      const replacement = createUi(f.runtime);
      replacement.dispose();
    } finally {
      f.runtime.dispose();
    }
  });
  it('allows one overlay owner per window and releases it on disposal', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const first = ui.createComponentRoot(f.realm, {
        width: 400,
        height: 300,
        windowId: f.windowId
      });
      first.flush();
      advanceFrame(f.runtime, f.transport);
      const firstManager = ui.createOverlayManager(first, f.windowId);
      const realm2 = f.runtime.createRealm2D(2);
      realm2.createCamera({ orthoScale: 300 });
      const second = ui.createComponentRoot(realm2, {
        width: 400,
        height: 300,
        windowId: f.windowId
      });
      second.flush();
      expect(() => ui.createOverlayManager(second, f.windowId)).toThrow(
        'one overlay manager may own a window'
      );
      const otherWindow = f.runtime.platform.window.create();
      const otherRoot = ui.createComponentRoot(realm2, {
        width: 100,
        height: 100,
        windowId: otherWindow
      });
      otherRoot.flush();
      const otherManager = ui.createOverlayManager(otherRoot, otherWindow);
      otherManager.dispose();
      firstManager.dispose();
      const replacement = ui.createOverlayManager(second, f.windowId);
      replacement.dispose();
      ui.dispose();
    } finally {
      f.runtime.dispose();
    }
  });
});
