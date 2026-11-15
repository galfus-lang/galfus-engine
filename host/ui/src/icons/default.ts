import { type ResourceManager, SpriteSheet } from '@galfus/engine';
import { UiIconAtlas, type UiIconDefinitions } from './atlas';
import { UI_ICONS_PNG_BASE64 } from './embedded';

const definitions: UiIconDefinitions = {
  checkbox: { states: { unchecked: 0, checked: 1, indeterminate: 2 } },
  radio: { states: { unchecked: 3, checked: 4 } },
  switch: { states: { off: 5, on: 6 } },
  select: { states: { closed: 7, open: 9 } },
  submenu: { states: { closed: 8, open: 7 } },
  chevron: { states: { down: 7, right: 8, up: 9, left: 10 } },
  check: { states: { default: 11 } },
  close: { states: { default: 12 } },
  menu: { states: { default: 13 } },
  more: { states: { default: 14 } },
  add: { states: { default: 15 } }
};

/** @internal Creates one runtime-owned default resource; the caller must release it. */
export function createDefaultIconAtlas(resources: ResourceManager): UiIconAtlas {
  const bytes = Uint8Array.from(atob(UI_ICONS_PNG_BASE64), (character) => character.charCodeAt(0));
  const textureId = resources.loadTexture(bytes, { label: 'galfus-ui-icons' });
  try {
    const sheet = new SpriteSheet({
      textureId,
      textureSize: [192, 48],
      grid: { columns: 8, rows: 2, frameSize: [24, 24] }
    });
    return new UiIconAtlas(sheet, definitions);
  } catch (error) {
    resources.disposeTexture(textureId);
    throw error;
  }
}
