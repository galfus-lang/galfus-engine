import { UiButton } from '../components/controls';
import type { UiPanelComponent } from '../components/component';
import type { UiOverlayManager } from '../overlay/manager';
import type { UiOverlayCloseReason, UiOverlayPlacement, UiPopover } from '../overlay/popover';
import type { UiStyle } from '../style/theme';

export interface UiMenuItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly children?: readonly UiMenuItem[];
}
export interface UiMenuSelection {
  readonly id: string;
  readonly path: readonly string[];
  readonly windowId: number;
}
export type UiMenuCloseReason = UiOverlayCloseReason | 'selection';
export interface UiMenuOptions {
  readonly anchor: UiPanelComponent;
  readonly items: readonly UiMenuItem[];
  readonly width?: number;
  readonly pageSize?: number;
  readonly placement?: UiOverlayPlacement;
  readonly style?: UiStyle;
  readonly onSelect?: (event: UiMenuSelection) => void;
  readonly onClose?: (reason: UiMenuCloseReason) => void;
}
function copyItems(
  items: readonly UiMenuItem[],
  seen = new Set<readonly UiMenuItem[]>(),
  depth = 0
): UiMenuItem[] {
  if (!Array.isArray(items) || seen.has(items) || depth > 16)
    throw new Error('Invalid or cyclic menu items.');
  seen.add(items);
  const ids = new Set<string>();
  const result = items.map((item) => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.label !== 'string' ||
      ids.has(item.id) ||
      (item.disabled !== undefined && typeof item.disabled !== 'boolean')
    )
      throw new Error('Menu items require unique string IDs, labels and boolean disabled flags.');
    ids.add(item.id);
    return {
      id: item.id,
      label: item.label,
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
      ...(item.children ? { children: copyItems(item.children, seen, depth + 1) } : {})
    };
  });
  seen.delete(items);
  return result;
}
/** Anchored action menu. Child menus are owned and closed with their parent. */
export class UiMenu {
  readonly popover: UiPopover;
  private items_: UiMenuItem[];
  private readonly pageSize: number;
  private page = 0;
  private highlighted = -1;
  private buttons: UiButton[] = [];
  private previous?: UiButton;
  private next?: UiButton;
  private child?: UiMenu;
  private childIndex = -1;
  private requested?: UiMenuCloseReason;
  private disposed = false;
  constructor(
    readonly manager: UiOverlayManager,
    readonly options: UiMenuOptions,
    private readonly nested = false
  ) {
    if (!manager.ownsAnchor(options.anchor))
      throw new Error('Menu anchor must belong to the overlay manager.');
    this.items_ = copyItems(options.items);
    this.pageSize = options.pageSize ?? 6;
    const width = options.width ?? 220;
    if (
      !Number.isFinite(width) ||
      width <= 32 ||
      !Number.isSafeInteger(this.pageSize) ||
      this.pageSize < 1 ||
      this.pageSize > 50
    )
      throw new RangeError('Invalid menu width or page size.');
    this.popover = manager.createPopover({
      anchor: options.anchor,
      width,
      height: this.height(),
      placement: options.placement ?? 'bottom',
      style: options.style,
      build: (root) => {
        this.buttons = [];
        const rows = Math.max(1, Math.min(this.pageSize, this.items_.length));
        for (let slot = 0; slot < rows; slot++) {
          const button = new UiButton(root.root, {
            label: '',
            layout: {
              width: { type: 'percent', value: 100 },
              height: { type: 'exact', value: 36 }
            },
            onActivate: ({ windowId }) => this.activate(slot, windowId)
          });
          button.panel.onKeyboard((event) => {
            if (
              event.type !== 'input' ||
              event.state !== 'pressed' ||
              event.modifiers.ctrl ||
              event.modifiers.alt ||
              event.modifiers.superKey
            )
              return;
            if (event.logicalKey === 'ArrowDown') this.move(1, event.windowId);
            else if (event.logicalKey === 'ArrowUp') this.move(-1, event.windowId);
            else if (event.logicalKey === 'Home') this.edge(false, event.windowId);
            else if (event.logicalKey === 'End') this.edge(true, event.windowId);
            else if (event.logicalKey === 'ArrowRight')
              this.openChild(this.page * this.pageSize + slot);
            else if (event.logicalKey === 'ArrowLeft' && this.nested) this.close();
          });
          button.panel.on('hover', ({ pointer }) => {
            const index = this.page * this.pageSize + slot;
            if (!this.items_[index] || this.items_[index]!.disabled) return;
            if (this.child && this.childIndex !== index) {
              this.child.dispose();
              this.child = undefined;
              this.childIndex = -1;
            }
            this.highlighted = index;
            button.requestFocus(pointer.windowId);
            if (this.items_[index]?.children) this.openChild(index);
          });
          this.buttons.push(button);
        }
        if (this.items_.length > this.pageSize) {
          const nav = root.root.addPanel(
            { backgroundColor: [0, 0, 0, 0] },
            { direction: 'row', gap: [4, 0] }
          );
          this.previous = new UiButton(nav, {
            label: 'Previous',
            layout: { height: { type: 'exact', value: 36 } },
            onActivate: ({ windowId }) => this.changePage(-1, windowId)
          });
          this.next = new UiButton(nav, {
            label: 'Next',
            layout: { height: { type: 'exact', value: 36 } },
            onActivate: ({ windowId }) => this.changePage(1, windowId)
          });
        }
        this.renderPage();
        return this.highlighted >= 0
          ? this.buttons[this.highlighted % this.pageSize]?.panel
          : undefined;
      },
      onClose: (reason) => {
        this.child?.dispose();
        this.child = undefined;
        this.childIndex = -1;
        this.buttons = [];
        this.previous = undefined;
        this.next = undefined;
        const actual = this.requested ?? reason;
        this.requested = undefined;
        this.options.onClose?.(actual);
      }
    });
  }
  get isOpen(): boolean {
    return this.popover.isOpen;
  }
  get items(): readonly UiMenuItem[] {
    return copyItems(this.items_);
  }
  /** Returns the panel for an item on the current page, if the menu is open. */
  itemPanel(id: string): UiPanelComponent | undefined {
    const index = this.items_.findIndex((item) => item.id === id);
    return index >= 0 && Math.floor(index / this.pageSize) === this.page
      ? this.buttons[index % this.pageSize]?.panel
      : undefined;
  }
  open(): void {
    if (this.disposed) throw new Error('Menu is disposed.');
    if (this.isOpen) return;
    this.highlighted = this.items_.findIndex((item) => !item.disabled);
    this.page = this.highlighted < 0 ? 0 : Math.floor(this.highlighted / this.pageSize);
    this.popover.open();
  }
  close(reason: UiMenuCloseReason = 'programmatic'): void {
    if (!this.isOpen) return;
    this.requested = reason;
    this.popover.close(reason === 'selection' ? 'programmatic' : reason);
  }
  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
  setItems(items: readonly UiMenuItem[]): void {
    const copy = copyItems(items);
    this.close();
    this.items_ = copy;
    this.popover.setSize(this.popover.width, this.height());
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.child?.dispose();
    this.child = undefined;
    this.popover.dispose();
  }
  private height(): number {
    return (
      16 +
      36 *
        (Math.max(1, Math.min(this.pageSize, this.items_.length)) +
          (this.items_.length > this.pageSize ? 1 : 0))
    );
  }
  private renderPage(): void {
    const root = this.popover.root;
    if (!root) return;
    const synced = root.syncState === 'synced';
    this.buttons.forEach((button, slot) => {
      const item = this.items_[this.page * this.pageSize + slot];
      button.setVisible(!!item);
      if (!item) return;
      button.setLabel(item.label + (item.children ? '  >' : ''));
      button.setDisabled(!!item.disabled);
    });
    this.previous?.setDisabled(this.page <= 0);
    this.next?.setDisabled((this.page + 1) * this.pageSize >= this.items_.length);
    if (synced && (root.syncState as string) === 'pending') root.flush();
  }
  private activate(slot: number, windowId: number): void {
    const index = this.page * this.pageSize + slot,
      item = this.items_[index];
    if (!item || item.disabled) return;
    if (item.children) {
      this.openChild(index);
      return;
    }
    const event: UiMenuSelection = { id: item.id, path: [item.id], windowId };
    this.close('selection');
    this.options.onSelect?.(event);
  }
  private openChild(index: number): void {
    const item = this.items_[index],
      anchor = this.buttons[index % this.pageSize]?.panel;
    if (!item?.children || item.disabled || !anchor) return;
    if (this.child?.isOpen && this.childIndex === index) return;
    this.child?.dispose();
    const child = new UiMenu(
      this.manager,
      {
        anchor,
        items: item.children,
        width: this.popover.width,
        pageSize: this.pageSize,
        placement: 'right',
        style: this.options.style,
        onSelect: (event) => {
          this.close('selection');
          this.options.onSelect?.({ ...event, path: [item.id, ...event.path] });
        },
        onClose: () => {
          if (this.child === child) {
            this.child = undefined;
            this.childIndex = -1;
            child.dispose();
          }
        }
      },
      true
    );
    this.child = child;
    this.childIndex = index;
    try {
      child.open();
    } catch (error) {
      child.dispose();
      this.child = undefined;
      this.childIndex = -1;
      throw error;
    }
  }
  private move(direction: -1 | 1, windowId: number): void {
    if (!this.items_.length) return;
    let index = this.highlighted;
    for (let i = 0; i < this.items_.length; i++) {
      index = (index + direction + this.items_.length) % this.items_.length;
      if (!this.items_[index]!.disabled) {
        this.focus(index, windowId);
        return;
      }
    }
  }
  private edge(last: boolean, windowId: number): void {
    const indices = [...this.items_.keys()];
    if (last) indices.reverse();
    const index = indices.find((i) => !this.items_[i]!.disabled);
    if (index !== undefined) this.focus(index, windowId);
  }
  private focus(index: number, windowId: number): void {
    if (this.child && this.childIndex !== index) {
      this.child.dispose();
      this.child = undefined;
      this.childIndex = -1;
    }
    this.highlighted = index;
    const page = Math.floor(index / this.pageSize);
    if (page !== this.page) {
      this.page = page;
      this.renderPage();
    }
    const button = this.buttons[index % this.pageSize];
    if (button && !button.panel.requestKeyboardFocus(windowId))
      this.popover.focusTarget = button.panel;
  }
  private changePage(direction: -1 | 1, windowId: number): void {
    this.page = Math.max(
      0,
      Math.min(Math.ceil(this.items_.length / this.pageSize) - 1, this.page + direction)
    );
    const first = this.items_.findIndex(
      (item, index) => Math.floor(index / this.pageSize) === this.page && !item.disabled
    );
    this.renderPage();
    if (first >= 0) this.focus(first, windowId);
  }
}
