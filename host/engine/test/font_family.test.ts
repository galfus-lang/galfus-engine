import { describe, expect, it } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { createNodeTransport } from '@galfus/transport-node';
import { createRuntime } from '../src';

describe('realm font families', () => {
  it.each([
    ['Bun', createBunTransport],
    ['Node', createNodeTransport]
  ] as const)(
    'registers fonts and rejects invalid families through %s',
    async (_name, createTransport) => {
      const runtime = createRuntime(createTransport({ headless: true }));
      try {
        const realm = runtime.createRealm2D();
        const font = new Uint8Array(
          await Bun.file(
            'engine/galfus-realm-2d/tests/fixtures/NotoSans-Variable-subset.ttf'
          ).arrayBuffer()
        );
        realm.registerFontGroup('Variable', [font]);
        realm.setFontFamily({ name: 'display', groups: ['Variable'], axes: { opsz: 14 } });
        expect(() => realm.registerFontGroup('Bad', [new Uint8Array([0, 1, 2])])).toThrow();
        expect(() => realm.setFontFamily({ name: 'bad', groups: ['Missing'] })).toThrow();
        const ui = realm.createUi({});
        realm.applyUiCommands(ui, [
          { type: 'create', id: 1, kind: { type: 'panel' } },
          {
            type: 'create',
            id: 2,
            kind: {
              type: 'text',
              text: 'office',
              fontFamily: 'display',
              fontWeight: 700,
              fontSize: 14
            }
          },
          { type: 'insert', parentId: 1, childId: 2 }
        ]);
        expect(() => realm.flush()).not.toThrow();
        expect(() => realm.removeFontFamily('display')).toThrow();
        expect(() => realm.removeFontGroup('Variable')).toThrow();
        expect(() => realm.removeFontFamily('default')).toThrow();
        realm.destroyUi(ui);
        realm.flush();
        expect(() => realm.removeFontFamily('display')).not.toThrow();
        expect(() => realm.removeFontGroup('Variable')).not.toThrow();
        expect(() => realm.removeFontGroup('Variable')).toThrow();
      } finally {
        runtime.dispose();
      }
    }
  );
});
