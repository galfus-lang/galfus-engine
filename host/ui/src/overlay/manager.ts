import {
  type InteractiveListener,
  type Model2DComponent,
  type MultiverseRuntime,
  SpatialDirtyFlags,
  type WindowId
} from '@galfus/engine';
import type { UiSystem } from '../system';
import type { UiPanelComponent } from '../components/component';
import type { ComponentRoot } from '../components/root';
import { sameUiValue } from '../style/resolve';
import {
  type UiOverlayCloseReason,
  type UiOverlayPlacement,
  UiPopover,
  type UiPopoverOptions
} from './popover';
import { UiTooltip, type UiTooltipOptions } from './tooltip';
import type { Focusable } from '../focus';

type Rect = readonly [number, number, number, number];
const owners = new WeakMap<object, UiOverlayManager>();
const windowOwners = new WeakMap<MultiverseRuntime, Map<number, UiOverlayManager>>();
function placement(
  anchor: Rect,
  viewport: Rect,
  width: number,
  height: number,
  side: UiOverlayPlacement,
  gap: number
): [number, number] {
  const [x, y, w, h] = anchor;
  const [vx, vy, vw, vh] = viewport;
  let px = x,
    py = y;
  if (side === 'center') {
    px = vx + (vw - width) / 2;
    py = vy + (vh - height) / 2;
  }
  if (side === 'bottom') {
    py = y + h + gap;
    if (py + height > vy + vh && y - gap - height >= vy) py = y - gap - height;
  }
  if (side === 'top') {
    py = y - gap - height;
    if (py < vy && y + h + gap + height <= vy + vh) py = y + h + gap;
  }
  if (side === 'right') {
    px = x + w + gap;
    if (px + width > vx + vw && x - gap - width >= vx) px = x - gap - width;
  }
  if (side === 'left') {
    px = x - gap - width;
    if (px < vx && x + w + gap + width <= vx + vw) px = x + w + gap;
  }
  return [
    Math.max(vx, Math.min(px, vx + vw - width)),
    Math.max(vy, Math.min(py, vy + vh - height))
  ];
}

