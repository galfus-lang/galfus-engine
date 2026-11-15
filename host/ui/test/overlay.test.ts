import { describe, expect, it } from 'bun:test';
import type { KeyboardEvent, PointerEvent } from '@galfus/transport-types';
import type { Model2DComponent } from '@galfus/engine';
import { button, move, setup, tab } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../engine/test/controlled-transport';
import { createUi, UiButton } from '../src';

function fixture() {
  const f = setup();
  const ui = createUi(f.runtime);
  const root = ui.createComponentRoot(f.realm, { width: 100, height: 100, windowId: f.windowId });
  const trigger = new UiButton(root.root, { label: 'Open' });
  let anchorRect = [80, 80, 10, 10];
  let viewportRect = [0, 0, 100, 100];
  f.transport.engine.realm2dGetUiLayout = (_realm, model, id) =>
    JSON.stringify({
      absoluteRect:
        model === root.uiId ? (id === root.root.id ? viewportRect : anchorRect) : [4, 4, 10, 10],
      localRect: [0, 0, 0, 0],
      contentSize: [0, 0],
      clipRect: null,
      accumulatedOpacity: 1
    });
  root.flush();
  advanceFrame(f.runtime, f.transport);
  const manager = ui.createOverlayManager(root, f.windowId);
  return {
    ...f,
    ui,
    root,
    trigger,
    manager,
    setAnchorRect: (rect: number[]) => {
      anchorRect = rect;
    },
    setViewportRect: (rect: number[]) => {
      viewportRect = rect;
    }
  };
}

const escape = (windowId: number): KeyboardEvent => ({
  kind: 'keyboard',
  type: 'input',
  windowId,
  logicalKey: 'Escape',
  physicalKey: 'Escape',
  state: 'pressed',
  repeat: false,
  modifiers: { shift: false, ctrl: false, alt: false, superKey: false }
});

