import Fuse from 'fuse.js';
import type { DemoDescriptor } from './catalog';

export function createCatalogSearch(catalog: readonly DemoDescriptor[]) {
  const fuseIndex = new Fuse(catalog, {
    keys: [
      { name: 'id', weight: 3.0 },
      { name: 'aliases', weight: 2.5 },
      { name: 'title', weight: 2.0 },
      { name: 'tags', weight: 1.5 },
      { name: 'category', weight: 1.0 },
      { name: 'description', weight: 0.8 }
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true
  });

  /** Finds a demo by exact `id` or `alias` (case-insensitive). */
  function findDemo(query: string): DemoDescriptor | undefined {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return undefined;
    return catalog.find(
      (d) =>
        d.id.toLowerCase() === normalized || d.aliases.some((a) => a.toLowerCase() === normalized)
    );
  }

  /** Filters the catalog by category name (case-insensitive substring or exact match). */
  function filterDemosByCategory(category?: string): readonly DemoDescriptor[] {
    if (!category || category.toLowerCase() === 'all') return catalog;
    const norm = category.trim().toLowerCase();
    return catalog.filter((d) => d.category.toLowerCase().includes(norm));
  }

  /** Performs a fuzzy search across `id`, `aliases`, `title`, `tags`, `category`, and `description`. */
  function fuzzySearchDemos(query: string, category?: string): readonly DemoDescriptor[] {
    const pool = filterDemosByCategory(category);
    const trimmed = query.trim();
    if (!trimmed) return pool;

    const exact = findDemo(trimmed);
    const results = fuseIndex.search(trimmed).map((r) => r.item);
    const filtered = category ? results.filter((d) => pool.includes(d)) : results;

    if (exact && (!category || pool.includes(exact))) {
      return [exact, ...filtered.filter((d) => d.id !== exact.id)];
    }
    return filtered;
  }

  return { findDemo, filterDemosByCategory, fuzzySearchDemos };
}
