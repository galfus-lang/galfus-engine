import type { InteractiveListener, InteractiveSystem, InteractiveTarget } from '@galfus/engine';
import type { KeyboardEvent, PointerEvent } from '@galfus/transport-types';

export type FocusEventType = 'focus' | 'blur';
export interface FocusEvent {
  readonly type: FocusEventType;
  readonly windowId: number;
  readonly realmId: number;
  readonly target: InteractiveTarget;
  readonly source?: 'pointer' | 'keyboard' | 'programmatic';
}
export type FocusCallback = (event: FocusEvent) => void;

/** A pointer target that can also receive focus in one or more windows. */
export class Focusable {
  private readonly callbacks = new Map<FocusEventType, Set<FocusCallback>>();
  private disposed = false;
  private disposing = false;
  private enabled_ = true;
  private tabIndex_: number;

  constructor(
    readonly listener: InteractiveListener,
    private readonly manager: FocusManager,
    tabIndex: number,
    readonly windowId?: number,
    private readonly isPresented: () => boolean = () => true,
    private readonly containsPointer: (listener: InteractiveListener) => boolean = (listener) =>
      listener === this.listener ||
      (listener.realmId === this.listener.realmId &&
        listener.target.type === this.listener.target.type &&
        (listener.target.type === 'collider' && this.listener.target.type === 'collider'
          ? listener.target.entityId === this.listener.target.entityId &&
            listener.target.colliderId === this.listener.target.colliderId
          : listener.target.type === 'ui' && this.listener.target.type === 'ui'
            ? listener.target.uiId === this.listener.target.uiId &&
              listener.target.elementId === this.listener.target.elementId
            : false))
  ) {
    this.tabIndex_ = Focusable.validateTabIndex(tabIndex);
    listener.on('down', ({ pointer }) => {
      if (pointer.type === 'button' && pointer.button === 'primary')
        this.manager.requestFocus(this, pointer.windowId, 'pointer');
    });
  }

  get realmId(): number {
    return this.listener.realmId;
  }
  get target(): InteractiveTarget {
    return this.listener.target;
  }
  get isDisposed(): boolean {
    return this.disposed;
  }
  get enabled(): boolean {
    return this.enabled_;
  }
  get tabIndex(): number {
    return this.tabIndex_;
  }
  /** @internal */
  get eligible(): boolean {
    return this.enabled && this.isPresented();
  }
  /** @internal */
  acceptsPointer(listener: InteractiveListener | undefined): boolean {
    return !!listener && this.containsPointer(listener);
  }

  setEnabled(enabled: boolean): void {
    this.assertLive();
    if (this.enabled_ === enabled) return;
    this.enabled_ = enabled;
    if (!enabled) this.manager.blurTarget(this);
    else this.manager.refreshCapture();
  }

  setTabIndex(index: number): void {
    this.assertLive();
    this.tabIndex_ = Focusable.validateTabIndex(index);
    this.manager.refreshCapture();
  }

  requestFocus(windowId?: number): boolean {
    this.assertLive();
    return this.manager.requestFocus(this, windowId);
  }

  blur(windowId?: number): void {
    this.assertLive();
    this.manager.blurTarget(this, windowId);
  }

  on(type: FocusEventType, callback: FocusCallback): () => void {
    this.assertLive();
    let callbacks = this.callbacks.get(type);
    if (!callbacks) this.callbacks.set(type, (callbacks = new Set()));
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }

  off(type: FocusEventType, callback: FocusCallback): void {
    this.callbacks.get(type)?.delete(callback);
  }

  /** @internal */
  emit(type: FocusEventType, windowId: number, source?: FocusEvent['source']): void {
    const event = { type, windowId, realmId: this.realmId, target: this.target, source };
    for (const callback of this.callbacks.get(type) ?? []) {
      callback(event);
      if (this.disposed) break;
    }
  }

  dispose(): void {
    if (this.disposed || this.disposing) return;
    this.disposing = true;
    this.manager.remove(this);
    this.disposed = true;
    this.callbacks.clear();
    this.listener.dispose();
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('Focusable is disposed.');
  }

  private static validateTabIndex(index: number): number {
    if (!Number.isSafeInteger(index)) throw new RangeError('tabIndex must be a safe integer.');
    return index;
  }
}

/** Keeps focus per window; only successfully presented direct targets are eligible. */
export class FocusManager {
  private readonly targets = new Set<Focusable>();
  private readonly focused = new Map<number, Focusable>();
  private readonly composing = new Set<number>();
  private readonly unfocused = new Set<number>();
  private lastPointerFocused?: Focusable;
  private readonly capturedWindows = new Set<number>();
  private readonly scopes = new Map<
    number,
    Array<{
      accepts: (target: Focusable) => boolean;
      acceptsPointer: (listener: InteractiveListener) => boolean;
    }>
  >();

