import type { InteractiveEvent, MultiverseRuntime, WindowId } from '@galfus/engine';
import type { KeyboardEvent } from '@galfus/transport-types';
import { UiControl, type UiControlOptions } from '../components/controls';
import type { UiPanelComponent } from '../components/component';
import type { Focusable } from '../focus';
import type { UiSystem } from '../system';
import { type TextComposition, TextEditor, type TextSelection } from './editor';
import { applyTextKeyboardEvent } from './keyboard';
import { TextFieldVisual } from './field-visual';
import { uiTextRectToWindow, uiWindowPointToLocal } from './coordinates';

export type UiValidationMode = 'manual' | 'change' | 'blur';
export interface UiTextFieldOptions extends UiControlOptions {
  readonly value?: string;
  readonly width?: number;
  readonly height?: number;
  readonly tabIndex?: number;
  readonly readOnly?: boolean;
  readonly invalid?: boolean;
  readonly validate?: (value: string) => boolean;
  readonly validationMode?: UiValidationMode;
  readonly onChange?: (value: string) => void;
  readonly onSelection?: (selection: TextSelection) => void;
  readonly onComposition?: (composition?: TextComposition) => void;
  /** Maps UI-local caret geometry to physical window pixels for indirect presentations. */
  readonly mapToWindow?: (
    windowId: number,
    rect: readonly [number, number, number, number]
  ) => [number, number, number, number] | undefined;
}
export type UiTextFieldEvent = 'change' | 'selection' | 'composition' | 'focus' | 'blur';
export type UiTextFieldCallback = (field: UiTextField, windowId?: number) => void;

