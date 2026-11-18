import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import type { PointerEvent } from '@galfus/transport-types';
import { button, move } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createEditorPreview } from '../../demos/src/ui/ui8-preview';
import { createUi } from '../src';

describe('SpritePanel interaction surface', () => {
  const windowTest = process.env.GALFUS_UI_WINDOW_TEST === '1' ? it : it.skip;
  windowTest('routes a window click through a ModelUI SpritePanel to a 3D collider', () => {
    const transport = createBunTransport({ headless: false });
    const runtime = createRuntime(transport);
    try {
      const windowId = runtime.platform.window.create({
        title: 'UI texture interaction test',
        size: [600, 400]
      });
      const [windowWidth, windowHeight] = runtime.platform.window.getSize(windowId);
      const target = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
      const texture = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 240, height: 160 }
      });
      const realm = runtime.createRealm2D();
      realm.createCamera({ orthoScale: windowHeight });
      runtime.multiverse.createInvocation({
        realmId: realm.realmId,
        targetId: target,
        clearColor: [0, 0, 0, 1]
      });
      const preview = createEditorPreview(runtime, texture);
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, {
        width: windowWidth,
        height: windowHeight,
        windowId
      });
      const panel = root.root.addSpritePanel(
        { textureId: texture },
        { width: { type: 'exact', value: 240 }, height: { type: 'exact', value: 160 } }
      );
      root.flush();
      runtime.multiverse.bindTargetTexture({
        sourceTargetId: texture,
        realmId: realm.realmId,
        slot: 'panel-target'
      });
      const disconnect = runtime.interaction.connectUiSurface({
        realmId: realm.realmId,
        uiId: root.uiId,
        elementId: panel.id,
        slot: 'panel-target'
      });
      let clicks = 0;
      const listener = runtime.interactive(preview.realm.realmId, {
        type: 'collider',
        entityId: preview.cube.entityId
      });
      listener.on('click', () => clicks++);
      for (let i = 0; i < 4; i++) advanceFrame(runtime, transport);
      const click = () => {
        runtime.interaction.handle(move(windowId, 120, 80) as PointerEvent);
        runtime.interaction.handle(button(windowId, 120, 80, 'pressed') as PointerEvent);
        runtime.interaction.handle(button(windowId, 120, 80, 'released') as PointerEvent);
      };
      click();
      expect(clicks).toBe(1);
      disconnect();
      for (let i = 0; i < 2; i++) advanceFrame(runtime, transport);
      click();
      expect(clicks).toBe(1);
      listener.dispose();
      ui.dispose();
      preview.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
