import { describe, expect, it, spyOn } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { createNodeTransport } from '@galfus/transport-node';
import { createRuntime } from '../src/runtime';

describe('SVG element bounds', () => {
  it('caches real SVG text cluster metrics and invalidates them after edits', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    const readLayout = spyOn(transport.engine, 'realm2dGetSvgTextLayout');
    try {
      const realm = runtime.createRealm2D();
      const { svgId } = realm.createSvg({
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 100 50"><g transform="translate(10 5)"><text id="text" x="3" y="20" font-size="10">A é אב</text></g></svg>'
      });
      const layout = runtime.svg.getTextLayout(realm.realmId, svgId, 'text');
      expect(layout?.chunks).toEqual(['A é אב']);
      expect(layout?.clusters[0]?.transform[4]).toBeCloseTo(26);
      expect(layout?.clusters.some((cluster) => cluster.rightToLeft)).toBe(true);
      expect(runtime.svg.getTextLayout(realm.realmId, svgId, 'text')).toBe(layout);
      expect(readLayout).toHaveBeenCalledTimes(1);
      realm.setSvgText({ svgId }, 'text', 'abc');
      expect(runtime.svg.getTextLayout(realm.realmId, svgId, 'text')?.chunks).toEqual(['abc']);
      expect(readLayout).toHaveBeenCalledTimes(2);
      expect(runtime.svg.getTextLayout(realm.realmId, svgId, 'missing')).toBeUndefined();
    } finally {
      readLayout.mockRestore();
      runtime.dispose();
    }
  });
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
  it('reads shaped SVG text metrics through the Node-API transport', () => {
    const runtime = createRuntime(createNodeTransport({ headless: true }));
    try {
      const realm = runtime.createRealm2D();
      const { svgId } = realm.createSvg({
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><text id="text" x="3" y="20">Hello</text></svg>'
      });
      const layout = runtime.svg.getTextLayout(realm.realmId, svgId, 'text');
      expect(layout?.chunks).toEqual(['Hello']);
      expect(layout?.clusters.length).toBeGreaterThan(0);
      expect(layout?.clusters[0]?.transform[4]).toBeCloseTo(3);
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