describe('overlay manager', () => {
  it('places and flips overlays, follows the anchor, and restores focus after Escape', () => {
    const f = fixture();
    try {
      f.runtime.interaction.handleKeyboard(tab(f.windowId) as KeyboardEvent);
      expect(f.trigger.getInteractionState(f.windowId).focus).toBe(true);
      let inside!: UiButton;
      const reasons: string[] = [];
      const overlay = f.manager.createPopover({
        anchor: f.trigger.panel,
        width: 30,
        height: 20,
        build: (root) => {
          inside = new UiButton(root.root, { label: 'Inside' });
          return inside.panel;
        },
        onClose: (reason) => reasons.push(reason)
      });
      overlay.open();
      const overlayRoot = overlay.root!;
      const model = f.realm.world.getComponent<Model2DComponent>(overlayRoot.entityId, 'Model2D')!;
      expect([model.localMatrix[4], model.localMatrix[5]]).toEqual([35, -14]);
      advanceFrame(f.runtime, f.transport);
      advanceFrame(f.runtime, f.transport);
      expect(inside.getInteractionState(f.windowId).focus).toBe(true);
      f.setAnchorRect([10, 10, 10, 10]);
      advanceFrame(f.runtime, f.transport);
      expect([model.localMatrix[4], model.localMatrix[5]]).toEqual([-25, 14]);
      overlay.setPlacement('right', 2);
      overlay.setSize(40, 10);
      expect([model.localMatrix[4], model.localMatrix[5]]).toEqual([-8, 35]);
      f.setViewportRect([0, 0, 50, 50]);
      advanceFrame(f.runtime, f.transport);
      expect([model.localMatrix[4], model.localMatrix[5]]).toEqual([5, 10]);
      f.manager.setViewport([0, 0, 40, 40]);
      expect([model.localMatrix[4], model.localMatrix[5]]).toEqual([-5, 10]);
      expect(() => f.manager.setViewport([0, 0, 0, 40])).toThrow();
      f.runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId: f.windowId,
        text: 'あ'
      });
      f.runtime.interaction.handleKeyboard(escape(f.windowId));
      expect(overlay.isOpen).toBe(true);
      f.runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imeDisabled',
        windowId: f.windowId
      });
      f.runtime.interaction.handleKeyboard(escape(f.windowId));
      expect(overlay.isOpen).toBe(false);
      expect(reasons).toEqual(['escape']);
      expect(f.trigger.getInteractionState(f.windowId).focus).toBe(true);
      expect(inside.isAttached).toBe(false);
    } finally {
      f.runtime.dispose();
    }
  });

  it('cleans nested layers and releases ownership when a close callback throws', () => {
    const f = fixture();
    try {
      let anchor!: UiButton;
      const closed: string[] = [];
      const parent = f.manager.createPopover({
        anchor: f.trigger.panel,
        width: 30,
        height: 20,
        build: (root) => {
          anchor = new UiButton(root.root, { label: 'Nested' });
        },
        onClose: () => {
          closed.push('parent');
        }
      });
      parent.open();
      advanceFrame(f.runtime, f.transport);
      const child = f.manager.createPopover({
        anchor: anchor.panel,
        width: 20,
        height: 10,
        build: () => {},
        onClose: () => {
          closed.push('child');
          throw new Error('close failure');
        }
      });
      child.open();
      expect(() => f.manager.dispose()).toThrow('close failure');
      expect(closed).toEqual(['child', 'parent']);
      expect(parent.isOpen).toBe(false);
      expect(child.isOpen).toBe(false);
      const replacement = f.ui.createOverlayManager(f.root, f.windowId);
      replacement.dispose();
    } finally {
      f.runtime.dispose();
    }
  });
  it('disposes the rest of the UI if an overlay close callback fails', () => {
    const f = fixture();
    try {
      const popover = f.manager.createPopover({
        anchor: f.trigger.panel,
        width: 30,
        height: 20,
        build: () => {},
        onClose: () => {
          throw new Error('close failure');
        }
      });
      popover.open();
      expect(() => f.ui.dispose()).toThrow('close failure');
      expect(f.root.syncState).toBe('disposed');
      expect(popover.isOpen).toBe(false);
      const replacement = createUi(f.runtime);
      replacement.dispose();
    } finally {
      f.runtime.dispose();
    }
  });
  it('closes nested overlays in order and does not restore focus on outside clicks', () => {
    const f = fixture();
    try {
      f.trigger.requestFocus(f.windowId);
      let nestedAnchor!: UiButton;
      const closed: string[] = [];
      const parent = f.manager.createPopover({
        anchor: f.trigger.panel,
        width: 30,
        height: 20,
        build: (root) => {
          nestedAnchor = new UiButton(root.root, { label: 'Nested' });
        },
        onClose: (reason) => closed.push(`parent:${reason}`)
      });
      parent.open();
      advanceFrame(f.runtime, f.transport);
      const child = f.manager.createPopover({
        anchor: nestedAnchor.panel,
        width: 20,
        height: 10,
        build: () => {},
        onClose: (reason) => closed.push(`child:${reason}`)
      });
      child.open();
      const parentModel = f.realm.world.getComponent<Model2DComponent>(
        parent.root!.entityId,
        'Model2D'
      )!;
      const childModel = f.realm.world.getComponent<Model2DComponent>(
        child.root!.entityId,
        'Model2D'
      )!;
      expect(childModel.zLayer).toBeGreaterThan(parentModel.zLayer);
      f.runtime.interaction.handle(move(f.windowId, 99, 99) as PointerEvent);
      f.runtime.interaction.handle(button(f.windowId, 99, 99, 'pressed') as PointerEvent);
      expect(closed).toEqual(['child:outside', 'parent:outside']);
      expect(f.ui.getFocused(f.windowId)).toBeUndefined();
      parent.open();
      advanceFrame(f.runtime, f.transport);
      const secondChild = f.manager.createPopover({
        anchor: nestedAnchor.panel,
        width: 20,
        height: 10,
        build: () => {},
        onClose: (reason) => closed.push(`child:${reason}`)
      });
      secondChild.open();
      parent.close();
      expect(closed.slice(-2)).toEqual(['child:parent-closed', 'parent:programmatic']);
    } finally {
      f.runtime.dispose();
    }
  });

  it('closes on anchor removal, window closure, and rejects an ambiguous presentation', () => {
    const f = fixture();
    try {
      const reasons: string[] = [];
      const popup = f.manager.createPopover({
        anchor: f.trigger.panel,
        width: 30,
        height: 20,
        build: () => {},
        onClose: (reason) => reasons.push(reason)
      });
      popup.open();
      f.trigger.remove();
      advanceFrame(f.runtime, f.transport);
      expect(reasons).toEqual(['anchor-removed']);
      f.root.discardChanges();
      popup.open();
      const other = f.runtime.platform.window.create();
      const targetId = f.runtime.multiverse.createTarget({
        kind: { type: 'window', windowId: other }
      });
      f.runtime.multiverse.createInvocation({ realmId: 1, targetId });
      f.schedule.targetBlocks.push({
        targetId,
        invocations: [
          {
            invocationId: 2,
            realmId: 1,
            resolvedViewport: [0, 0, 100, 100],
            zIndex: 0,
            filters: []
          }
        ]
      });
      advanceFrame(f.runtime, f.transport);
      expect(reasons).toEqual(['anchor-removed', 'context-lost']);
      expect(() => popup.open()).toThrow('exactly one direct presentation');
      f.runtime.platform.window.close(other);
      advanceFrame(f.runtime, f.transport);
      popup.open();
      f.runtime.platform.window.close(f.windowId);
      expect(popup.isOpen).toBe(false);
      expect(reasons.at(-1)).toBe('window-closed');
    } finally {
      f.runtime.dispose();
    }
  });

  it('dismisses a nested overlay while preserving the parent when clicking parent content', () => {
    const f = fixture();
    try {
      let anchor!: UiButton;
      const parent = f.manager.createPopover({
        anchor: f.trigger.panel,
        width: 40,
        height: 30,
        build: (root) => {
          anchor = new UiButton(root.root, { label: 'Nested trigger' });
        }
      });
      parent.open();
      advanceFrame(f.runtime, f.transport);
      const child = f.manager.createPopover({
        anchor: anchor.panel,
        width: 20,
        height: 10,
        build: () => {}
      });
      child.open();
      const interaction = f.runtime.interaction as any;
      interaction.handle(move(f.windowId, 50, 50) as PointerEvent);
      interaction.pollNativeEvents({
        multiversePollInteractionEvents: () =>
          JSON.stringify([
            {
              interactionType: 'hover',
              windowId: f.windowId,
              pointerId: 0,
              realmId: f.realm.realmId,
              modelId: parent.root!.uiId,
              elementId: parent.root!.root.id,
              colliderId: 1,
              localPos: [0, 0],
              uv: [0, 0],
              delta: [0, 0]
            }
          ])
      });
      f.transport.engine.multiverseHandlePointerEvent = () => {};
      interaction.handle(button(f.windowId, 50, 50, 'pressed') as PointerEvent);
      expect(parent.isOpen).toBe(true);
      expect(child.isOpen).toBe(false);
    } finally {
      f.runtime.dispose();
    }
  });

  it('cleans externally disposed content and inherits updated anchor styles', () => {
    const f = fixture();
    try {
      f.trigger.panel.setStyle({ color: [0, 1, 0, 1] });
      f.root.flush();
      let label: import('../src').UiTextComponent | undefined;
      const reasons: string[] = [];
      const popup = f.manager.createPopover({
        anchor: f.trigger.panel,
        width: 30,
        height: 20,
        build: (root) => {
          label = root.root.addText('Inherited');
        },
        onClose: (reason) => reasons.push(reason)
      });
      popup.open();
      expect(label!.resolvedStyle.kind.color).toEqual([0, 1, 0, 1]);
      f.trigger.panel.setStyle({ color: [0, 0, 1, 1] });
      f.root.flush();
      advanceFrame(f.runtime, f.transport);
      expect(label!.resolvedStyle.kind.color).toEqual([0, 0, 1, 1]);
      popup.root!.dispose();
      advanceFrame(f.runtime, f.transport);
      expect(popup.isOpen).toBe(false);
      expect(reasons).toEqual(['content-disposed']);
    } finally {
      f.runtime.dispose();
    }
  });

  it('rejects an additional offscreen presentation and disposes tooltip ownership with its anchor', () => {
    const f = fixture();
    try {
      const texture = f.runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 100, height: 100 }
      });
      (f.transport.engine as any).multiverseGetSchedule = () =>
        ({
          targetBlocks: [
            ...f.schedule.targetBlocks,
            {
              targetId: texture,
              invocations: [
                {
                  invocationId: 2,
                  realmId: f.realm.realmId,
                  resolvedViewport: [0, 0, 100, 100],
                  zIndex: 0,
                  filters: []
                }
              ]
            }
          ]
        }) as any;
      const popup = f.manager.createPopover({
        anchor: f.trigger.panel,
        width: 20,
        height: 20,
        build: () => {}
      });
      expect(() => popup.open()).toThrow('exactly one direct presentation');
      const tooltip = f.manager.createTooltip({ anchor: f.trigger.panel, text: 'Tip' });
      f.trigger.remove();
      f.root.flush();
      advanceFrame(f.runtime, f.transport);
      expect(tooltip.popover.isDisposed).toBe(true);
      expect(popup.isDisposed).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });

  it('opens tooltips after focus delay, cancels on blur, and suppresses reopening after Escape', async () => {
    const f = fixture();
    try {
      const tooltip = f.manager.createTooltip({
        anchor: f.trigger.panel,
        text: 'Tip',
        openDelayMs: 5,
        closeDelayMs: 5
      });
      f.runtime.interaction.handleKeyboard(tab(f.windowId) as KeyboardEvent);
      await Bun.sleep(15);
      expect(tooltip.isOpen).toBe(true);
      tooltip.setText('Updated');
      expect(tooltip.popover.root!.root.children[0]).toMatchObject({ text: 'Updated' });
      f.runtime.interaction.handleKeyboard(escape(f.windowId));
      await Bun.sleep(15);
      expect(tooltip.isOpen).toBe(false);
      f.trigger.blur(f.windowId);
      advanceFrame(f.runtime, f.transport);
      f.trigger.requestFocus(f.windowId);
      advanceFrame(f.runtime, f.transport);
      await Bun.sleep(15);
      expect(tooltip.isOpen).toBe(true);
      f.trigger.blur(f.windowId);
      advanceFrame(f.runtime, f.transport);
      await Bun.sleep(15);
      expect(tooltip.isOpen).toBe(false);
      expect(f.trigger.getInteractionState(f.windowId).focus).toBe(false);
      await Bun.sleep(15);
      expect(tooltip.isOpen).toBe(false);
      tooltip.dispose();
    } finally {
      f.runtime.dispose();
    }
  });

  it('cancels a pending hover tooltip when the pointer leaves its anchor', async () => {
    const f = fixture();
    try {
      const tooltip = f.manager.createTooltip({
        anchor: f.trigger.panel,
        text: 'Tip',
        openDelayMs: 15,
        closeDelayMs: 0
      });
      const deliver = (type: string) =>
        (f.runtime.interaction as any).pollNativeEvents({
          multiversePollInteractionEvents: () =>
            JSON.stringify([
              {
                interactionType: type,
                windowId: f.windowId,
                pointerId: 0,
                realmId: f.realm.realmId,
                modelId: f.root.uiId,
                colliderId: 1,
                elementId: f.trigger.panel.id,
                localPos: [0, 0],
                uv: [0, 0],
                delta: [0, 0]
              }
            ])
        });
      f.runtime.interaction.handle(move(f.windowId, 5, 5) as PointerEvent);
      deliver('hover');
      deliver('leave');
      await Bun.sleep(25);
      expect(tooltip.isOpen).toBe(false);
      deliver('hover');
      await Bun.sleep(25);
      expect(tooltip.isOpen).toBe(true);
      deliver('leave');
      await Bun.sleep(10);
      expect(tooltip.isOpen).toBe(false);
      tooltip.dispose();
    } finally {
      f.runtime.dispose();
    }
  });
});
