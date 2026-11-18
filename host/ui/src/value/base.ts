import type { UiStyleState } from '../style/theme';
import { UiControl, type UiControlOptions } from '../components/controls';
import type { UiPanelComponent } from '../components/component';

export interface UiValueOptions<T> extends UiControlOptions {
  readonly value?: T;
  readonly tabIndex?: number;
  readonly readOnly?: boolean;
  readonly onChange?: (value: T) => void;
}
export type UiValueCallback<T> = (value: T) => void;

/** Value changes are immediate; visual mutations follow the root's staged contract. */
export abstract class UiValueControl<T> extends UiControl {
  protected value_: T;
  protected readOnly_ = false;
  private readonly listeners = new Set<UiValueCallback<T>>();
  private ready = false;
  protected constructor(panel: UiPanelComponent, initial: T, options: UiValueOptions<T>) {
    super(panel);
    this.value_ = initial;
    if (options.onChange) this.listeners.add(options.onChange);
    this.readOnly_ = options.readOnly ?? false;
  }
  protected initialize(): void {
    this.panel.setReadOnly(this.readOnly_);
    this.syncView();
    this.ready = true;
    const root = this.panel.componentRoot;
    const stop = root.onSyncState((state) => {
      if (state === 'disposed' || (state === 'synced' && !this.isAttached)) {
        this.listeners.clear();
        stop();
      } else if (state === 'synced' && this.ready && this.isAttached) {
        this.syncView();
        if ((root.syncState as string) === 'pending') root.flush();
      }
    });
  }
  get value(): T {
    return this.value_;
  }
  get readOnly(): boolean {
    return this.readOnly_;
  }
  setReadOnly(value: boolean): this {
    this.readOnly_ = value;
    this.panel.setReadOnly(value);
    return this;
  }
  setInvalid(value: boolean): this {
    this.panel.setInvalid(value);
    return this;
  }
  setTabIndex(index: number): this {
    this.panel.setFocusable(index);
    return this;
  }
  requestFocus(windowId?: number): boolean {
    return this.panel.requestFocus(windowId);
  }
  blur(windowId?: number): void {
    this.panel.blur(windowId);
  }
  onChange(callback: UiValueCallback<T>): () => void {
    if (!this.isAttached) throw new Error('Control is not attached.');
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  setValue(value: T, emit = true): this {
    if (!this.isAttached) throw new Error('Control is not attached.');
    const next = this.normalize(value);
    if (Object.is(this.value_, next)) return this;
    const root = this.panel.componentRoot;
    const synced = root.syncState === 'synced';
    this.value_ = next;
    if (this.ready && this.isAttached) this.syncView();
    if (synced && (root.syncState as string) === 'pending') root.flush();
    if (emit) this.notifyValue(next);
    return this;
  }
  /** @internal */
  notifyValue(value: T): void {
    for (const callback of [...this.listeners]) callback(value);
  }
  protected canUserChange(windowId: number): boolean {
    return this.isAttached && !this.readOnly_ && !this.panel.getInteractionState(windowId).disabled;
  }
  protected state(state: UiStyleState, enabled: boolean): void {
    const current = this.panel.componentRoot.nodeSnapshot(this.panel.id).style.activeStates ?? [];
    if (current.includes(state) !== enabled) this.panel.setStyleState(state, enabled);
  }
  protected abstract normalize(value: T): T;
  protected abstract syncView(): void;
}
