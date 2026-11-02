import { describe, expect, it, spyOn } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { createNodeTransport } from '@galfus/transport-node';
import { createRuntime } from '../src/runtime';

describe('SVG element bounds', () => {
  it('reads SVG bounds through the Node-API transport', () => {
    const runtime = createRuntime(createNodeTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const { svgId } = realm.createSvg({
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect id="a" x="10" y="5" width="20" height="10"/></svg>'
      });
      expect(runtime.svg.getRect(realm.realmId, svgId, 'a')).toEqual({
        x: 10,
        y: 5,
        width: 20,
        height: 10,
        viewportWidth: 100,
        viewportHeight: 50
      });
    } finally {
      runtime.dispose();
    }
  });
  it('reads rendered viewport coordinates, caches them, and invalidates on SVG edits', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    const readRect = spyOn(transport.engine, 'realm2dGetSvgElementRect');
    try {
      const realm = runtime.createRealm2D();
      const { svgId } = realm.createSvg({
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 100 50"><g transform="translate(10 5)"><rect id="button" x="5" y="3" width="20" height="10"/></g></svg>'
      });
      const rect = runtime.svg.getRect(realm.realmId, svgId, 'button');
      expect(rect).toEqual({
        x: 30,
        y: 16,
        width: 40,
        height: 20,
        viewportWidth: 200,
        viewportHeight: 100
      });
      expect(runtime.svg.getRect(realm.realmId, svgId, 'button')).toBe(rect);
      expect(readRect).toHaveBeenCalledTimes(1);
      expect(runtime.svg.getRect(realm.realmId, svgId, 'missing')).toBeUndefined();
      realm.setSvgAttribute({ svgId }, 'button', 'width', '30');
      expect(runtime.svg.getRect(realm.realmId, svgId, 'button')?.width).toBe(60);
      expect(readRect).toHaveBeenCalledTimes(3);
      const animation = runtime.animation.createScalarTransition(30, 1, 0, 0, {
        kind: 'svgAttributeScalar',
        realmId: realm.realmId,
        svgId,
        elementId: 'button',
        attribute: 'width'
      });
      runtime.animation.transitionToScalar(animation, 40, 1);
      runtime.animation.step(0.5);
      expect(runtime.svg.getRect(realm.realmId, svgId, 'button')?.width).toBeCloseTo(70);
      runtime.animation.destroyTransition(animation);
      realm.setSvgSource(
        { svgId },
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><circle id="button" cx="20" cy="20" r="5"/></svg>'
      );
      expect(runtime.svg.getRect(realm.realmId, svgId, 'button')?.width).toBe(10);
      realm.reset();
      expect(runtime.svg.getRect(realm.realmId, svgId, 'button')).toBeUndefined();
    } finally {
      readRect.mockRestore();
      runtime.dispose();
    }
  });
});