  constructor(
    private readonly interaction: InteractiveSystem,
    private readonly windowIds: () => readonly number[],
    private readonly captureTab: (windowId: number, enabled: boolean) => void,
    private readonly requestInputFocus: (windowId: number) => void
  ) {}

  register(
    listener: InteractiveListener,
    tabIndex = 0,
    windowId?: number,
    isPresented?: () => boolean,
    containsPointer?: (listener: InteractiveListener) => boolean
  ): Focusable {
    const target = new Focusable(listener, this, tabIndex, windowId, isPresented, containsPointer);
    this.targets.add(target);
    this.refreshCapture();
    return target;
  }

  getFocused(windowId: number): Focusable | undefined {
    return this.focused.get(windowId);
  }
  /** @internal */
  pushScope(
    windowId: number,
    accepts: (target: Focusable) => boolean,
    acceptsPointer: (listener: InteractiveListener) => boolean
  ): () => void {
    let scopes = this.scopes.get(windowId);
    if (!scopes) this.scopes.set(windowId, (scopes = []));
    const scope = { accepts, acceptsPointer };
    scopes.push(scope);
    this.refreshCapture();
    return () => {
      const active = this.scopes.get(windowId);
      if (!active) return;
      const index = active.indexOf(scope);
      if (index >= 0) active.splice(index, 1);
      if (!active.length) this.scopes.delete(windowId);
      this.refreshCapture();
    };
  }
  enforceScope(windowId: number): void {
    const focused = this.focused.get(windowId);
    if (focused && !this.allowed(focused, windowId)) this.blurWindow(windowId);
  }
  allowsPointer(listener: InteractiveListener, windowId: number): boolean {
    return this.scopes.get(windowId)?.at(-1)?.acceptsPointer(listener) ?? true;
  }
  private allowed(target: Focusable, windowId: number): boolean {
    return this.scopes.get(windowId)?.at(-1)?.accepts(target) ?? true;
  }

  requestFocus(
    target: Focusable,
    windowId?: number,
    source: FocusEvent['source'] = 'programmatic'
  ): boolean {
    if (!this.targets.has(target) || !target.eligible || target.isDisposed) return false;
    if (windowId === undefined) {
      let match: number | undefined;
      for (const id of this.windowIds()) {
        if (target.windowId !== undefined && target.windowId !== id) continue;
        if (!this.allowed(target, id)) continue;
        if (this.unfocused.has(id)) continue;
        if (this.interaction.presentationOrder(target.listener, id) === undefined) continue;
        if (match !== undefined) return false;
        match = id;
      }
      if (match === undefined) {
        for (const id of this.windowIds()) {
          if (target.windowId !== undefined && target.windowId !== id) continue;
          if (!this.allowed(target, id)) continue;
          if (this.interaction.presentationOrder(target.listener, id) === undefined) continue;
          if (match !== undefined) return false;
          match = id;
        }
      }
      if (match === undefined) return false;
      windowId = match;
    }
    if (
      (target.windowId !== undefined && target.windowId !== windowId) ||
      !this.allowed(target, windowId) ||
      this.interaction.presentationOrder(target.listener, windowId) === undefined
    )
      return false;
    if (this.unfocused.has(windowId)) {
      this.requestInputFocus(windowId);
      return false;
    }
    const previous = this.focused.get(windowId);
    if (previous === target) {
      if (source === 'pointer') this.lastPointerFocused = target;
      return true;
    }
    this.requestInputFocus(windowId);
    this.focused.delete(windowId);
    previous?.emit('blur', windowId);
    // A blur callback may have changed focus, removed the target, or changed presentation.
    if (
      this.focused.has(windowId) ||
      this.unfocused.has(windowId) ||
      !this.targets.has(target) ||
      !target.eligible ||
      !this.allowed(target, windowId) ||
      this.interaction.presentationOrder(target.listener, windowId) === undefined
    )
      return false;
    this.focused.set(windowId, target);
    if (source === 'pointer') {
      this.lastPointerFocused = target;
    }
    this.refreshCapture();
    target.emit('focus', windowId, source);
    return this.focused.get(windowId) === target;
  }

  advance(windowId: number, reverse = false): boolean {
    const currentFocused = this.focused.get(windowId);
    let activeRealmId = currentFocused?.realmId;
    const candidates: Array<{ target: Focusable; order: number; sequence: number }> = [];
    let sequence = 0;
    for (const target of this.targets) {
      const order =
        target.eligible &&
        this.allowed(target, windowId) &&
        target.tabIndex >= 0 &&
        (target.windowId === undefined || target.windowId === windowId)
          ? this.interaction.presentationOrder(target.listener, windowId)
          : undefined;
      if (order !== undefined) candidates.push({ target, order, sequence });
      sequence++;
    }
    if (!candidates.length) return false;
    candidates.sort((a, b) => {
      const ai = a.target.tabIndex || Infinity,
        bi = b.target.tabIndex || Infinity;
      return ai - bi || a.order - b.order || a.sequence - b.sequence;
    });
    if (activeRealmId === undefined) activeRealmId = candidates[0]!.target.realmId;
    const realmCandidates = candidates.filter(({ target }) => target.realmId === activeRealmId);
    if (!realmCandidates.length) return false;
    const current = realmCandidates.findIndex(({ target }) => target === currentFocused);
    const index =
      current < 0
        ? reverse
          ? realmCandidates.length - 1
          : 0
        : (current + (reverse ? -1 : 1) + realmCandidates.length) % realmCandidates.length;
    return this.requestFocus(realmCandidates[index]!.target, windowId, 'keyboard');
  }

