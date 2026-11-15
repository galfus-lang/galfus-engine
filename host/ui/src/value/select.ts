import { makePanel, UiButton } from '../components/controls';
import type { UiPanelComponent, UiTextComponent } from '../components/component';
import type { UiOverlayManager } from '../overlay/manager';
import type { UiPopover } from '../overlay/popover';
import { UiValueControl, type UiValueOptions } from './base';
import { UiIcon } from '../icons/component';
import type { UiIconAtlas } from '../icons/atlas';

export interface UiSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}
export interface UiSelectOptions extends UiValueOptions<string | null> {
  readonly options: readonly UiSelectOption[];
  readonly placeholder?: string;
  readonly width?: number;
  readonly pageSize?: number;
  readonly iconAtlas?: UiIconAtlas;
}
function validateOptions(options: readonly UiSelectOption[]): UiSelectOption[] {
  const seen = new Set<string>();
  return options.map((option) => {
    if (
      typeof option.value !== 'string' ||
      typeof option.label !== 'string' ||
      seen.has(option.value) ||
      (option.disabled !== undefined && typeof option.disabled !== 'boolean')
    )
      throw new Error(
        'Select options require unique string values, labels and boolean disabled flags.'
      );
    seen.add(option.value);
    return {
      value: option.value,
      label: option.label,
      ...(option.disabled === undefined ? {} : { disabled: option.disabled })
    };
  });
}
function validValue(value: string | null, options: readonly UiSelectOption[]): boolean {
  return (
    value === null ||
    (typeof value === 'string' && options.some((item) => item.value === value && !item.disabled))
  );
}
/** Selects one stable string identity from a paginated, owned popover. */
export class UiSelect extends UiValueControl<string | null> {
  readonly labelNode: UiTextComponent;
  readonly popover: UiPopover;
  readonly icon: UiIcon;
  private options_: UiSelectOption[];
  private readonly placeholder: string;
  private readonly pageSize: number;
  private page = 0;
  private highlighted = -1;
  private buttons: UiButton[] = [];
  private prev?: UiButton;
  private next?: UiButton;
  constructor(parent: UiPanelComponent, manager: UiOverlayManager, options: UiSelectOptions) {
    if (!manager.ownsAnchor(parent))
      throw new Error('Select parent must belong to the overlay manager.');
    const values = validateOptions(options.options);
    const value = options.value ?? null;
    if (!validValue(value, values))
      throw new Error('Select value must identify an enabled option.');
    const width = options.width ?? 220,
      pageSize = options.pageSize ?? 6;
    if (
      !Number.isFinite(width) ||
      width <= 32 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 50
    )
      throw new RangeError('Invalid select width or page size.');
    if (options.tabIndex !== undefined && !Number.isSafeInteger(options.tabIndex))
      throw new RangeError('tabIndex must be a safe integer.');
    const panel = makePanel(parent, 'select', options, {
      direction: 'row',
      padding: [8, 12, 8, 12],
      alignItems: 'center',
      justifyContent: 'spaceBetween',
      gap: [8, 0],
      minHeight: 36,
      ...options.layout,
      width: { type: 'exact', value: width }
    });
    super(panel, value, options);
    this.options_ = values;
    this.placeholder = options.placeholder ?? 'Select...';
    this.pageSize = pageSize;
    this.labelNode = panel.addText('');
    try {
      this.icon = new UiIcon(panel, 'select', 'closed', options.iconAtlas, ['open']);
    } catch (error) {
      panel.remove();
      throw error;
    }
    panel.setFocusable(options.tabIndex);
    const rows = Math.max(1, Math.min(pageSize, values.length));
    this.popover = manager.createPopover({
      anchor: panel,
      width,
      height: 16 + 36 * (rows + (values.length > pageSize ? 1 : 0)),
      build: (root) => {
        this.buttons = [];
        const rows = Math.max(1, Math.min(this.pageSize, this.options_.length));
        for (let slot = 0; slot < rows; slot++) {
          const button = new UiButton(root.root, {
            label: '',
            layout: {
              direction: 'row',
              justifyContent: 'start',
              width: { type: 'percent', value: 100 },
              height: { type: 'exact', value: 36 }
            },
            onActivate: ({ windowId }) => this.chooseSlot(slot, windowId)
          });
          button.setStateStyle('checked', { backgroundColor: [0.12, 0.4, 0.58, 1] });
          button.panel.onKeyboard((event) => {
            if (
              event.type !== 'input' ||
              event.state !== 'pressed' ||
              event.modifiers.ctrl ||
              event.modifiers.alt ||
              event.modifiers.superKey
            )
              return;
            if (event.logicalKey === 'ArrowDown' || event.logicalKey === 'ArrowRight')
              this.moveHighlight(1, event.windowId);
            else if (event.logicalKey === 'ArrowUp' || event.logicalKey === 'ArrowLeft')
              this.moveHighlight(-1, event.windowId);
            else if (event.logicalKey === 'Home') this.highlightEdge(false, event.windowId);
            else if (event.logicalKey === 'End') this.highlightEdge(true, event.windowId);
          });
          this.buttons.push(button);
        }
        if (this.options_.length > this.pageSize) {
          const nav = root.root.addPanel(
            { backgroundColor: [0, 0, 0, 0] },
            {
              direction: 'row',
              gap: [4, 0],
              justifyContent: 'spaceBetween',
              width: { type: 'percent', value: 100 }
            }
          );
          this.prev = new UiButton(nav, {
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
      onClose: () => {
        this.buttons = [];
        this.prev = undefined;
        this.next = undefined;
        if (this.icon.panel.isAttached) this.icon.setState('closed');
      }
    });
    panel.onActivate(({ windowId }) => {
      if (!this.panel.getInteractionState(windowId).disabled) this.toggle();
    });
    panel.onKeyboard((event) => {
      if (
        event.type !== 'input' ||
        event.state !== 'pressed' ||
        event.modifiers.ctrl ||
        event.modifiers.alt ||
        event.modifiers.superKey
      )
        return;
      if (event.logicalKey === 'ArrowDown' || event.logicalKey === 'ArrowUp') {
        if (!this.popover.isOpen) this.open();
        else this.moveHighlight(event.logicalKey === 'ArrowDown' ? 1 : -1, event.windowId);
      }
    });
    const root = panel.componentRoot;
    const stop = root.onSyncState((state) => {
      if (state === 'disposed' || (state === 'synced' && !panel.isAttached)) {
        this.popover.dispose();
        stop();
      }
    });
    this.initialize();
  }
  get options(): readonly UiSelectOption[] {
    return this.options_.map((item) => ({ ...item }));
  }
  get isOpen(): boolean {
    return this.popover.isOpen;
  }
  open(): void {
    if (!this.isAttached || this.panel.getInteractionState().disabled || this.popover.isOpen)
      return;
    this.highlighted = this.options_.findIndex(
      (item) => item.value === this.value && !item.disabled
    );
    if (this.highlighted < 0) this.highlighted = this.options_.findIndex((item) => !item.disabled);
    this.page = this.highlighted < 0 ? 0 : Math.floor(this.highlighted / this.pageSize);
    this.popover.open();
    this.icon.setState('open');
  }
  close(): void {
    this.popover.close();
  }
  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
  override setDisabled(value: boolean): this {
    super.setDisabled(value);
    if (value) this.close();
    return this;
  }
  override setValue(value: string | null, emit = true): this {
    super.setValue(value, emit);
    if (this.isOpen) this.renderPage();
    return this;
  }
  override remove(): void {
    this.popover.close('anchor-removed');
    super.remove();
  }
  setOptions(options: readonly UiSelectOption[]): this {
    const values = validateOptions(options);
    // Rebuild on the next opening so page count and popup dimensions stay coherent.
    if (this.isOpen) this.close();
    const root = this.panel.componentRoot,
      synced = root.syncState === 'synced';
    const rows = Math.max(1, Math.min(this.pageSize, values.length));
    this.popover.setSize(
      this.popover.width,
      16 + 36 * (rows + (values.length > this.pageSize ? 1 : 0))
    );
    this.options_ = values;
    if (!validValue(this.value, values)) this.setValue(null);
    else this.syncView();
    if (synced && (root.syncState as string) === 'pending') root.flush();
    return this;
  }
  protected normalize(value: string | null): string | null {
    if (!validValue(value, this.options_))
      throw new Error('Select value must identify an enabled option.');
    return value;
  }
  protected syncView(): void {
    const text =
      this.options_.find((item) => item.value === this.value_)?.label ?? this.placeholder;
    if (this.labelNode.text !== text) this.labelNode.setText(text);
    this.state('checked', this.value_ !== null);
  }
  private renderPage(): void {
    const root = this.popover.root;
    if (!root) return;
    const synced = root.syncState === 'synced';
    this.buttons.forEach((button, slot) => {
      const option = this.options_[this.page * this.pageSize + slot];
      button.setVisible(!!option);
      if (!option) return;
      button.setLabel(option.label);
      button.setDisabled(!!option.disabled);
      button.panel.setStyleState('checked', option.value === this.value);
    });
    this.prev?.setDisabled(this.page <= 0);
    this.next?.setDisabled((this.page + 1) * this.pageSize >= this.options_.length);
    if (synced && (root.syncState as string) === 'pending') root.flush();
  }
  private chooseSlot(slot: number, windowId: number): void {
    const option = this.options_[this.page * this.pageSize + slot];
    if (!option || option.disabled || !this.canUserChange(windowId)) return;
    this.setValue(option.value);
    this.close();
  }
  private moveHighlight(direction: -1 | 1, windowId: number): void {
    if (!this.options_.length) return;
    let current = this.highlighted;
    for (let i = 0; i < this.options_.length; i++) {
      current = (current + direction + this.options_.length) % this.options_.length;
      if (!this.options_[current]!.disabled) {
        this.focusOption(current, windowId);
        return;
      }
    }
  }
  private highlightEdge(last: boolean, windowId: number): void {
    const indices = [...this.options_.keys()];
    if (last) indices.reverse();
    const found = indices.find((index) => !this.options_[index]!.disabled);
    if (found !== undefined) this.focusOption(found, windowId);
  }
  private focusOption(index: number, windowId: number): void {
    this.highlighted = index;
    const nextPage = Math.floor(index / this.pageSize);
    if (this.page !== nextPage) {
      this.page = nextPage;
      this.renderPage();
    }
    const button = this.buttons[index % this.pageSize];
    if (button && !button.panel.requestKeyboardFocus(windowId))
      this.popover.focusTarget = button.panel;
  }
  private changePage(direction: -1 | 1, windowId: number): void {
    const count = Math.ceil(this.options_.length / this.pageSize);
    this.page = Math.max(0, Math.min(count - 1, this.page + direction));
    const first = this.options_.findIndex(
      (item, index) => Math.floor(index / this.pageSize) === this.page && !item.disabled
    );
    this.renderPage();
    if (first >= 0) this.focusOption(first, windowId);
  }
}
