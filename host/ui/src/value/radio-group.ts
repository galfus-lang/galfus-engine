import { makePanel, type UiContainerOptions, UiControl } from '../components/controls';
import type { UiPanelComponent } from '../components/component';
import { UiRadio, type UiToggleOptions } from './toggle';

export interface UiRadioOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
}
export interface UiRadioGroupOptions extends UiContainerOptions {
  readonly options?: readonly UiRadioOption[];
  readonly value?: string | null;
  readonly readOnly?: boolean;
  readonly onChange?: (value: string | null) => void;
}
/** Radio group with unique string identities and exclusive selection. */
export class UiRadioGroup extends UiControl {
  private readonly radios = new Map<string, UiRadio>();
  private readonly callbacks = new Set<(value: string | null) => void>();
  private value_: string | null = null;
  private readOnly_: boolean;
  private updating = false;
  constructor(parent: UiPanelComponent, options: UiRadioGroupOptions = {}) {
    const entries = options.options ?? [];
    const names = new Set<string>();
    for (const entry of entries) {
      if (
        typeof entry.value !== 'string' ||
        typeof entry.label !== 'string' ||
        names.has(entry.value) ||
        (entry.disabled !== undefined && typeof entry.disabled !== 'boolean') ||
        (entry.readOnly !== undefined && typeof entry.readOnly !== 'boolean')
      )
        throw new Error('Radio options require unique string values and labels and boolean flags.');
      names.add(entry.value);
    }
    if (
      options.value != null &&
      (!names.has(options.value) ||
        entries.find((entry) => entry.value === options.value)?.disabled)
    )
      throw new Error('Initial radio value must identify an enabled option.');
    if (options.spacing !== undefined && (!Number.isFinite(options.spacing) || options.spacing < 0))
      throw new RangeError('Spacing must be non-negative and finite.');
    const gap = options.spacing ?? 6;
    const panel = makePanel(parent, 'radioGroup', options, {
      direction: options.orientation === 'horizontal' ? 'row' : 'column',
      gap: [gap, gap],
      alignItems: 'start',
      ...options.layout
    });
    super(panel);
    this.readOnly_ = options.readOnly ?? false;
    panel.setReadOnly(this.readOnly_);
    if (options.onChange) this.callbacks.add(options.onChange);
    for (const entry of entries) this.addRadio(entry);
    if (options.value != null) this.setValue(options.value, false);
    const root = panel.componentRoot;
    const stop = root.onSyncState((state) => {
      if (state === 'disposed' || (state === 'synced' && !this.isAttached)) {
        this.callbacks.clear();
        this.radios.clear();
        stop();
      } else if (state === 'synced')
        for (const [id, radio] of this.radios) if (!radio.isAttached) this.radios.delete(id);
    });
  }
  get value(): string | null {
    return this.value_;
  }
  get readOnly(): boolean {
    return this.readOnly_;
  }
  get options(): readonly string[] {
    return [...this.radios].filter(([, radio]) => radio.isAttached).map(([value]) => value);
  }
  getRadio(value: string): UiRadio | undefined {
    const radio = this.radios.get(value);
    return radio?.isAttached ? radio : undefined;
  }
  setReadOnly(value: boolean): this {
    this.readOnly_ = value;
    this.panel.setReadOnly(value);
    return this;
  }
  onChange(callback: (value: string | null) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  setValue(value: string | null, emit = true): this {
    const selected = value === null ? undefined : this.getRadio(value);
    if (
      value !== null &&
      (!selected || selected.panel.componentRoot.interactionFor(selected.panel.id).isDisabled())
    )
      throw new Error('Radio value must identify an enabled option.');
    if (value === this.value_) return this;
    const root = this.panel.componentRoot;
    const synced = root.syncState === 'synced';
    this.value_ = value;
    const changed: Array<{ radio: UiRadio; checked: boolean }> = [];
    this.updating = true;
    try {
      for (const [id, radio] of this.radios)
        if (radio.isAttached) {
          const checked = id === value;
          if (radio.checked !== checked) changed.push({ radio, checked });
          radio.setChecked(checked, false);
        }
    } finally {
      this.updating = false;
    }
    if (synced && (root.syncState as string) === 'pending') root.flush();
    if (emit) {
      for (const callback of [...this.callbacks]) callback(value);
      for (const item of changed)
        if (item.radio.isAttached && item.radio.checked === item.checked)
          item.radio.notifyValue(item.checked);
    }
    return this;
  }
  addRadio(
    option: UiRadioOption,
    extra: Omit<UiToggleOptions, 'value' | 'label' | 'disabled' | 'readOnly'> = {}
  ): UiRadio {
    if (
      typeof option.value !== 'string' ||
      typeof option.label !== 'string' ||
      this.radios.has(option.value) ||
      (option.disabled !== undefined && typeof option.disabled !== 'boolean') ||
      (option.readOnly !== undefined && typeof option.readOnly !== 'boolean')
    )
      throw new Error('Radio options require unique string values and labels and boolean flags.');
    const { onChange, ...configuration } = extra;
    const radio = new UiRadio(this.panel, {
      ...configuration,
      value: false,
      label: option.label,
      disabled: option.disabled,
      readOnly: option.readOnly
    });
    this.radios.set(option.value, radio);
    radio.userGuard = () => !this.readOnly_;
    radio.beforeChecked = () => {
      if (radio.panel.componentRoot.interactionFor(radio.panel.id).isDisabled())
        throw new Error('Disabled radio options cannot be selected.');
    };
    radio.onUnavailable = () => {
      if (this.value_ === option.value) this.setValue(null);
    };
    radio.onRemoved = () => {
      if (this.value_ === option.value) this.setValue(null);
      radio.clearDetached();
    };
    radio.onChange((checked) => {
      if (this.updating) return;
      if (checked) this.setValue(option.value);
      else if (this.value_ === option.value) this.setValue(null);
    });
    if (onChange) radio.onChange(onChange);
    radio.panel.onKeyboard((event) => {
      if (
        event.type !== 'input' ||
        event.state !== 'pressed' ||
        event.modifiers.ctrl ||
        event.modifiers.alt ||
        event.modifiers.superKey
      )
        return;
      const forward = event.logicalKey === 'ArrowRight' || event.logicalKey === 'ArrowDown';
      const backward = event.logicalKey === 'ArrowLeft' || event.logicalKey === 'ArrowUp';
      if (!forward && !backward) return;
      const candidates = [...this.radios].filter(
        ([, item]) => item.isAttached && !item.getInteractionState(event.windowId).disabled
      );
      if (!candidates.length) return;
      const current = candidates.findIndex(([value]) => value === option.value);
      const next =
        candidates[(current + (forward ? 1 : -1) + candidates.length) % candidates.length]!;
      if (!next[1].panel.requestKeyboardFocus(event.windowId)) return;
      if (!this.readOnly_ && !radio.readOnly && !next[1].readOnly) this.setValue(next[0]);
    });
    return radio;
  }
  removeRadio(value: string): void {
    this.getRadio(value)?.remove();
  }
}
