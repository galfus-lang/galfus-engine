import { makePanel, type UiControlOptions } from '../components/controls';
import type { UiPanelComponent, UiTextComponent } from '../components/component';
import { UiValueControl, type UiValueOptions } from './base';
import type { UiComponentStyleKind } from '../style/theme';
import { UiIcon } from '../icons/component';
import type { UiIconAtlas } from '../icons/atlas';

export interface UiToggleOptions extends UiValueOptions<boolean> {
  readonly label?: string;
  readonly iconAtlas?: UiIconAtlas;
}
function checkBoolean(value: boolean): boolean {
  if (typeof value !== 'boolean') throw new TypeError('Value must be a boolean.');
  return value;
}

export abstract class UiToggle extends UiValueControl<boolean> {
  readonly labelNode: UiTextComponent;
  readonly icon: UiIcon;
  protected label_: string;
  /** @internal */ userGuard?: () => boolean;
  protected constructor(
    parent: UiPanelComponent,
    kind: UiComponentStyleKind,
    options: UiToggleOptions,
    private readonly iconName: 'checkbox' | 'radio' | 'switch',
    private readonly toggle: boolean
  ) {
    const initial = checkBoolean(options.value === undefined ? false : options.value);
    if (options.label !== undefined && typeof options.label !== 'string')
      throw new TypeError('Label must be a string.');
    if (options.tabIndex !== undefined && !Number.isSafeInteger(options.tabIndex))
      throw new RangeError('tabIndex must be a safe integer.');
    const panel = makePanel(parent, kind, options as UiControlOptions, {
      direction: 'row',
      padding: [4, 6, 4, 2],
      alignItems: 'center',
      gap: [8, 0],
      minHeight: 28,
      ...options.layout
    });
    super(panel, initial, options);
    try {
      this.label_ = options.label ?? '';
      const state = this.iconState(initial);
      this.icon = new UiIcon(panel, iconName, state, options.iconAtlas, [this.iconState(!initial)]);
      this.labelNode = panel.addText('');
      panel.setFocusable(options.tabIndex);
      panel.onActivate(({ windowId }) => {
        if (this.canUserChange(windowId) && (this.userGuard?.() ?? true))
          this.setValue(this.toggle ? !this.value : true);
      });
      this.initialize();
    } catch (error) {
      panel.remove();
      throw error;
    }
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
    this.icon.setState(this.iconState(this.value_));
    if (this.labelNode.text !== this.label_) this.labelNode.setText(this.label_);
  }
  private iconState(value: boolean): string {
    return this.iconName === 'switch' ? (value ? 'on' : 'off') : value ? 'checked' : 'unchecked';
  }
}
export class UiCheckbox extends UiToggle {
  constructor(parent: UiPanelComponent, options: UiToggleOptions = {}) {
    super(parent, 'checkbox', options, 'checkbox', true);
  }
}
export class UiSwitch extends UiToggle {
  constructor(parent: UiPanelComponent, options: UiToggleOptions = {}) {
    super(parent, 'switch', options, 'switch', true);
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
    super(parent, 'radio', options, 'radio', false);
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
