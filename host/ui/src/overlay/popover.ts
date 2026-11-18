import type { UiStyle } from '../style/theme';
import type { ComponentRoot } from '../components/root';
import type { UiPanelComponent } from '../components/component';
import type { UiOverlayManager } from './manager';

export type UiOverlayPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type UiOverlayCloseReason =
  | 'programmatic'
  | 'escape'
  | 'outside'
  | 'anchor-removed'
  | 'content-disposed'
  | 'context-lost'
  | 'window-closed'
  | 'owner-disposed'
  | 'parent-closed';
export interface UiPopoverOptions {
  readonly anchor: UiPanelComponent;
  readonly width: number;
  readonly height: number;
  readonly placement?: UiOverlayPlacement;
  readonly gap?: number;
  readonly style?: UiStyle;
  readonly closeOnOutside?: boolean;
  readonly closeOnEscape?: boolean;
  /** @internal */
  readonly coverViewport?: boolean;
  readonly restoreFocus?: boolean;
  /** Called on each opening; return a panel to focus after its first presentation. */
  readonly build: (root: ComponentRoot) => UiPanelComponent | void;
  readonly onClose?: (reason: UiOverlayCloseReason) => void;
}

/** One reusable overlay; the content tree is created and disposed on each opening. */
export class UiPopover {
  /** @internal */ root_: ComponentRoot | undefined;
  /** @internal */ parent_: UiPopover | undefined;
  /** @internal */ x = 0;
  /** @internal */ y = 0;
  /** @internal */ focusTarget?: UiPanelComponent;
  /** @internal */ previousFocus?: import('../focus').Focusable;
  /** @internal */ styleSnapshot?: unknown;
  private disposed = false;
  private width_: number;
  private height_: number;
  private placement_: UiOverlayPlacement;
  private gap_: number;
  constructor(
    readonly manager: UiOverlayManager,
    readonly options: UiPopoverOptions
  ) {
    if (
      !Number.isFinite(options.width) ||
      options.width <= 0 ||
      !Number.isFinite(options.height) ||
      options.height <= 0
    )
      throw new RangeError('Overlay dimensions must be positive and finite.');
    if (options.gap !== undefined && (!Number.isFinite(options.gap) || options.gap < 0))
      throw new RangeError('Overlay gap must be non-negative and finite.');
    if (
      options.placement &&
      !['top', 'bottom', 'left', 'right', 'center'].includes(options.placement)
    )
      throw new Error('Invalid overlay placement.');
    this.width_ = options.width;
    this.height_ = options.height;
    this.placement_ = options.placement ?? 'bottom';
    this.gap_ = options.gap ?? 6;
  }
  get isOpen(): boolean {
    return this.root_ !== undefined;
  }
  get isDisposed(): boolean {
    return this.disposed;
  }
  get root(): ComponentRoot | undefined {
    return this.root_;
  }
  get width(): number {
    return this.width_;
  }
  get height(): number {
    return this.height_;
  }
  get placement(): UiOverlayPlacement {
    return this.placement_;
  }
  get gap(): number {
    return this.gap_;
  }
  setPlacement(placement: UiOverlayPlacement, gap = this.gap_): void {
    if (this.disposed) throw new Error('Popover is disposed.');
    if (
      !['top', 'bottom', 'left', 'right', 'center'].includes(placement) ||
      !Number.isFinite(gap) ||
      gap < 0
    )
      throw new RangeError('Invalid overlay placement or gap.');
    this.placement_ = placement;
    this.gap_ = gap;
    this.manager.reposition(this);
  }
  setSize(width: number, height: number): void {
    if (this.disposed) throw new Error('Popover is disposed.');
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0)
      throw new RangeError('Overlay dimensions must be positive and finite.');
    this.width_ = width;
    this.height_ = height;
    const root = this.root_;
    if (!root) return;
    const synced = root.syncState === 'synced';
    root.root.setLayout({
      ...root.root.layout,
      width: { type: 'exact', value: width },
      height: { type: 'exact', value: height }
    });
    if (synced) root.flush();
    this.manager.reposition(this);
  }
  open(): void {
    if (this.disposed) throw new Error('Popover is disposed.');
    if (!this.isOpen) this.manager.open(this);
  }
  close(reason: UiOverlayCloseReason = 'programmatic'): void {
    if (this.isOpen) this.manager.close(this, reason);
  }
  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
  dispose(): void {
    if (this.disposed) return;
    this.close('owner-disposed');
    this.disposed = true;
    this.manager.forget(this);
  }
}
