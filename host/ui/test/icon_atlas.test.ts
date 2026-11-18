import { describe, expect, it, spyOn } from 'bun:test';
import { SpriteSheet, type SpriteUvRect } from '@galfus/engine';
import { PNG } from 'pngjs';
import { setup } from '../../engine/test/interactive-fixture';
import { createUi, UiIconAtlas } from '../src';
import { UI_ICONS_PNG_BASE64 } from '../src/icons/embedded';

describe('UI icon atlas', () => {
  it('ships the same complete PNG as the embedded runtime asset', async () => {
    const asset = new Uint8Array(
      await Bun.file(new URL('../assets/ui-icons.png', import.meta.url)).arrayBuffer()
    );
    const embedded = Uint8Array.from(atob(UI_ICONS_PNG_BASE64), (c) => c.charCodeAt(0));
    expect(embedded).toEqual(asset);
    const image = PNG.sync.read(Buffer.from(asset));
    expect([image.width, image.height]).toEqual([192, 48]);
    for (let frame = 0; frame < 16; frame++) {
      let visible = 0;
      for (let y = 0; y < 24; y++)
        for (let x = 0; x < 24; x++)
          visible +=
            image.data[
              ((Math.floor(frame / 8) * 24 + y) * image.width + (frame % 8) * 24 + x) * 4 + 3
            ]!;
      expect(visible).toBeGreaterThan(0);
    }
  });

  it('shares a lazy default per system and releases it on reset or disposal', () => {
    const f = setup();
    try {
      const create = spyOn(f.runtime.resources, 'loadTexture');
      const dispose = spyOn(f.runtime.resources, 'disposeTexture');
      const ui = createUi(f.runtime);
      expect(create).not.toHaveBeenCalled();
      const atlas = ui.icons;
      expect(ui.icons).toBe(atlas);
      expect(create).toHaveBeenCalledTimes(1);
      const first: SpriteUvRect[] = [],
        second: SpriteUvRect[] = [];
      const a = atlas.createAnimation('checkbox', 'unchecked', (uv) => first.push(uv));
      atlas.createAnimation('checkbox', 'checked', (uv) => second.push(uv));
      a.setState('checked');
      expect(first.at(-1)).toEqual(atlas.sheet.uvRect(1));
      expect(second).toEqual([atlas.sheet.uvRect(1)]);
      ui.reset();
      expect(dispose).toHaveBeenCalledWith(atlas.sheet.textureId);
      expect(ui.icons).not.toBe(atlas);
      const recreated = ui.icons.sheet.textureId;
      f.runtime.reset();
      expect(dispose).toHaveBeenCalledWith(recreated);
      const last = ui.icons.sheet.textureId;
      ui.dispose();
      expect(dispose).toHaveBeenCalledWith(last);
      expect(() => ui.icons).toThrow();
    } finally {
      f.runtime.dispose();
    }
  });

  it('uses custom frames and transitions without owning the custom texture', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const dispose = spyOn(f.runtime.resources, 'disposeTexture');
      const texture = f.runtime.resources.createTexture(new Uint8Array(16), {
        width: 4,
        height: 1,
        format: 'rgba8Unorm'
      });
      const sheet = new SpriteSheet({
        textureId: texture,
        textureSize: [4, 1],
        grid: { columns: 4, rows: 1, frameSize: [1, 1] }
      });
      const frames = [1, 2];
      const atlas = new UiIconAtlas(sheet, {
        checkbox: {
          states: { unchecked: 0, checked: 3 },
          transitions: { 'unchecked|checked': { frames, frameDuration: 0.1 } }
        }
      });
      frames[0] = 3;
      ui.setIconAtlas(atlas);
      expect(ui.icons).toBe(atlas);
      const updates: SpriteUvRect[] = [];
      const animation = ui.icons.createAnimation('checkbox', 'unchecked', (uv) => updates.push(uv));
      animation.setState('checked');
      expect(updates.at(-1)).toEqual(sheet.uvRect(1));
      animation.update(0.1);
      expect(updates.at(-1)).toEqual(sheet.uvRect(2));
      animation.update(0.1);
      expect(updates.at(-1)).toEqual(sheet.uvRect(3));
      expect(() => atlas.createAnimation('missing', 'unchecked', () => {})).toThrow();
      expect(
        () =>
          new UiIconAtlas(sheet, {
            invalid: {
              states: { off: 0 },
              transitions: { 'off|missing': { frames: [1], frameDuration: 1 } }
            }
          })
      ).toThrow();
      ui.setIconAtlas();
      expect(ui.icons).not.toBe(atlas);
      ui.dispose();
      expect(dispose.mock.calls.some(([id]) => id === texture)).toBe(false);
    } finally {
      f.runtime.dispose();
    }
  });
});