  handleKeyboard(event: KeyboardEvent): void {
    if (event.type === 'imePreedit') {
      if (event.text) this.composing.add(event.windowId);
      else this.composing.delete(event.windowId);
    } else if (event.type === 'imeCommit' || event.type === 'imeDisabled') {
      this.composing.delete(event.windowId);
    } else if (
      event.type === 'input' &&
      event.state === 'pressed' &&
      event.logicalKey === 'Tab' &&
      !event.modifiers.ctrl &&
      !event.modifiers.alt &&
      !event.modifiers.superKey &&
      !this.composing.has(event.windowId)
    ) {
      this.advance(event.windowId, event.modifiers.shift);
    }
  }

  handlePointer(event: PointerEvent): void {
    if (event.type !== 'button' || event.state !== 'pressed' || event.button !== 'primary') return;
    const justFocused = this.lastPointerFocused;
    this.lastPointerFocused = undefined;
    if (justFocused && this.focused.get(event.windowId) === justFocused) {
      return;
    }
    const hovered = this.interaction.hovered(event.windowId, event.pointerId);
    for (const target of this.targets)
      if (target.eligible && this.allowed(target, event.windowId) && target.acceptsPointer(hovered))
        return;
    if (this.scopes.get(event.windowId)?.length) return;
    this.blurWindow(event.windowId);
    this.refreshCapture();
  }

  blurTarget(target: Focusable, windowId?: number): void {
    const windows: number[] = [];
    for (const [id, focused] of this.focused)
      if (focused === target && (windowId === undefined || id === windowId)) windows.push(id);
    for (const id of windows) {
      if (this.focused.get(id) !== target) continue;
      this.focused.delete(id);
      target.emit('blur', id);
    }
    this.refreshCapture();
  }

  remove(target: Focusable): void {
    if (!this.targets.delete(target)) return;
    this.blurTarget(target);
  }

  windowClosed(windowId: number): void {
    this.scopes.delete(windowId);
    this.capturedWindows.delete(windowId);
    this.unfocused.delete(windowId);
    this.blurWindow(windowId);
  }

  windowFocusChanged(windowId: number, focused: boolean): void {
    if (focused) this.unfocused.delete(windowId);
    else {
      this.unfocused.add(windowId);
      this.blurWindow(windowId);
      this.refreshCapture();
    }
  }

  private blurWindow(windowId: number): void {
    this.composing.delete(windowId);
    const target = this.focused.get(windowId);
    if (!target) return;
    this.focused.delete(windowId);
    target.emit('blur', windowId);
  }

  /** Reconciles focus after a successful presentation. */
  afterDispatch(): void {
    if (!this.targets.size && !this.focused.size && !this.capturedWindows.size && !this.scopes.size)
      return;
    for (const target of this.targets) if (target.listener.isDisposed) target.dispose();
    for (const [windowId, target] of this.focused)
      if (
        !target.eligible ||
        !this.allowed(target, windowId) ||
        this.interaction.presentationOrder(target.listener, windowId) === undefined
      )
        this.blurWindow(windowId);
    this.refreshCapture();
  }

  /** Synchronizes platform Tab capture only when eligibility changes. */
  refreshCapture(): void {
    if (!this.targets.size && !this.focused.size && !this.capturedWindows.size && !this.scopes.size)
      return;
    const windows = this.windowIds();
    for (const windowId of this.capturedWindows) {
      if (windows.includes(windowId)) continue;
      this.captureTab(windowId, false);
      this.capturedWindows.delete(windowId);
    }
    for (const windowId of windows) {
      let needed = this.focused.has(windowId) || !!this.scopes.get(windowId)?.length;
      for (const target of this.targets) {
        if (needed) break;
        if (
          target.eligible &&
          this.allowed(target, windowId) &&
          target.tabIndex >= 0 &&
          (target.windowId === undefined || target.windowId === windowId) &&
          this.interaction.presentationOrder(target.listener, windowId) !== undefined
        ) {
          needed = true;
          break;
        }
      }
      if (needed === this.capturedWindows.has(windowId)) continue;
      this.captureTab(windowId, needed);
      if (needed) this.capturedWindows.add(windowId);
      else this.capturedWindows.delete(windowId);
    }
  }

  dispose(): void {
    for (const target of this.targets) target.dispose();
    this.focused.clear();
    this.composing.clear();
    this.unfocused.clear();
    this.capturedWindows.clear();
    this.scopes.clear();
  }
}