/** Manages owned overlay models in one unambiguous direct window presentation. */
export class UiOverlayManager {
  private readonly popovers = new Set<UiPopover>();
  private readonly tooltips = new Set<UiTooltip>();
  private readonly stack: UiPopover[] = [];
  private readonly closing = new Set<UiPopover>();
  private readonly stop: () => void;
  private readonly stopRoot: () => void;
  private disposed = false;
  private composing = false;
  private escapeConsumed = false;
  private viewport?: Rect;
  constructor(
    readonly ui: UiSystem,
    readonly runtime: MultiverseRuntime,
    readonly owner: ComponentRoot,
    readonly windowId: number,
    private readonly onDispose: () => void
  ) {
    if (
      !Number.isSafeInteger(windowId) ||
      windowId < 0 ||
      !runtime.platform.window.isOpen(windowId as WindowId)
    )
      throw new Error('Overlay manager requires an open window.');
    if (owner.targetWindowId !== undefined && owner.targetWindowId !== windowId)
      throw new Error('Overlay window does not match the owner root.');
    if (owners.has(owner.realm)) throw new Error('Only one overlay manager may own a realm.');
    if (windowOwners.get(runtime)?.has(windowId))
      throw new Error('Only one overlay manager may own a window.');
    this.stopRoot = owner.onSyncState((state) => {
      if (state === 'disposed')
        this.dispose(
          runtime.platform.window.isOpen(windowId as WindowId) ? 'owner-disposed' : 'window-closed'
        );
    });
    this.stop = runtime.interaction.observe({
      onPointerEvent: (event) => {
        if (event.windowId !== this.windowId) return;
        if (event.type === 'button' && event.button === 'primary' && event.state === 'pressed')
          this.outside(event.pointerId);
        this.refreshTooltips();
      },
      onKeyboardEvent: (event) => {
        if (event.windowId !== this.windowId) return;
        if (event.type === 'imePreedit') this.composing = !!event.text;
        else if (event.type === 'imeCommit' || event.type === 'imeDisabled') this.composing = false;
        if (
          event.type === 'input' &&
          event.state === 'pressed' &&
          !event.repeat &&
          event.logicalKey === 'Escape'
        ) {
          const top = this.stack.at(-1);
          this.escapeConsumed = !!top || this.composing;
          if (!this.composing && top?.options.closeOnEscape !== false) top?.close('escape');
        }
        this.refreshTooltips();
      },
      onWindowEvent: (event) => {
        if (event.windowId === this.windowId && event.type === 'focusChanged' && !event.focused) {
          this.composing = false;
          this.refreshTooltips();
        }
      },
      onWindowClosed: (id) => {
        if (id === this.windowId) this.dispose('window-closed');
      },
      onAfterDispatch: () => this.afterDispatch(),
      onDispose: () => this.dispose()
    });
    owners.set(owner.realm, this);
    let windows = windowOwners.get(runtime);
    if (!windows) windowOwners.set(runtime, (windows = new Map()));
    windows.set(windowId, this);
  }
  /** Returns and clears whether the last Escape belonged to an overlay or IME composition. */
  consumeEscape(): boolean {
    const consumed = this.escapeConsumed;
    this.escapeConsumed = false;
    return consumed;
  }
  createPopover(options: UiPopoverOptions): UiPopover {
    this.assertLive();
    const popover = new UiPopover(this, options);
    this.popovers.add(popover);
    return popover;
  }
  createTooltip(options: UiTooltipOptions): UiTooltip {
    this.assertLive();
    const tooltip = new UiTooltip(this, options);
    this.tooltips.add(tooltip);
    return tooltip;
  }
  /** Whether a panel belongs to this manager's root or an open owned layer. */
  ownsAnchor(anchor: UiPanelComponent): boolean {
    return (
      !this.disposed &&
      (anchor.componentRoot === this.owner ||
        this.stack.some((item) => item.root_ === anchor.componentRoot))
    );
  }
  /** @internal */
  containsFocus(layer: UiPopover, target: Focusable): boolean {
    if (target.realmId !== this.owner.realm.realmId || target.target.type !== 'ui') return false;
    let current = this.stack.find(
      (item) => item.root_?.uiId === (target.target as { uiId: number }).uiId
    );
    while (current) {
      if (current === layer) return true;
      current = current.parent_;
    }
    return false;
  }
  /** @internal */
  containsFocusUnder(layer: UiPopover, panel: UiPanelComponent, target: Focusable): boolean {
    if (target.realmId !== this.owner.realm.realmId || target.target.type !== 'ui' || !layer.root_)
      return false;
    const uiId = target.target.uiId;
    if (uiId === layer.root_.uiId)
      return layer.root_.containsPanel(panel.id, Number(target.target.elementId));
    let child = this.stack.find((item) => item.root_?.uiId === uiId);
    while (child?.parent_ && child.parent_ !== layer) child = child.parent_;
    return (
      !!child &&
      child.parent_ === layer &&
      layer.root_.containsPanel(panel.id, child.options.anchor.id)
    );
  }
  /** @internal */
  containsPointer(
    layer: UiPopover,
    listener: import('@galfus/engine').InteractiveListener
  ): boolean {
    if (listener.realmId !== this.owner.realm.realmId || listener.target.type !== 'ui')
      return false;
    let current = this.stack.find(
      (item) => item.root_?.uiId === (listener.target as { uiId: number }).uiId
    );
    while (current) {
      if (current === layer) return true;
      current = current.parent_;
    }
    return false;
  }
  /** Current visible owner bounds in UI-local coordinates. */
  getViewportBounds(): Rect {
    const base = this.owner.realm.getUiLayout(this.owner.handle, this.owner.root.id).absoluteRect;
    if (!this.viewport) return base;
    const x = Math.max(base[0], this.viewport[0]),
      y = Math.max(base[1], this.viewport[1]);
    return [
      x,
      y,
      Math.max(0, Math.min(base[0] + base[2], this.viewport[0] + this.viewport[2]) - x),
      Math.max(0, Math.min(base[1] + base[3], this.viewport[1] + this.viewport[3]) - y)
    ];
  }
  /** Sets visible bounds in owner-root units; omit to use the presented root bounds. */
  setViewport(rect?: Rect): void {
    this.assertLive();
    if (rect && (rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] <= 0 || rect[3] <= 0))
      throw new RangeError(
        'Overlay viewport must have finite coordinates and positive dimensions.'
      );
    this.viewport = rect ? [...rect] : undefined;
    for (const item of this.stack) this.reposition(item);
  }
  /** @internal */
  forget(popover: UiPopover): void {
    this.popovers.delete(popover);
  }
  /** @internal */
  forgetTooltip(tooltip: UiTooltip): void {
    this.tooltips.delete(tooltip);
  }
  /** @internal */
  open(popover: UiPopover): void {
    this.assertLive();
    if (!this.popovers.has(popover)) throw new Error('Popover does not belong to this manager.');
    if (!this.contextValid())
      throw new Error('Overlay requires exactly one direct presentation in its selected window.');
    const anchor = popover.options.anchor;
    const parent = this.stack.find((entry) => entry.root_ === anchor.componentRoot);
    if (parent && this.closing.has(parent))
      throw new Error('Cannot open an overlay while its parent is closing.');
    if (anchor.componentRoot !== this.owner && !parent)
      throw new Error('Overlay anchor must belong to its owner or an open parent overlay.');
    if (
      !anchor.isAttached ||
      !anchor.componentRoot.interactionEligible(anchor.id) ||
      !anchor.componentRoot.wasPresented(anchor.id)
    )
      throw new Error('Overlay anchor must be visible and presented.');
    if (this.owner.syncState !== 'synced' || anchor.componentRoot.syncState !== 'synced')
      throw new Error('Overlay owner and anchor must be synchronized before opening.');
    const anchorStyle = anchor.componentRoot.nodeSnapshot(anchor.id).resolved!;
    const theme = this.owner.getTheme();
    theme.tokens = structuredClone(anchorStyle.tokens);
    const root = this.ui.createComponentRoot(this.owner.realm, {
      width: popover.width,
      height: popover.height,
      windowId: this.windowId,
      layout: { direction: 'column', padding: [8, 8, 8, 8] },
      theme
    });
    popover.root_ = root;
    popover.parent_ = parent;
    popover.previousFocus = this.ui.getFocused(this.windowId);
    this.stack.push(popover);
    try {
      const { color, ...typography } = anchorStyle.inherited;
      root.root.setStyle({
        backgroundColor: [0.08, 0.12, 0.18, 1],
        borderColor: [0.3, 0.45, 0.6, 1],
        borderWidth: [1, 1, 1, 1],
        typography,
        ...(color ? { color } : {}),
        ...popover.options.style
      });
      popover.styleSnapshot = structuredClone({ theme, inherited: anchorStyle.inherited });
      popover.focusTarget = popover.options.build(root) || undefined;
      if (popover.focusTarget && popover.focusTarget.componentRoot !== root)
        throw new Error('Initial focus must belong to overlay content.');
      this.registerPanels(root.root);
      this.update(popover);
      root.flush();
    } catch (error) {
      const index = this.stack.indexOf(popover);
      if (index >= 0) this.stack.splice(index, 1);
      popover.root_ = undefined;
      popover.parent_ = undefined;
      popover.focusTarget = undefined;
      popover.previousFocus = undefined;
      popover.styleSnapshot = undefined;
      root.dispose();
      throw error;
    }
  }
  /** @internal */
  close(popover: UiPopover, reason: UiOverlayCloseReason): void {
    const index = this.stack.indexOf(popover);
    if (index < 0 || this.closing.has(popover)) return;
    this.closing.add(popover);
    let failure: unknown;
    let failed = false;
    const run = (action: () => void) => {
      try {
        action();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    };
    try {
      for (const child of [...this.stack].reverse())
        if (child.parent_ === popover) run(() => this.close(child, 'parent-closed'));
      const root = popover.root_!;
      const focused = this.ui.getFocused(this.windowId);
      const restore =
        popover.options.restoreFocus !== false &&
        reason !== 'outside' &&
        reason !== 'window-closed' &&
        reason !== 'context-lost' &&
        reason !== 'owner-disposed' &&
        (!focused || (focused.target.type === 'ui' && focused.target.uiId === root.uiId));
      this.stack.splice(this.stack.indexOf(popover), 1);
      popover.root_ = undefined;
      popover.parent_ = undefined;
      popover.focusTarget = undefined;
      popover.styleSnapshot = undefined;
      run(() => root.dispose());
      const previous = popover.previousFocus;
      popover.previousFocus = undefined;
      if (restore && previous && !previous.isDisposed)
        run(() => {
          previous.requestFocus(this.windowId);
        });
      run(() => popover.options.onClose?.(reason));
    } finally {
      this.closing.delete(popover);
    }
    if (failed) throw failure;
  }
  /** @internal */
  contextValid(): boolean {
    const graph = this.runtime.multiverse.presentationGraph;
    let matches = 0;
    for (const id of graph.getWindowIds()) {
      const view = graph.getWindow(id);
      if (!view || !view.realmIds.includes(this.owner.realm.realmId)) continue;
      if (id !== this.windowId) return false;
      for (const target of view.rootTargetIds)
        for (const invocation of view.getInvocations(target))
          if (view.getInvocation(invocation)?.realmId === this.owner.realm.realmId) matches++;
      if (view.realmIds.includes(this.owner.realm.realmId) && matches === 0) return false;
    }
    if (matches !== 1) return false;
    const schedule = this.runtime.multiverse.getSchedule();
    if (schedule?.targetBlocks) {
      let count = 0;
      for (const block of schedule.targetBlocks)
        for (const invocation of block.invocations)
          if (invocation.realmId === this.owner.realm.realmId) {
            const target = this.runtime.multiverse.getTarget(block.targetId);
            if (target?.kind.type !== 'window' || target.kind.windowId !== this.windowId)
              return false;
            count++;
          }
      if (count !== 1) return false;
    }
    return true;
  }
  private outside(pointerId: number): void {
    const hovered = this.runtime.interaction.hovered(this.windowId, pointerId);
    for (const item of [...this.stack].reverse()) {
      if (this.contains(item, hovered)) break;
      if (item.options.closeOnOutside !== false) item.close('outside');
    }
  }
  private contains(item: UiPopover, listener?: InteractiveListener): boolean {
    if (!listener || listener.realmId !== this.owner.realm.realmId || listener.target.type !== 'ui')
      return false;
    const { uiId, elementId } = listener.target;
    if (uiId === item.root_?.uiId) return true;
    const anchor = item.options.anchor;
    if (uiId !== anchor.componentRoot.uiId) return false;
    let current: UiPanelComponent | undefined =
      typeof elementId === 'number' && anchor.id === elementId ? anchor : undefined;
    if (current) return true;
    // Registered descendants of the anchor are also inside the trigger.
    const visit = (panel: UiPanelComponent): boolean =>
      panel.children.some(
        (child) =>
          child.id === Number(elementId) ||
          ('children' in child && visit(child as UiPanelComponent))
      );
    return visit(anchor);
  }
  private afterDispatch(): void {
    if (this.disposed) return;
    if (this.stack.length && !this.contextValid()) {
      for (const item of [...this.stack].reverse()) item.close('context-lost');
    } else
      for (const item of [...this.stack]) {
        if (item.root_?.syncState === 'disposed') {
          item.close('content-disposed');
          continue;
        }
        if (
          !item.options.anchor.isAttached ||
          !item.options.anchor.componentRoot.interactionEligible(item.options.anchor.id)
        ) {
          item.close('anchor-removed');
          continue;
        }
        if (item.root_?.syncState !== 'synced') continue;
        this.registerPanels(item.root_.root);
        this.update(item);
        if (item.focusTarget && item.root_.wasPresented(item.focusTarget.id)) {
          item.focusTarget.requestFocus(this.windowId);
          item.focusTarget = undefined;
        }
      }
    for (const item of [...this.popovers]) {
      const anchor = item.options.anchor;
      if (!anchor.isAttached && !anchor.componentRoot.wasPresented(anchor.id)) item.dispose();
    }
    this.refreshTooltips();
  }
  private registerPanels(panel: UiPanelComponent): void {
    panel.componentRoot.observePanel(panel.id);
    for (const child of panel.children)
      if ('children' in child) this.registerPanels(child as UiPanelComponent);
  }
  /** Repositions a synchronized open overlay without committing unrelated staged content. */
  reposition(item: UiPopover): void {
    if (item.root_?.syncState === 'synced' && item.options.anchor.isAttached) this.update(item);
  }
  private update(item: UiPopover): void {
    const root = item.root_!;
    const anchor = item.options.anchor;
    if (this.owner.syncState === 'synced' && anchor.componentRoot.syncState === 'synced') {
      const resolved = anchor.componentRoot.nodeSnapshot(anchor.id).resolved!;
      const theme = this.owner.getTheme();
      theme.tokens = structuredClone(resolved.tokens);
      const snapshot = { theme, inherited: resolved.inherited };
      if (!sameUiValue(item.styleSnapshot, snapshot)) {
        root.setTheme(theme);
        const { color, ...typography } = resolved.inherited;
        root.root.setStyle({
          backgroundColor: [0.08, 0.12, 0.18, 1],
          borderColor: [0.3, 0.45, 0.6, 1],
          borderWidth: [1, 1, 1, 1],
          typography,
          ...(color ? { color } : {}),
          ...item.options.style
        });
        item.styleSnapshot = structuredClone(snapshot);
        if (root.syncState === 'pending') root.flush();
      }
    }
    const base = this.owner.realm.getUiLayout(this.owner.handle, this.owner.root.id).absoluteRect;
    const bounds = this.getViewportBounds();
    if (
      item.options.coverViewport &&
      bounds[2] > 0 &&
      bounds[3] > 0 &&
      (item.width !== bounds[2] || item.height !== bounds[3])
    )
      item.setSize(bounds[2], bounds[3]);
    const rect = anchor.componentRoot.realm.getUiLayout(
      anchor.componentRoot.handle,
      anchor.id
    ).absoluteRect;
    const parent = item.parent_;
    const anchorRect: Rect = [
      rect[0] + (parent?.x ?? 0),
      rect[1] + (parent?.y ?? 0),
      rect[2],
      rect[3]
    ];
    [item.x, item.y] = placement(
      anchorRect,
      bounds,
      item.width,
      item.height,
      item.placement,
      item.gap
    );
    const source = this.owner.realm.world.getComponent<Model2DComponent>(
      this.owner.entityId,
      'Model2D'
    );
    const target = this.owner.realm.world.getComponent<Model2DComponent>(root.entityId, 'Model2D');
    if (!source || !target) return;
    const all = this.owner.realm.world.query('Model2D');
    const overlayIds = new Set(this.stack.map((entry) => entry.root_?.entityId));
    let top = source.zLayer;
    for (const id of all)
      if (!overlayIds.has(id))
        top = Math.max(
          top,
          this.owner.realm.world.getComponent<Model2DComponent>(id, 'Model2D')?.zLayer ?? top
        );
    const z = top + this.stack.indexOf(item) + 1;
    if (z > 2147483647) throw new RangeError('Overlay z-layer exceeds the supported range.');
    target.zLayer = z;
    const dx = item.x - base[0] + item.width / 2 - base[2] / 2;
    const dy = base[3] / 2 - (item.y - base[1]) - item.height / 2;
    const matrix = source.worldMatrix;
    const next = [
      matrix[0],
      matrix[1],
      matrix[2],
      matrix[3],
      matrix[4] + matrix[0] * dx + matrix[2] * dy,
      matrix[5] + matrix[1] * dx + matrix[3] * dy
    ];
    if (next.some((value, i) => Math.abs(target.localMatrix[i]! - value!) > 0.0001)) {
      target.localMatrix.set(next);
      target.flags |= SpatialDirtyFlags.LocalDirty;
    }
  }
  private refreshTooltips(): void {
    for (const tooltip of this.tooltips) tooltip.refresh();
  }
  private assertLive(): void {
    if (this.disposed) throw new Error('Overlay manager is disposed.');
  }
  dispose(reason: UiOverlayCloseReason = 'owner-disposed'): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.stopRoot();
    let failure: unknown;
    let failed = false;
    const run = (action: () => void) => {
      try {
        action();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    };
    for (const tooltip of [...this.tooltips]) run(() => tooltip.dispose());
    for (const item of [...this.stack].reverse()) run(() => item.close(reason));
    for (const item of [...this.popovers]) run(() => item.dispose());
    owners.delete(this.owner.realm);
    const windows = windowOwners.get(this.runtime);
    windows?.delete(this.windowId);
    if (!windows?.size) windowOwners.delete(this.runtime);
    run(() => this.onDispose());
    if (failed) throw failure;
  }
}
