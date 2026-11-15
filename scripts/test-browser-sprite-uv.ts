export const BROWSER_SPRITE_UV_SMOKE = `
        galfus.realm2dCreateSprite(77, 4, { dimensions: [1, 1] }, { position: [0, 0] });
        galfus.realm2dSetSpriteUvRect(77, 4, 0.5, 0, 1, 1);
        let missingSpriteRejected = false;
        try { galfus.realm2dSetSpriteUvRect(77, 12345, 0, 0, 1, 1); } catch { missingSpriteRejected = true; }
        if (!missingSpriteRejected) throw new Error('Invalid sprite UV target was accepted');
        galfus.realm2dCreateUi(77, 5, {}, { position: [0, 0] });
        galfus.realm2dApplyUiCommands(77, 5, [
          { type: 'create', id: 1, kind: { type: 'panel' } },
          { type: 'create', id: 2, kind: { type: 'spritePanel', uvRect: [0, 0, 1, 1] } },
          { type: 'insert', parentId: 1, childId: 2 },
          { type: 'setSpriteUvRect', id: 2, uvRect: [0.5, 0, 1, 1] }
        ]);
`;
