import type { Realm2D } from '@galfus/engine';
import type { KeyboardEvent } from '@galfus/transport-types';
import type { Focusable } from '../focus';
import { TextEditor, type TextSelection } from './editor';
import { applyTextKeyboardEvent } from './keyboard';

export interface TextInputOptions {
  readonly svgId: number;
  readonly elementId: string;
  /** SVG element used for hit testing; defaults to elementId. */
  readonly hitAreaId?: string;
  readonly value?: string;
  readonly tabIndex?: number;
}

export type TextInputEventType = 'focus' | 'blur' | 'change' | 'selection' | 'composition';
export interface TextInputEvent {
  readonly type: TextInputEventType;
  readonly windowId?: number;
  readonly value: string;
  readonly selection: TextSelection;
}
export type TextInputCallback = (event: TextInputEvent) => void;

/** Editable Unicode state bound to one SVG text element and one focus target. */
export class TextInput {
  private readonly editor: TextEditor;
  private readonly callbacks = new Map<TextInputEventType, Set<TextInputCallback>>();
  private disposed = false;
  private disposing = false;

  constructor(
    private readonly realm: Realm2D,
    private readonly options: TextInputOptions,
    readonly focusable: Focusable,
    private readonly setIme: (windowId: number, enabled: boolean) => void,
    private readonly remove: (input: TextInput) => void
  ) {
    this.editor = new TextEditor(options.value ?? '');
    this.render();
    focusable.on('focus', ({ windowId }) => {
      this.setIme(windowId, true);
      this.emit('focus', windowId);
    });
    focusable.on('blur', ({ windowId }) => {
      if (this.editor.composition) {
        this.editor.cancelComposition();
        if (!this.realm.isDisposed && !this.focusable.listener.isDisposed) this.render();
      }
      this.setIme(windowId, false);
      this.emit('blur', windowId);
    });
  }

  get value(): string {
    return this.editor.value;
  }
  get svgId(): number {
    return this.options.svgId;
  }
  get elementId(): string {
    return this.options.elementId;
  }
  get displayValue(): string {
    return this.editor.displayValue;
  }
  get selection(): TextSelection {
    return this.editor.selection;
  }
  get selectedText(): string {
    return this.editor.selectedText;
  }
  get composition() {
    return this.editor.composition;
  }
  get isDisposed(): boolean {
    return this.disposed;
  }

  requestFocus(windowId?: number): boolean {
    this.assertLive();
    return this.focusable.requestFocus(windowId);
  }
  blur(windowId?: number): void {
    this.assertLive();
    this.focusable.blur(windowId);
  }
  setValue(value: string): void {
    this.mutate(() => this.editor.setValue(value));
  }
  setSelection(anchor: number, focus = anchor): void {
    this.mutate(() => this.editor.setSelection(anchor, focus));
  }
  selectAll(): void {
    this.mutate(() => this.editor.selectAll());
  }

  on(type: TextInputEventType, callback: TextInputCallback): () => void {
    this.assertLive();
    let callbacks = this.callbacks.get(type);
    if (!callbacks) this.callbacks.set(type, (callbacks = new Set()));
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }
  off(type: TextInputEventType, callback: TextInputCallback): void {
    this.callbacks.get(type)?.delete(callback);
  }

  /** @internal */
  handleKeyboard(event: KeyboardEvent): void {
    if (!this.disposed)
      this.mutate(() => applyTextKeyboardEvent(this.editor, event), event.windowId);
  }

  dispose(): void {
    if (this.disposed || this.disposing) return;
    this.disposing = true;
    this.focusable.dispose();
    this.disposed = true;
    this.callbacks.clear();
    this.remove(this);
  }

  private mutate(action: () => void, windowId?: number): void {
    this.assertLive();
    const value = this.editor.value;
    const display = this.editor.displayValue;
    const { anchor, focus } = this.editor.selection;
    const composition = this.editor.composition;
    action();
    if (display !== this.editor.displayValue) this.render();
    if (value !== this.editor.value) this.emit('change', windowId);
    if (this.disposed) return;
    const selection = this.editor.selection;
    if (anchor !== selection.anchor || focus !== selection.focus) this.emit('selection', windowId);
    if (!this.disposed && composition !== this.editor.composition)
      this.emit('composition', windowId);
  }

  private render(): void {
    this.realm.setSvgText(
      { svgId: this.options.svgId },
      this.options.elementId,
      this.editor.displayValue
    );
  }

  private emit(type: TextInputEventType, windowId?: number): void {
    const callbacks = this.callbacks.get(type);
    if (!callbacks) return;
    const event = { type, windowId, value: this.value, selection: this.selection };
    for (const callback of callbacks) {
      callback(event);
      if (this.disposed) break;
    }
  }
  private assertLive(): void {
    if (this.disposed) throw new Error('Text input is disposed.');
  }
}
