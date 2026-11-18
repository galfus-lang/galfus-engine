import { describe, expect, it } from 'bun:test';
import {
  createRuntime,
  type Model2DUIComponent,
  type Sprite2DComponent,
  SpriteAnimation,
  SpriteSheet
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { createUi, SpritePanel } from '../src';

describe('shared SpriteSheet', () => {
  it('loads the built-in icon texture and submits its frames to a native panel', () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const ui = createUi(runtime);
      const root = ui.createNativeRoot(realm, { width: 100, height: 100 });
      const atlas = ui.icons;
      const panel = root.root.addSpritePanel({ textureId: atlas.sheet.textureId });
      const icon = atlas.createAnimation('checkbox', 'unchecked', (uv) =>
        panel.setSpriteUvRect(uv)
      );
      icon.setState('checked');
      expect(() => realm.flush()).not.toThrow();
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('supplies the same frame to a Sprite2D and a native SpritePanel', () => {
    const runtime = createRuntime(createBunTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const texture = runtime.resources.createTexture(new Uint8Array(16).fill(255), {
        width: 2,
        height: 2,
        format: 'rgba8Unorm'
      });
      const sheet = new SpriteSheet({
        textureId: texture,
        textureSize: [2, 2],
        grid: { columns: 2, rows: 2, frameSize: [1, 1], names: { selected: 3 } }
      });
      const material = realm.createMaterial({ textureId: sheet.textureId });
      const sprite = realm.createSprite({ dimensions: [1, 1], materialId: material });
      const ui = createUi(runtime);
      const root = ui.createNativeRoot(realm, { width: 100, height: 100 });
      const panel = root.root.addSpritePanel({ textureId: sheet.textureId });
      sheet.applyToSprite(realm, sprite, 'selected');
      sheet.applyToPanel(panel, 'selected');
      const legacyPanel = new SpritePanel({ textureId: sheet.textureId });
      sheet.applyToPanel(legacyPanel, 'selected');
      const animation = new SpriteAnimation({
        sheet,
        setUvRect: (uvRect) => {
          realm.setSpriteUvRect(sprite, uvRect);
          panel.setSpriteUvRect(uvRect);
        },
        states: { off: 0, on: 'selected' },
        initialState: 'off',
        transitions: { 'off|on': { frames: [1, 2], frameDuration: 0.1 } }
      });
      animation.setState('on');
      animation.update(0.1);
      expect(realm.world.getComponent<Sprite2DComponent>(sprite, 'Sprite2D')!.desc.uvRect).toEqual(
        sheet.uvRect(2)
      );
      const model = realm.world.getComponent<Model2DUIComponent>(root.entityId, 'Model2DUI')!;
      expect(model.pendingCommands.flat()).toContainEqual({
        type: 'setSpriteUvRect',
        id: panel.id,
        uvRect: sheet.uvRect(2)
      });
      animation.update(0.1);
      const expected: [number, number, number, number] = [0.5, 0.5, 1, 1];
      expect(legacyPanel.uvRect).toEqual(expected);
      expect(realm.world.getComponent<Sprite2DComponent>(sprite, 'Sprite2D')!.desc.uvRect).toEqual(
        expected
      );
      expect(model.pendingCommands.flat()).toContainEqual({
        type: 'setSpriteUvRect',
        id: panel.id,
        uvRect: expected
      });
      expect(() => realm.flush()).not.toThrow();
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
