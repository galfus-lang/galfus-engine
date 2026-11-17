import type { KeyboardEvent } from '@galfus/transport-types';
import type { Focusable, FocusManager } from '../focus';
import type { UiStyleState } from '../style/theme';
import type { ComponentRoot } from './root';

export interface UiInteractionState {
  readonly hover: boolean;
  readonly active: boolean;
  readonly focus: boolean;
  readonly focusVisible: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly invalid: boolean;
}
export interface UiActivationEvent {
  readonly source: 'pointer' | 'keyboard';
  readonly windowId: number;
}
export type UiActivationCallback = (event: UiActivationEvent) => void;

interface WindowState {
  hover: Set<number>;
  pressed: Set<number>;
  focus: boolean;
  focusVisible: boolean;
  key?: string;
}

/** Interaction state for a panel. Text remains a non-interactive leaf. */
export class PanelInteraction {
  private readonly windows = new Map<number, WindowState>();
  private readonly callbacks = new Set<UiActivationCallback>();
  private readonly keyboardCallbacks = new Set<(event: KeyboardEvent) => void>();
  private focusable?: Focusable;
  private disabled = false;
  private readOnly = false;
  private invalid = false;
  private readonly stop: (() => void)[] = [];

  constructor(
    private readonly owner: ComponentInteractions,
    readonly id: number
  ) {
    this.attachTarget(id);
  }

  /** Route events from a decorative child panel through the owning control. */
  attachTarget(id: number): void {
    const listener = this.owner.root.panelListener(id);
    const on = listener.on.bind(listener);
    this.stop.push(
      on('hover', ({ pointer }) => {
        if (!this.accepts(pointer.windowId)) return;
        this.window(pointer.windowId).hover.add(pointer.pointerId);
        this.update();
      })
    );
    this.stop.push(
      on('leave', ({ pointer }) => {
        this.windows.get(pointer.windowId)?.hover.delete(pointer.pointerId);
        this.update();
      })
    );
    this.stop.push(
      on('down', ({ pointer }) => {
        if (
          !this.accepts(pointer.windowId) ||
          pointer.type !== 'button' ||
          pointer.button !== 'primary'
        )
          return;
        const state = this.window(pointer.windowId);
        state.pressed.add(pointer.pointerId);
        state.focusVisible = false;
        if (id !== this.id && this.focusable)
          this.owner.focus.requestFocus(this.focusable, pointer.windowId, 'pointer');
        this.update();
      })
    );
    for (const type of ['pressup', 'cancel'] as const)
      this.stop.push(
        on(type, ({ pointer }) => {
          this.windows.get(pointer.windowId)?.pressed.delete(pointer.pointerId);
          this.update();
        })
      );
    this.stop.push(
      on('click', ({ pointer }) => {
        if (
          this.accepts(pointer.windowId) &&
          pointer.type === 'button' &&
          pointer.button === 'primary'
        )
          this.activate('pointer', pointer.windowId);
      })
    );
  }

