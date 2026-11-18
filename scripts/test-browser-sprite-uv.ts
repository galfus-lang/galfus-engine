export const BROWSER_SPRITE_UV_SMOKE = `
        galfus.realm2dCreateSprite(77, 4, { dimensions: [1, 1] }, { position: [0, 0] });
        const sheet = new SpriteSheet({ textureId: 1, textureSize: [2, 1], grid: { columns: 2, rows: 1, frameSize: [1, 1], names: { right: 1 } } });
        const uv = sheet.uvRect('right');
        if (uv.join(',') !== '0.5,0,1,1') throw new Error('Sprite sheet UV calculation failed');
        sheet.applyToSprite({ setSpriteUvRect: (id, value) => galfus.realm2dSetSpriteUvRect(77, id, ...value) }, 4, 'right');
        let panelUv;
        sheet.applyToPanel({ setSpriteUvRect: (value) => { panelUv = value; } }, 'right');
        if (panelUv.join(',') !== uv.join(',')) throw new Error('SpritePanel frame application failed');
        let missingSpriteRejected = false;
        try { galfus.realm2dSetSpriteUvRect(77, 12345, 0, 0, 1, 1); } catch { missingSpriteRejected = true; }
        if (!missingSpriteRejected) throw new Error('Invalid sprite UV target was accepted');
        galfus.realm2dCreateUi(77, 5, {}, { position: [0, 0] });
        galfus.realm2dApplyUiCommands(77, 5, [
          { type: 'create', id: 1, kind: { type: 'panel' } },
          { type: 'create', id: 2, kind: { type: 'spritePanel', uvRect: [0, 0, 1, 1] } },
          { type: 'insert', parentId: 1, childId: 2 },
          { type: 'setSpriteUvRect', id: 2, uvRect: uv }
        ]);
`;
