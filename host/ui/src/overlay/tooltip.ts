import type { UiPanelComponent, UiTextComponent } from '../components/component';
import type { UiStyle } from '../style/theme';
import type { UiOverlayManager } from './manager';
import { type UiOverlayPlacement, UiPopover } from './popover';

export interface UiTooltipOptions {
  readonly anchor: UiPanelComponent;
  readonly text: string;
  readonly width?: number;
  readonly height?: number;
  readonly placement?: UiOverlayPlacement;
  readonly openDelayMs?: number;
  readonly closeDelayMs?: number;
  readonly style?: UiStyle;
  readonly onError?: (error: unknown) => void;
}

/** A delayed hover/focus overlay that never takes keyboard focus. */
export class UiTooltip {
  readonly popover: UiPopover;
  private text: string;
  private label?: UiTextComponent;
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private suppressed = false;
  private disposed = false;
  private error: unknown;
  private readonly stop: (() => void)[];
  private readonly openDelay: number;
  private readonly closeDelay: number;
  constructor(
    private readonly manager: UiOverlayManager,
    readonly options: UiTooltipOptions
  ) {
    this.openDelay = options.openDelayMs ?? 400;
    this.closeDelay = options.closeDelayMs ?? 100;
    if (![this.openDelay, this.closeDelay].every((n) => Number.isFinite(n) && n >= 0))
      throw new RangeError('Tooltip delays must be non-negative and finite.');
    this.text = options.text;
    this.popover = manager.createPopover({
      anchor: options.anchor,
      width: options.width ?? 200,
      height: options.height ?? 36,
      placement: options.placement ?? 'bottom',
      style: options.style,
      closeOnOutside: false,
      restoreFocus: false,
      build: (root) => {
        this.label = root.root.addText(this.text, undefined, { multiline: true, wrap: 'wordWrap' });
      },
      onClose: (reason) => {
        this.label = undefined;
        if (reason === 'escape' || reason === 'context-lost') this.suppressed = true;
      }
    });
    this.stop = [
      options.anchor.on('hover', () => this.refresh()),
      options.anchor.on('leave', () => this.refresh())
    ];
    this.refresh();
  }
  get isOpen(): boolean {
    return this.popover.isOpen;
  }
  get lastError(): unknown {
    return this.error;
  }
  setText(text: string): void {
    this.text = text;
    if (this.label && this.popover.root) {
      this.label.setText(text);
      this.popover.root.flush();
    }
  }
  /** @internal */
  refresh(): void {
    if (this.disposed) return;
    const anchor = this.options.anchor;
    if (!anchor.isAttached || !anchor.componentRoot.interactionEligible(anchor.id)) {
      this.cancelTimers();
      this.popover.close('anchor-removed');
      if (!anchor.isAttached && !anchor.componentRoot.wasPresented(anchor.id)) this.dispose();
      return;
    }
    const state = anchor.getInteractionState(this.manager.windowId);
    const interested = state.hover || state.focus;
    if (!interested) this.suppressed = false;
    if (interested && !this.suppressed) {
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.closeTimer = undefined;
      if (!this.isOpen && !this.openTimer)
        this.openTimer = setTimeout(() => {
          this.openTimer = undefined;
          if (
            this.disposed ||
            !anchor.isAttached ||
            !anchor.componentRoot.interactionEligible(anchor.id)
          )
            return;
          const current = anchor.getInteractionState(this.manager.windowId);
          if (!current.hover && !current.focus) return;
          try {
            this.popover.open();
            this.error = undefined;
          } catch (error) {
            this.error = error;
            this.suppressed = true;
            this.options.onError?.(error);
          }
        }, this.openDelay);
    } else {
      if (this.openTimer) clearTimeout(this.openTimer);
      this.openTimer = undefined;
      if (this.isOpen && !this.closeTimer)
        this.closeTimer = setTimeout(() => {
          this.closeTimer = undefined;
          this.popover.close();
        }, this.closeDelay);
    }
  }
  private cancelTimers(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.openTimer = undefined;
    this.closeTimer = undefined;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelTimers();
    for (const stop of this.stop) stop();
    this.popover.dispose();
    this.manager.forgetTooltip(this);
  }
}