  setFocusable(tabIndex: number): void {
    if (!Number.isSafeInteger(tabIndex)) throw new RangeError('tabIndex must be a safe integer.');
    if (this.focusable) this.focusable.setTabIndex(tabIndex);
    else {
      this.focusable = this.owner.focus.register(
        this.owner.root.panelListener(this.id),
        tabIndex,
        this.owner.windowId,
        () => this.owner.root.wasPresented(this.id),
        (listener) =>
          listener.realmId === this.owner.root.realm.realmId &&
          listener.target.type === 'ui' &&
          listener.target.uiId === this.owner.root.uiId &&
          this.owner.root.containsPanel(this.id, Number(listener.target.elementId))
      );
      this.focusable.on('focus', ({ windowId, source }) => {
        const state = this.window(windowId);
        state.focus = true;
        state.focusVisible = source === 'keyboard';
        this.update();
      });
      this.focusable.on('blur', ({ windowId }) => {
        const state = this.window(windowId);
        state.focus = false;
        state.focusVisible = false;
        state.key = undefined;
        this.update();
      });
    }
    this.owner.reconcile();
  }
  setDisabled(value: boolean): void {
    if (this.disabled === value) return;
    this.disabled = value;
    this.owner.reconcile();
    this.update();
  }
  setReadOnly(value: boolean): void {
    this.readOnly = value;
    this.update();
  }
  setInvalid(value: boolean): void {
    this.invalid = value;
    this.update();
  }
  isDisabled(): boolean {
    return this.disabled;
  }
  /** @internal */
  getFocusable(): Focusable | undefined {
    return this.focusable;
  }
  requestFocus(windowId?: number): boolean {
    return this.focusable?.requestFocus(windowId) ?? false;
  }
  blur(windowId?: number): void {
    this.focusable?.blur(windowId);
  }
  onActivate(callback: UiActivationCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  onKeyboard(callback: (event: KeyboardEvent) => void): () => void {
    this.keyboardCallbacks.add(callback);
    return () => this.keyboardCallbacks.delete(callback);
  }
  requestKeyboardFocus(windowId: number): boolean {
    const focused = this.focusable
      ? this.owner.focus.requestFocus(this.focusable, windowId, 'keyboard')
      : false;
    if (focused) {
      this.window(windowId).focusVisible = true;
      this.update();
    }
    return focused;
  }
  getState(windowId?: number): UiInteractionState {
    const states =
      windowId === undefined
        ? [...this.windows.values()]
        : [this.windows.get(windowId)].filter((s): s is WindowState => !!s);
    return {
      hover: states.some((s) => s.hover.size > 0),
      active: states.some((s) => s.pressed.size > 0 || s.key !== undefined),
      focus: states.some((s) => s.focus),
      focusVisible: states.some((s) => s.focusVisible),
      disabled: this.owner.root.interactionDisabled(this.id),
      readOnly: this.readOnly,
      invalid: this.invalid
    };
  }
  handleKeyboard(event: KeyboardEvent): void {
    if (
      event.type !== 'input' ||
      !this.focusable ||
      this.owner.focus.getFocused(event.windowId) !== this.focusable
    )
      return;
    if (
      event.logicalKey === 'Tab' &&
      event.state === 'pressed' &&
      !event.modifiers.ctrl &&
      !event.modifiers.alt &&
      !event.modifiers.superKey
    ) {
      this.window(event.windowId).focusVisible = true;
      this.update();
      return;
    }
    const key =
      event.logicalKey === 'Enter'
        ? 'Enter'
        : event.logicalKey === ' ' || event.physicalKey === 'Space'
          ? 'Space'
          : undefined;
    if (!key) {
      if (
        event.state === 'pressed' &&
        this.keyboardCallbacks.size &&
        [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
          'PageUp',
          'PageDown'
        ].includes(event.logicalKey)
      ) {
        this.window(event.windowId).focusVisible = true;
        this.update();
      }
      for (const callback of [...this.keyboardCallbacks]) callback(event);
      return;
    }
    const state = this.window(event.windowId);
    if (event.state === 'pressed') {
      if (
        event.repeat ||
        event.modifiers.ctrl ||
        event.modifiers.alt ||
        event.modifiers.superKey ||
        state.key
      )
        return;
      state.focusVisible = true;
      state.key = key;
      this.update();
    } else if (state.key === key) {
      state.key = undefined;
      this.update();
      if (this.accepts(event.windowId)) this.activate('keyboard', event.windowId);
    }
  }
  reconcile(): void {
    const enabled = this.owner.root.interactionEligible(this.id);
    if (this.focusable && !this.focusable.isDisposed) this.focusable.setEnabled(enabled);
    if (!enabled) {
      for (const state of this.windows.values()) {
        state.hover.clear();
        state.pressed.clear();
        state.key = undefined;
      }
      this.update();
    } else this.update();
  }
  windowClosed(windowId: number): void {
    this.windows.delete(windowId);
    this.update();
  }
  cancelKeyboard(windowId: number): void {
    const state = this.windows.get(windowId);
    if (state?.key) {
      state.key = undefined;
      this.update();
    }
  }
  dispose(): void {
    this.focusable?.dispose();
    for (const stop of this.stop) stop();
    this.callbacks.clear();
    this.keyboardCallbacks.clear();
    this.windows.clear();
  }
  private accepts(windowId: number): boolean {
    return (
      (this.owner.windowId === undefined || this.owner.windowId === windowId) &&
      this.owner.root.interactionEligible(this.id)
    );
  }
  private window(id: number): WindowState {
    let state = this.windows.get(id);
    if (!state)
      this.windows.set(
        id,
        (state = { hover: new Set(), pressed: new Set(), focus: false, focusVisible: false })
      );
    return state;
  }
  private update(): void {
    const state = this.getState();
    const active = Object.keys(state).filter(
      (key) => state[key as keyof UiInteractionState]
    ) as UiStyleState[];
    this.owner.root.setInteractionStates(this.id, active);
  }
  private activate(source: UiActivationEvent['source'], windowId: number): void {
    for (const callback of [...this.callbacks]) callback({ source, windowId });
  }
}

export class ComponentInteractions {
  private readonly panels = new Map<number, PanelInteraction>();
  private readonly composing = new Set<number>();
  constructor(
    readonly root: ComponentRoot,
    readonly focus: FocusManager,
    readonly windowId?: number
  ) {}
  get(id: number): PanelInteraction {
    let panel = this.panels.get(id);
    if (!panel) this.panels.set(id, (panel = new PanelInteraction(this, id)));
    return panel;
  }
  isDisabled(id: number): boolean {
    return this.panels.get(id)?.isDisabled() ?? false;
  }
  afterDispatch(): void {
    // Focus afterDispatch is invoked once per frame by UiSystem
  }
  reconcile(committed = false): void {
    for (const [id, panel] of this.panels) {
      if (committed && !this.root.hasNode(id)) {
        panel.dispose();
        this.panels.delete(id);
      } else panel.reconcile();
    }
  }
  handleKeyboard(event: KeyboardEvent): void {
    if (event.type === 'imePreedit') {
      if (event.text) {
        this.composing.add(event.windowId);
        for (const panel of this.panels.values()) panel.cancelKeyboard(event.windowId);
      } else this.composing.delete(event.windowId);
    } else if (event.type === 'imeCommit' || event.type === 'imeDisabled')
      this.composing.delete(event.windowId);
    if (this.composing.has(event.windowId)) return;
    const focused = this.focus.getFocused(event.windowId);
    for (const panel of this.panels.values())
      if (panel.getFocusable() === focused) {
        panel.handleKeyboard(event);
        break;
      }
  }
  windowClosed(id: number): void {
    this.composing.delete(id);
    for (const panel of this.panels.values()) panel.windowClosed(id);
  }
  dispose(): void {
    for (const panel of this.panels.values()) panel.dispose();
    this.panels.clear();
  }
}
