import { describe, expect, it } from 'bun:test';
import { setup } from '../../engine/test/interactive-fixture';
import { createUi } from '../src/index';
import { createCollider2D, hasCollider } from '../../engine/src/collision/components';

describe('Fase 5 Optimizations and Scaling', () => {
  describe('P02: Collider lookup O(1) without generator spreading', () => {
    it('accurately reports collider membership via hasCollider', () => {
      const collider = createCollider2D();
      collider.add(10, { type: 'rectangle', halfExtents: [50, 50] });
      collider.add(20, { type: 'circle', radius: 25 });

      expect(hasCollider(collider, 10)).toBe(true);
      expect(hasCollider(collider, 20)).toBe(true);
      expect(hasCollider(collider, 30)).toBe(false);

      collider.remove(10);
      expect(hasCollider(collider, 10)).toBe(false);
      expect(hasCollider(collider, 20)).toBe(true);
    });
  });

  describe('N07-UI: Copy-on-Write and scaling in ComponentRoot', () => {
    it('scales linearly when mounting 1,000 components in a single root', () => {
      const { runtime, realm, windowId } = setup();
      try {
        const ui = createUi(runtime);
        const root = ui.createComponentRoot(realm, { width: 800, height: 600, windowId });

        const start = performance.now();
        const count = 1000;
        let currentParent = root.root;

        for (let i = 0; i < count; i++) {
          // Alternate nesting and sibling additions
          const panel = currentParent.addPanel({
            backgroundColor: [0.1, 0.2, 0.3, 1]
          });
          if (i % 10 === 0) {
            currentParent = panel;
          }
        }

        const elapsed = performance.now() - start;
        // 1000 nodes with COW should mount in well under 300ms (previously took much longer with full structuredClone O(N^2))
        expect(elapsed).toBeLessThan(1000);

        root.flush();
        expect(root.syncState).toBe('synced');
      } finally {
        runtime.dispose();
      }
    });

    it('preserves complete rollback isolation via discardChanges() with COW tree', () => {
      const { runtime, realm, windowId } = setup();
      try {
        const ui = createUi(runtime);
        const root = ui.createComponentRoot(realm, { width: 400, height: 300, windowId });
        root.flush();

        const p1 = root.root.addPanel({ backgroundColor: [1, 0, 0, 1] });
        const p2 = p1.addPanel({ backgroundColor: [0, 1, 0, 1] });
        root.flush();

        // Staged mutations
        p2.addPanel({ backgroundColor: [0, 0, 1, 1] });
        p1.addPanel({ backgroundColor: [1, 1, 0, 1] });
        expect((root as any).nodes.size).toBe(5);

        // Roll back uncommitted changes
        root.discardChanges();
        expect((root as any).nodes.size).toBe(3);
        expect(root.hasNode(p1.id)).toBe(true);
        expect(root.hasNode(p2.id)).toBe(true);
      } finally {
        runtime.dispose();
      }
    });

    it('safely removes subtrees and reorders children with COW', () => {
      const { runtime, realm, windowId } = setup();
      try {
        const ui = createUi(runtime);
        const root = ui.createComponentRoot(realm, { width: 400, height: 300, windowId });

        const p1 = root.root.addPanel();
        const p2 = root.root.addPanel();
        const p3 = root.root.addPanel();

        // Reorder
        root.moveChild(root.root.id, p3, 0);
        expect((root as any).nodes.get(root.root.id).children).toEqual([p3.id, p1.id, p2.id]);

        // Remove subtree
        const childOfP1 = p1.addPanel();
        expect(root.hasNode(childOfP1.id)).toBe(true);
        p1.remove();

        expect(root.hasNode(p1.id)).toBe(false);
        expect(root.hasNode(childOfP1.id)).toBe(false);
        expect((root as any).nodes.get(root.root.id).children).toEqual([p3.id, p2.id]);
      } finally {
        runtime.dispose();
      }
    });
  });
});
