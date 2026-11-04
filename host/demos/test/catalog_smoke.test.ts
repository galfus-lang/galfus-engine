import { describe, expect, it } from 'bun:test';
import {
  DEMO_CATALOG,
  DEMO_CATEGORIES,
  filterDemosByCategory,
  findDemo,
  fuzzySearchDemos
} from '../src/catalog';

describe('@galfus/demos catalog & headless smoke suite', () => {
  it('registers all 32 demos across 5 categories with unique IDs', () => {
    expect(DEMO_CATALOG.length).toBe(32);
    expect(DEMO_CATEGORIES.length).toBe(5);

    const ids = new Set(DEMO_CATALOG.map((d) => d.id));
    expect(ids.size).toBe(32);

    for (const cat of DEMO_CATEGORIES) {
      const entries = filterDemosByCategory(cat);
      expect(entries.length).toBeGreaterThan(0);
    }
  });

  it('resolves demos by exact ID, alias, and fuzzy search query', () => {
    expect(findDemo('3d5')?.id).toBe('3d5');
    expect(findDemo('textured-particles-3d')?.id).toBe('3d5');
    expect(findDemo('phys3d2')?.id).toBe('phys3d2');
    expect(findDemo('hinge-3d')?.id).toBe('phys3d3');
    expect(findDemo('hinge-2d')?.id).toBe('phys2d3');
    expect(findDemo('forces-3d')?.id).toBe('phys3d4');
    expect(findDemo('forces-2d')?.id).toBe('phys2d4');
    expect(findDemo('tutorial')?.id).toBe('tutorial');

    const particleMatches = fuzzySearchDemos('particles');
    expect(particleMatches.some((d) => d.id === '3d5')).toBe(true);
    expect(particleMatches.some((d) => d.id === '2d2')).toBe(true);

    const physics3dMatches = fuzzySearchDemos('rapier', 'Physics & Anchors');
    expect(physics3dMatches.some((d) => d.id === 'phys3d1')).toBe(true);
  });

  it('runs textured 3D/2D particle, Anchor, and Physics demos headlessly', async () => {
    const smokeIds = [
      '3d5',
      '2d2',
      'anchor1',
      'phys3d1',
      'phys3d2',
      'phys3d3',
      'phys3d4',
      'phys2d1',
      'phys2d2',
      'phys2d3',
      'phys2d4'
    ];

    for (const id of smokeIds) {
      const demo = findDemo(id);
      expect(demo).toBeDefined();
      await demo!.run({ headless: true, maxFrames: 2 });
    }
  }, 30000);

  it('runs all multiverse demos headlessly', async () => {
    const mvIds = ['mv1', 'mv2', 'mv3', 'mv4'];
    for (const id of mvIds) {
      const demo = findDemo(id);
      expect(demo).toBeDefined();
      await demo!.run({ headless: true, maxFrames: 2 });
    }
  }, 30000);

  it('runs all Realm 3D feature demos headlessly', async () => {
    const r3dIds = ['3d1', '3d2', '3d3', '3d4', '3d6', '3d7', '3d8', '3d9', '3d10'];
    for (const id of r3dIds) {
      const demo = findDemo(id);
      expect(demo).toBeDefined();
      await demo!.run({ headless: true, maxFrames: 2 });
    }
  }, 45000);

  it('runs all Realm 2D feature and animation demos headlessly', async () => {
    const r2dIds = ['2d1', '2d3', 'anim1'];
    for (const id of r2dIds) {
      const demo = findDemo(id);
      expect(demo).toBeDefined();
      await demo!.run({ headless: true, maxFrames: 2 });
    }
  }, 30000);

  it('runs all Host & Interaction demos headlessly', async () => {
    const hostIds = ['tutorial', 'interaction', 'text-input', 'trans-realm'];
    for (const id of hostIds) {
      const demo = findDemo(id);
      expect(demo).toBeDefined();
      await demo!.run({ headless: true, maxFrames: 2 });
    }
  }, 30000);
});
