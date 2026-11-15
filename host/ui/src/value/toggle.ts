import { makePanel, type UiControlOptions } from '../components/controls';
import type { UiPanelComponent, UiTextComponent } from '../components/component';
import { UiValueControl, type UiValueOptions } from './base';
import type { UiComponentStyleKind } from '../style/theme';

export interface UiToggleOptions extends UiValueOptions<boolean> {
  readonly label?: string;
}
function checkBoolean(value: boolean): boolean {
  if (typeof value !== 'boolean') throw new TypeError('Value must be a boolean.');
  return value;
}

export abstract class UiToggle extends UiValueControl<boolean> {
  readonly labelNode: UiTextComponent;
  protected label_: string;
  /** @internal */ userGuard?: () => boolean;
  protected constructor(
    parent: UiPanelComponent,
    kind: UiComponentStyleKind,
    options: UiToggleOptions,
    private readonly marker: (value: boolean) => string,
    private readonly toggle: boolean
  ) {
    const initial = checkBoolean(options.value === undefined ? false : options.value);
    if (options.label !== undefined && typeof options.label !== 'string')
      throw new TypeError('Label must be a string.');
    if (options.tabIndex !== undefined && !Number.isSafeInteger(options.tabIndex))
      throw new RangeError('tabIndex must be a safe integer.');
    const panel = makePanel(parent, kind, options as UiControlOptions, {
      direction: 'row',
      padding: [7, 10, 7, 10],
      alignItems: 'center',
      minHeight: 34,
      ...options.layout
    });
    super(panel, initial, options);
    this.label_ = options.label ?? '';
    this.labelNode = panel.addText('');
    panel.setFocusable(options.tabIndex);
    panel.onActivate(({ windowId }) => {
      if (this.canUserChange(windowId) && (this.userGuard?.() ?? true))
        this.setValue(this.toggle ? !this.value : true);
    });
    this.initialize();
  }
  get checked(): boolean {
    return this.value;
  }
  setChecked(value: boolean, emit = true): this {
    return this.setValue(value, emit);
  }
  get label(): string {
    return this.label_;
  }
  setLabel(label: string): this {
    this.label_ = label;
    this.syncView();
    return this;
  }
  protected normalize(value: boolean): boolean {
    return checkBoolean(value);
  }
  protected syncView(): void {
    this.state('checked', this.value_);
    const label = this.label_
      ? `${this.marker(this.value_)}  ${this.label_}`
      : this.marker(this.value_);
    if (this.labelNode.text !== label) this.labelNode.setText(label);
  }
}
export class UiCheckbox extends UiToggle {
  constructor(parent: UiPanelComponent, options: UiToggleOptions = {}) {
    super(parent, 'checkbox', options, (value) => (value ? '[x]' : '[ ]'), true);
  }
}
export class UiSwitch extends UiToggle {
  constructor(parent: UiPanelComponent, options: UiToggleOptions = {}) {
    super(parent, 'switch', options, (value) => (value ? '[ON]' : '[OFF]'), true);
  }
}
export class UiRadio extends UiToggle {
  /** @internal */ onUnavailable?: () => void;
  /** @internal */ onRemoved?: () => void;
  /** @internal */ beforeChecked?: () => void;
  /** @internal */ clearDetached(): void {
    this.value_ = false;
  }
  constructor(parent: UiPanelComponent, options: UiToggleOptions = {}) {
    super(parent, 'radio', options, (value) => (value ? '(●)' : '( )'), false);
  }
  override setValue(value: boolean, emit = true): this {
    if (value) this.beforeChecked?.();
    return super.setValue(value, emit);
  }
  override setDisabled(value: boolean): this {
    super.setDisabled(value);
    if (value) this.onUnavailable?.();
    return this;
  }
  override remove(): void {
    if (!this.isAttached) return;
    super.remove();
    this.onRemoved?.();
  }
}
