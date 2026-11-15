import type { UiPanelComponent } from '../components/component';
import type { Focusable } from '../focus';
import type { UiOverlayManager } from '../overlay/manager';
import type { UiOverlayCloseReason, UiPopover } from '../overlay/popover';
import type { UiStyle } from '../style/theme';

export interface UiDialogOptions {
  readonly anchor: UiPanelComponent;
  readonly width: number;
  readonly height: number;
  readonly style?: UiStyle;
  readonly backdropColor?: [number, number, number, number];
  readonly closeOnEscape?: boolean;
  readonly closeOnOutside?: boolean;
  /** Called on each opening; optionally return the initial focus panel. */
  readonly build: (content: UiPanelComponent) => UiPanelComponent | void;
  readonly onClose?: (reason: UiOverlayCloseReason) => void;
}

/** Modal layer with a window-sized backdrop and a per-window focus scope. */
export class UiDialog {
  readonly popover: UiPopover;
  private content_?: UiPanelComponent;
  private initial?: UiPanelComponent;
  private previous?: Focusable;
  private releaseScope?: () => void;
  private readonly stop: () => void;
  private readonly stopOwner: () => void;
  private disposed = false;
  private closing = false;
  constructor(
    readonly manager: UiOverlayManager,
    readonly options: UiDialogOptions
  ) {
    if (!manager.ownsAnchor(options.anchor))
      throw new Error('Dialog anchor must belong to the overlay manager.');
    if (![options.width, options.height].every((n) => Number.isFinite(n) && n > 0))
      throw new RangeError('Dialog dimensions must be positive and finite.');
    this.popover = manager.createPopover({
      anchor: options.anchor,
      width: options.width,
      height: options.height,
      placement: 'center',
      coverViewport: true,
      restoreFocus: false,
      closeOnOutside: false,
      closeOnEscape: options.closeOnEscape,
      style: {
        backgroundColor: options.backdropColor ?? [0, 0, 0, 0.6],
        borderWidth: [0, 0, 0, 0]
      },
      build: (root) => {
        root.root.setLayout({ ...root.root.layout, isStack: true, padding: [0, 0, 0, 0] });
        root.root.on('click', ({ pointer }) => {
          if (
            options.closeOnOutside !== false &&
            pointer.type === 'button' &&
            pointer.button === 'primary'
          )
            this.close('outside');
        });
        const viewport = manager.getViewportBounds();
        this.content_ = root.root.addPanel({}, this.contentLayout(viewport[2], viewport[3]));
        this.content_.setComponentStyle('dialog');
        if (options.style) this.content_.setStyle(options.style);
        this.content_.setFocusable(-1);
        this.initial = options.build(this.content_) || this.content_;
        if (
          this.initial.componentRoot !== root ||
          !root.containsPanel(this.content_.id, this.initial.id)
        )
          throw new Error('Dialog initial focus must belong to its content.');
        return this.initial;
      },
      onClose: (reason) => this.finish(reason)
    });
    this.stop = manager.runtime.interaction.observe({
      onAfterDispatch: () => this.afterDispatch(),
      onWindowClosed: (id) => {
        if (id === manager.windowId) this.dispose();
      },
      onDispose: () => this.dispose()
    });
    this.stopOwner = manager.owner.onSyncState((state) => {
      if (state === 'disposed') this.dispose();
    });
  }
  get isOpen(): boolean {
    return this.popover.isOpen;
  }
  get content(): UiPanelComponent | undefined {
    return this.content_;
  }
  open(): void {
    if (this.disposed) throw new Error('Dialog is disposed.');
    if (this.isOpen) return;
    const bounds = this.manager.getViewportBounds();
    if (bounds[2] <= 0 || bounds[3] <= 0) throw new Error('Dialog viewport is empty.');
    this.previous = this.manager.ui.getFocused(this.manager.windowId);
    this.popover.setSize(bounds[2], bounds[3]);
    try {
      this.popover.open();
      this.releaseScope = this.manager.ui.pushFocusScope(
        this.manager.windowId,
        (target) =>
          !!this.content_ && this.manager.containsFocusUnder(this.popover, this.content_, target),
        (listener) => this.manager.containsPointer(this.popover, listener)
      );
      this.manager.ui.enforceFocusScope(this.manager.windowId);
    } catch (error) {
      this.popover.close('programmatic');
      this.previous = undefined;
      this.content_ = undefined;
      this.initial = undefined;
      throw error;
    }
  }
  close(reason: UiOverlayCloseReason = 'programmatic'): void {
    if (this.isOpen && !this.closing) this.popover.close(reason);
  }
  private finish(reason: UiOverlayCloseReason): void {
    if (this.closing) return;
    this.closing = true;
    try {
      this.releaseScope?.();
      this.releaseScope = undefined;
      this.content_ = undefined;
      this.initial = undefined;
      const previous = this.previous;
      this.previous = undefined;
      let restored = false;
      if (
        reason !== 'window-closed' &&
        reason !== 'context-lost' &&
        previous &&
        !previous.isDisposed
      )
        restored = previous.requestFocus(this.manager.windowId);
      if (
        !restored &&
        reason !== 'window-closed' &&
        reason !== 'context-lost' &&
        this.options.anchor.isAttached
      )
        this.options.anchor.requestFocus(this.manager.windowId);
      this.options.onClose?.(reason);
    } finally {
      this.closing = false;
    }
  }
  private contentLayout(width: number, height: number) {
    return {
      width: { type: 'exact' as const, value: this.options.width },
      height: { type: 'exact' as const, value: this.options.height },
      positionOffset: [
        Math.max(0, (width - this.options.width) / 2),
        Math.max(0, (height - this.options.height) / 2)
      ] as [number, number],
      direction: 'column' as const,
      padding: [12, 12, 12, 12] as [number, number, number, number],
      gap: [8, 8] as [number, number]
    };
  }
  private afterDispatch(): void {
    if (this.popover.isDisposed) {
      this.dispose();
      return;
    }
    const root = this.popover.root,
      content = this.content_;
    if (!root || !content || !content.isAttached || root.syncState !== 'synced') return;
    const bounds = this.manager.getViewportBounds();
    const layout = this.contentLayout(bounds[2], bounds[3]);
    if (JSON.stringify(content.layout) !== JSON.stringify(layout)) {
      content.setLayout(layout);
      root.flush();
    }
    const focused = this.manager.ui.getFocused(this.manager.windowId);
    if (!focused && root.wasPresented(content.id)) {
      if (!this.initial?.requestFocus(this.manager.windowId))
        content.requestFocus(this.manager.windowId);
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.close('owner-disposed');
    this.disposed = true;
    this.stop();
    this.stopOwner();
    this.popover.dispose();
  }
}