/** Shared editor for the single-line and multiline controls. */
export abstract class UiTextField extends UiControl {
  private readonly editor: TextEditor;
  readonly textNode: import('../components/component').UiTextComponent;
  private readonly visual: TextFieldVisual;
  private readonly runtime: MultiverseRuntime;
  private readonly focusable: Focusable;
  private readonly detach: () => void;
  private readonly stop: (() => void)[] = [];
  private readonly callbacks = new Map<UiTextFieldEvent, Set<UiTextFieldCallback>>();
  private readonly windows = new Set<number>();
  private readOnly_ = false;
  private disposed = false;
  private pendingEnter = false;
  private geometryError_: unknown;
  private lastCandidate?: string;
  protected constructor(
    private readonly ui: UiSystem,
    parent: UiPanelComponent,
    protected readonly options: UiTextFieldOptions,
    readonly multiline: boolean
  ) {
    const width = options.width ?? 240,
      height = options.height ?? (multiline ? 120 : 40);
    if (![width, height].every((n) => Number.isFinite(n) && n > 16))
      throw new RangeError('Text field dimensions must exceed 16 units.');
    if (options.tabIndex !== undefined && !Number.isSafeInteger(options.tabIndex))
      throw new RangeError('tabIndex must be a safe integer.');
    const panel = parent.addPanel(
      { clip: true },
      {
        ...options.layout,
        width: { type: 'exact', value: width },
        height: { type: 'exact', value: height },
        isStack: true
      }
    );
    super(panel);
    this.runtime = ui.getRuntime();
    this.editor = new TextEditor(this.normalize(options.value ?? ''));
    try {
      panel.setComponentStyle(multiline ? 'textArea' : 'inputText');
      if (options.tokens) panel.setTokens(options.tokens);
      if (options.variant !== undefined) panel.setVariant(options.variant);
      if (options.style) panel.setStyle(options.style);
      if (options.states)
        for (const [state, style] of Object.entries(options.states))
          panel.setStateStyle(state as import('../style/theme').UiStyleState, style);
      this.visual = new TextFieldVisual(panel, this.editor, multiline, width, (event, drag) =>
        this.pointer(event, drag)
      );
      this.textNode = this.visual.text;
      const binding = ui.bindPanelEditor(panel, this, options.tabIndex);
      this.focusable = binding.focusable;
      this.detach = binding.detach;
      this.stop.push(this.focusable.on('focus', ({ windowId }) => this.focus(windowId)));
      this.stop.push(this.focusable.on('blur', ({ windowId }) => this.lostFocus(windowId)));
      this.stop.push(
        panel.componentRoot.onSyncState((state) => {
          if (state === 'disposed') this.cleanup();
          else if (
            state === 'synced' &&
            panel.isAttached &&
            this.textNode.text !== this.editor.displayValue
          ) {
            this.visual.setText(this.editor.displayValue);
            panel.componentRoot.flush();
          }
        })
      );
      this.stop.push(
        this.runtime.interaction.observe({
          onAfterDispatch: () => this.afterDispatch(),
          onDispose: () => this.cleanup()
        })
      );
      this.setReadOnly(options.readOnly ?? false);
      this.setInvalid(options.invalid ?? false);
      if (options.disabled) this.setDisabled(true);
    } catch (error) {
      if (panel.isAttached) panel.remove();
      throw error;
    }
  }
  get value(): string {
    return this.editor.value;
  }
  get displayValue(): string {
    return this.editor.displayValue;
  }
  get selection(): TextSelection {
    return this.editor.selection;
  }
  get composition(): TextComposition | undefined {
    return this.editor.composition;
  }
  get readOnly(): boolean {
    return this.readOnly_;
  }
  get lastGeometryError(): unknown {
    return this.geometryError_;
  }
  setValue(value: string): this {
    this.mutate(() => this.editor.setValue(this.normalize(value)));
    return this;
  }
  setSelection(anchor: number, focus = anchor): this {
    this.visual.resetPreferredX();
    this.mutate(() => this.editor.setSelection(anchor, focus));
    return this;
  }
  selectAll(): this {
    this.mutate(() => this.editor.selectAll());
    return this;
  }
  setReadOnly(value: boolean): this {
    this.readOnly_ = value;
    this.lastCandidate = undefined;
    this.panel.setReadOnly(value);
    if (value && this.editor.composition) this.mutate(() => this.editor.cancelComposition());
    for (const windowId of this.windows)
      this.runtime.platform.window.setImeAllowed(windowId as WindowId, !value);
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
  validate(): boolean {
    const valid = this.options.validate?.(this.value) ?? true;
    this.setInvalid(!valid);
    return valid;
  }
  setSize(width: number, height: number): this {
    if (![width, height].every((n) => Number.isFinite(n) && n > 16))
      throw new RangeError('Text field dimensions must exceed 16 units.');
    this.panel.setLayout({
      ...this.panel.layout,
      width: { type: 'exact', value: width },
      height: { type: 'exact', value: height }
    });
    if (this.multiline)
      this.textNode.setLayout({
        ...this.textNode.layout,
        width: { type: 'exact', value: width - 16 }
      });
    return this;
  }
  on(type: UiTextFieldEvent, callback: UiTextFieldCallback): () => void {
    if (this.disposed) throw new Error('Text field is disposed.');
    let callbacks = this.callbacks.get(type);
    if (!callbacks) this.callbacks.set(type, (callbacks = new Set()));
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }
  /** @internal */
  handleKeyboard(event: KeyboardEvent): void {
    if (this.disposed || !this.panel.isAttached || !this.windows.has(event.windowId)) return;
    const state = this.panel.getInteractionState(event.windowId);
    if (state.disabled) return;
    if (event.type === 'textInput') {
      if (this.readOnly_) return;
      const text = this.normalize(event.text);
      if (this.pendingEnter && text === '\n') {
        this.pendingEnter = false;
        return;
      }
      this.pendingEnter = false;
      this.visual.resetPreferredX();
      if (text) this.mutate(() => this.editor.insert(text), event.windowId);
      return;
    }
    if (event.type === 'imePreedit' || event.type === 'imeCommit' || event.type === 'imeDisabled') {
      if (!this.readOnly_)
        this.mutate(() => applyTextKeyboardEvent(this.editor, event), event.windowId);
      return;
    }
    if (event.type !== 'input' || event.state !== 'pressed') return;
    if (this.editor.composition) return;
    if (event.logicalKey !== 'Enter') this.pendingEnter = false;
    if (
      this.multiline &&
      event.logicalKey === 'Enter' &&
      !event.modifiers.ctrl &&
      !event.modifiers.alt &&
      !event.modifiers.superKey
    ) {
      if (!this.readOnly_) {
        this.mutate(() => this.editor.insert('\n'), event.windowId);
        this.pendingEnter = true;
      }
      return;
    }
    if (this.readOnly_ && ['Backspace', 'Delete'].includes(event.logicalKey)) return;
    if (this.multiline && (event.logicalKey === 'ArrowUp' || event.logicalKey === 'ArrowDown')) {
      this.mutate(
        () =>
          this.visual.moveVertical(event.logicalKey === 'ArrowUp' ? -1 : 1, event.modifiers.shift),
        event.windowId
      );
      return;
    }
    if (this.multiline && (event.logicalKey === 'Home' || event.logicalKey === 'End')) {
      const end = event.logicalKey === 'End';
      if (event.modifiers.ctrl || event.modifiers.superKey)
        this.mutate(
          () => this.editor.moveToBoundary(end ? 'end' : 'start', event.modifiers.shift),
          event.windowId
        );
      else
        this.mutate(() => this.visual.moveLineBoundary(end, event.modifiers.shift), event.windowId);
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.logicalKey))
      this.visual.resetPreferredX();
    this.mutate(() => applyTextKeyboardEvent(this.editor, event), event.windowId);
  }
  override dispose(): void {
    this.remove();
  }
  private normalize(value: string): string {
    const lines = value.replace(/\r\n?/g, '\n');
    return this.multiline ? lines : lines.replace(/\n/g, '');
  }
  private focus(windowId: number): void {
    if (this.disposed || !this.panel.isAttached) return;
    for (const other of [...this.windows]) if (other !== windowId) this.focusable.blur(other);
    this.windows.add(windowId);
    this.lastCandidate = undefined;
    this.runtime.platform.window.setImeAllowed(windowId as WindowId, !this.readOnly_);
    this.emit('focus', windowId);
  }
  private lostFocus(windowId: number): void {
    if (this.disposed) return;
    this.windows.delete(windowId);
    this.runtime.platform.window.setImeAllowed(windowId as WindowId, false);
    if (this.editor.composition) {
      if (this.panel.isAttached) this.mutate(() => this.editor.cancelComposition(), windowId);
      else this.editor.cancelComposition();
    }
    if (this.options.validationMode === 'blur' && this.panel.isAttached) this.validate();
    this.emit('blur', windowId);
  }
  private pointer(event: InteractiveEvent, drag: boolean): void {
    if (this.disposed || !this.panel.isAttached) return;
    if (!drag && (event.pointer.type !== 'button' || event.pointer.button !== 'primary')) return;
    if (!drag) this.requestFocus(event.pointer.windowId);
    const root = this.panel.componentRoot;
    const bounds = root.realm.getUiLayout(root.handle, root.root.id).absoluteRect;
    const point =
      event.windowPosition &&
      uiWindowPointToLocal(this.runtime, root, event.pointer.windowId, event.windowPosition);
    const local =
      point ?? (event.uv ? [event.uv[0] * bounds[2], (1 - event.uv[1]) * bounds[3]] : undefined);
    if (!local) return;
    const hit = this.visual.hit(local[0]!, local[1]!);
    if (!hit) return;
    let offset = hit.offset;
    const composition = this.editor.composition;
    if (composition) {
      const start = Math.min(this.selection.anchor, this.selection.focus);
      const end = Math.max(this.selection.anchor, this.selection.focus);
      offset =
        offset <= start
          ? offset
          : offset < start + composition.text.length
            ? start
            : offset - composition.text.length + end - start;
    }
    this.mutate(
      () => this.editor.setSelection(drag ? this.selection.anchor : offset, offset),
      event.pointer.windowId
    );
  }
  private mutate(action: () => void, windowId?: number): void {
    if (this.disposed) throw new Error('Text field is disposed.');
    const root = this.panel.componentRoot;
    const synced = root.syncState === 'synced';
    const beforeValue = this.editor.value,
      beforeDisplay = this.editor.displayValue;
    const before = this.editor.selection,
      beforeComposition = this.editor.composition;
    action();
    if (this.editor.displayValue !== beforeDisplay) this.visual.setText(this.editor.displayValue);
    if (beforeValue !== this.value && this.options.validationMode === 'change') this.validate();
    if (synced && (root.syncState as string) === 'pending') root.flush();
    if (beforeValue !== this.value) {
      this.options.onChange?.(this.value);
      this.emit('change', windowId);
    }
    const selection = this.selection;
    if (before.anchor !== selection.anchor || before.focus !== selection.focus) {
      this.options.onSelection?.(selection);
      this.emit('selection', windowId);
    }
    if (beforeComposition !== this.composition) {
      this.options.onComposition?.(this.composition);
      this.emit('composition', windowId);
    }
  }
  private afterDispatch(): void {
    if (this.disposed) return;
    this.pendingEnter = false;
    const root = this.panel.componentRoot;
    if (!this.panel.isAttached) {
      if (root.syncState === 'disposed' || !root.wasPresented(this.panel.id)) this.cleanup();
      return;
    }
    if (root.syncState !== 'synced' || !root.wasPresented(this.textNode.id)) return;
    try {
      const caret = this.visual.update(this.windows.size > 0);
      if ((root.syncState as string) === 'pending') root.flush();
      this.geometryError_ = undefined;
      if (!caret) return;
      for (const windowId of this.windows) {
        if (this.readOnly_) continue;
        const rect = this.options.mapToWindow
          ? this.options.mapToWindow(windowId, caret.rect)
          : uiTextRectToWindow(this.runtime, root, windowId, caret.rect);
        if (!rect)
          throw new Error('Cannot map text caret to this presentation; provide mapToWindow.');
        if (rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] < 0 || rect[3] <= 0)
          throw new RangeError('Invalid mapped IME candidate rectangle.');
        const key = JSON.stringify([windowId, rect]);
        if (rect && key !== this.lastCandidate) {
          this.runtime.platform.window.setImeCursorArea(windowId as WindowId, ...rect);
          this.lastCandidate = key;
        }
      }
    } catch (error) {
      this.geometryError_ = error;
    }
  }
  private emit(type: UiTextFieldEvent, windowId?: number): void {
    for (const callback of [...(this.callbacks.get(type) ?? [])]) callback(this, windowId);
  }
  private cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.windows)
      this.runtime.platform.window.setImeAllowed(id as WindowId, false);
    this.windows.clear();
    this.detach();
    this.visual.dispose();
    for (const stop of this.stop) stop();
    this.callbacks.clear();
  }
}
export class UiInputText extends UiTextField {
  constructor(ui: UiSystem, parent: UiPanelComponent, options: UiTextFieldOptions = {}) {
    super(ui, parent, options, false);
  }
}
export class UiTextArea extends UiTextField {
  constructor(ui: UiSystem, parent: UiPanelComponent, options: UiTextFieldOptions = {}) {
    super(ui, parent, options, true);
  }
}
