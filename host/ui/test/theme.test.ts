import { describe, expect, it } from 'bun:test';
import type { UiCommandDesc } from '@galfus/transport-types';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { setup } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createUi, createUiTheme, mergeUiTheme } from '../src/index';

describe('component themes and style inheritance', () => {
  it('merges token and component overrides without mutating inputs', () => {
    const base = createUiTheme({
      components: { panel: { variants: { card: { opacity: 0.5, clip: true } } } }
    });
    const next = mergeUiTheme(base, {
      tokens: { typography: { body: { fontSize: 20 } } },
      components: { panel: { variants: { card: { opacity: 0.8 } } } }
    });
    expect(next.tokens.typography.body).toEqual({ fontSize: 20, fontWeight: 400, italic: false });
    expect(next.components.panel.variants?.card).toEqual({ opacity: 0.8, clip: true });
    expect(base.components.panel.variants?.card?.opacity).toBe(0.5);
    next.tokens.colors.text![0] = 0;
    expect(base.tokens.colors.text![0]).toBe(1);
  });

  it('resolves inheritance, state precedence, overrides, and subtree token scope', () => {
    const { runtime, realm, transport } = setup();
    const batches: UiCommandDesc[][] = [];
    transport.engine.realm2dApplyUiCommands = (_realm, _ui, commands) =>
      batches.push(structuredClone(commands as UiCommandDesc[]));
    try {
      const ui = createUi(runtime);
      const context = ui.createComponentRoot(realm, {
        width: 200,
        height: 100,
        theme: {
          tokens: { colors: { brand: [0.1, 0.2, 0.3, 1] }, sizes: { card: 40 } },
          components: {
            panel: {
              base: { opacity: 0.9 },
              variants: { card: { opacity: 0.7 } },
              states: {
                hover: { opacity: 0.6 },
                active: { opacity: 0.4 },
                disabled: { opacity: 0.2 }
              }
            }
          }
        }
      });
      const parent = context.root.addPanel();
      parent.setStyle({
        typography: { fontFamily: 'Example', fontSize: 18 },
        color: { token: 'colors.brand' },
        backgroundColor: [0.5, 0.5, 0.5, 1],
        width: { token: 'sizes.card' }
      });
      parent.setVariant('card');
      parent.setStyleState('hover', true);
      parent.setStyleState('active', true);
      const child = parent.addPanel();
      const inherited = child.addText('Inherited');
      const explicit = child.addText('Override', 12, { color: [1, 0, 0, 1] });
      expect(parent.resolvedStyle.kind.opacity).toBe(0.4);
      expect(parent.resolvedStyle.layout.width).toEqual({ type: 'exact', value: 40 });
      expect(child.resolvedStyle.kind.backgroundColor).toBeUndefined();
      expect(child.resolvedStyle.layout.width).toBeUndefined();
      expect(inherited.resolvedStyle.kind).toMatchObject({
        fontFamily: 'Example',
        fontSize: 18,
        color: [0.1, 0.2, 0.3, 1]
      });
      expect(explicit.resolvedStyle.kind).toMatchObject({
        fontFamily: 'Example',
        fontSize: 12,
        color: [1, 0, 0, 1]
      });
      child.setTokens({ colors: { brand: [0, 1, 0, 1] } });
      // Inherited resolved colors are values; token overrides affect styles resolved inside the subtree.
      child.setStyle({ color: { token: 'colors.brand' } });
      expect(inherited.resolvedStyle.kind.color).toEqual([0, 1, 0, 1]);
      expect(explicit.resolvedStyle.kind.color).toEqual([1, 0, 0, 1]);
      expect(context.getTheme().tokens.colors.brand).toEqual([0.1, 0.2, 0.3, 1]);
      parent.setStateStyle('disabled', { opacity: 0.1 });
      parent.setStyleState('disabled', true);
      expect(parent.resolvedStyle.kind.opacity).toBe(0.1);
      parent.setStateStyle('disabled');
      expect(parent.resolvedStyle.kind.opacity).toBe(0.2);
      parent.setStyleState('disabled', false);
      expect(parent.resolvedStyle.kind.opacity).toBe(0.4);
      parent.setStyle({ opacity: 0.8 });
      expect(parent.resolvedStyle.kind.opacity).toBe(0.8);
      parent.setProperties({ opacity: 0.95 });
      expect(parent.resolvedStyle.kind.opacity).toBe(0.95);
      context.flush();
      expect(batches).toHaveLength(1);
      context.dispose();
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('emits updates only for affected nodes and rolls theme changes back', () => {
    const { runtime, realm, transport } = setup();
    const batches: UiCommandDesc[][] = [];
    transport.engine.realm2dApplyUiCommands = (_realm, _ui, commands) =>
      batches.push(structuredClone(commands as UiCommandDesc[]));
    try {
      const ui = createUi(runtime);
      const context = ui.createComponentRoot(realm, { width: 100, height: 100 });
      const branch = context.root.addPanel();
      const label = branch.addText('one');
      const unaffected = context.root.addPanel().addText('two', 14, { color: [1, 0, 0, 1] });
      context.flush();
      branch.setStyle({ color: [0, 1, 0, 1] });
      context.flush();
      expect(batches[1]!.map((command) => ('id' in command ? command.id : -1))).toEqual([label.id]);
      expect(unaffected.resolvedStyle.kind.color).toEqual([1, 0, 0, 1]);
      context.patchTheme({ tokens: { typography: { body: { fontWeight: 700 } } } });
      expect(label.resolvedStyle.kind.fontWeight).toBe(700);
      context.discardChanges();
      expect(label.resolvedStyle.kind.fontWeight).toBe(400);
      expect(context.getTheme().tokens.typography.body?.fontWeight).toBe(400);
      expect(() => branch.setStyle({ color: { token: 'colors.missing' } })).toThrow(
        'Unknown UI token'
      );
      expect(context.syncState).toBe('synced');
      expect(label.resolvedStyle.kind.color).toEqual([0, 1, 0, 1]);
      expect(() => branch.setVariant('missing')).toThrow('Unknown panel variant');
      expect(() => label.setStyle({ backgroundColor: [1, 0, 0, 1] })).toThrow('Panel paint');
      context.patchTheme({ tokens: { sizes: { extra: 91 } } });
      context.setTheme({});
      expect(context.getTheme().tokens.sizes.extra).toBeUndefined();
      context.dispose();
      expect(() => context.setTheme({})).toThrow('disposed');
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('resolves box, border, radius and size tokens into ModelUI properties', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime);
      const context = ui.createComponentRoot(realm, { width: 100, height: 100 });
      const panel = context.root.addPanel();
      panel.setStyle({
        borderColor: { token: 'colors.accent' },
        borderWidth: { token: 'borders.thin' },
        borderRadius: { token: 'radii.medium' },
        padding: { token: 'spacing.small' },
        gap: { token: 'spacing.medium' },
        width: { token: 'sizes.medium' },
        layout: { minWidth: 12, direction: 'row' }
      });
      expect(panel.resolvedStyle.kind).toMatchObject({
        borderColor: [0.2, 0.5, 1, 1],
        borderWidth: [1, 1, 1, 1],
        borderRadius: [4, 4, 4, 4]
      });
      expect(panel.resolvedStyle.layout).toMatchObject({
        padding: [4, 4, 4, 4],
        gap: [8, 8],
        width: { type: 'exact', value: 32 },
        minWidth: 12,
        direction: 'row'
      });
      context.dispose();
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('applies token-driven layout changes to the real core', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const realm = runtime.createRealm2D(1);
      realm.createCamera({ orthoScale: 100 });
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 200, height: 100 }
      });
      runtime.multiverse.createInvocation({ realmId: 1, targetId: target });
      const ui = createUi(runtime);
      const context = ui.createComponentRoot(realm, {
        width: 200,
        height: 100,
        theme: { tokens: { sizes: { card: 40 } } }
      });
      const panel = context.root.addPanel();
      panel.setStyle({ width: { token: 'sizes.card' }, height: { type: 'exact', value: 20 } });
      panel.addText('Styled');
      context.flush();
      advanceFrame(runtime, transport);
      expect(realm.getUiLayout(context.handle, panel.id).absoluteRect[2]).toBe(40);
      context.patchTheme({ tokens: { sizes: { card: 70 } } });
      context.flush();
      advanceFrame(runtime, transport);
      expect(realm.getUiLayout(context.handle, panel.id).absoluteRect[2]).toBe(70);
      panel.setStyle({
        width: { token: 'sizes.card' },
        height: { type: 'exact', value: 20 },
        backgroundColor: { token: 'colors.accent' }
      });
      context.flush();
      context.patchTheme({
        tokens: { colors: { accent: [1, 0, 0] as unknown as [number, number, number, number] } }
      });
      expect(() => context.flush()).toThrow();
      expect(context.syncState).toBe('failed');
      context.discardChanges();
      expect(context.getTheme().tokens.colors.accent).toEqual([0.2, 0.5, 1, 1]);
      expect(panel.resolvedStyle.kind.backgroundColor).toEqual([0.2, 0.5, 1, 1]);
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
