import {
  type InteractiveTarget,
  type MultiverseRuntime,
  Realm2D,
  type WindowId
} from '@galfus/engine';
import { type Focusable, FocusManager } from './focus';
import { TextInput, type TextInputOptions } from './text/input';

/** Coordinates UI focus, Tab navigation, and SVG text inputs on top of a `MultiverseRuntime`. */
export class UiSystem {
  private readonly _textInputs = new Map<Focusable, TextInput>();
  private readonly _focus: FocusManager;
  private readonly _unobserve: () => void;
  private _disposed = false;

  constructor(private readonly runtime: MultiverseRuntime) {
    this._focus = new FocusManager(
      runtime.interaction,
      () => runtime.multiverse.presentationGraph.getWindowIds(),
      (windowId, enabled) => runtime.platform.window.setTabCapture(windowId as WindowId, enabled),
      (windowId) => runtime.platform.window.requestInputFocus(windowId as WindowId)
    );
    this._unobserve = runtime.interaction.observe({
      onWindowEvent: (event) => {
        if (event.type === 'focusChanged') {
          this._focus.windowFocusChanged(event.windowId, event.focused);
        }
      },
      onPointerEvent: (event) => {
        this._focus.handlePointer(event);
      },
      onKeyboardEvent: (event) => {
        this._focus.handleKeyboard(event);
        const focused = this._focus.getFocused(event.windowId);
        if (focused) this._textInputs.get(focused)?.handleKeyboard(event);
      },
      onWindowClosed: (windowId) => {
        this._focus.windowClosed(windowId);
      },
      onAfterDispatch: () => {
        this._focus.afterDispatch();
        for (const [focusable, input] of this._textInputs) {
          if (focusable.isDisposed) input.dispose();
        }
      },
      onDispose: () => {
        this.reset();
      }
    });
  }

  /** Registers a pointer target for per-window focus and keyboard navigation. */
  focusable(
    realmId: number,
    target: InteractiveTarget,
    options: { tabIndex?: number } = {}
  ): Focusable {
    if (this._disposed) throw new Error('UiSystem is disposed.');
    if (options.tabIndex !== undefined && !Number.isSafeInteger(options.tabIndex))
      throw new RangeError('tabIndex must be a safe integer.');
    return this._focus.register(this.runtime.interactive(realmId, target), options.tabIndex);
  }

  /** Returns the target focused in a window, if any. */
  getFocused(windowId: number): Focusable | undefined {
    return this._focus.getFocused(windowId);
  }

  /** Binds editable text to an SVG element and its interactive hit area. */
  textInput(realmId: number, options: TextInputOptions): TextInput {
    if (this._disposed) throw new Error('UiSystem is disposed.');
    if (!options.elementId || options.hitAreaId === '')
      throw new Error('SVG element IDs must not be empty.');
    const realm = this.runtime.multiverse.getRealm(realmId);
    if (!(realm instanceof Realm2D) || realm.isDisposed)
      throw new Error(`Text input realm ${realmId} is not a registered Realm2D.`);
    for (const input of this._textInputs.values()) {
      const target = input.focusable.listener.target;
      if (
        input.focusable.realmId === realmId &&
        input.svgId === options.svgId &&
        input.elementId === options.elementId
      )
        throw new Error('An input is already registered for this SVG text element.');
      if (
        input.focusable.realmId === realmId &&
        target.type === 'svg' &&
        target.svgId === options.svgId &&
        target.elementId === (options.hitAreaId ?? options.elementId)
      )
        throw new Error('An input is already registered for this SVG hit area.');
    }
    const focusable = this.focusable(
      realmId,
      {
        type: 'svg',
        svgId: options.svgId,
        elementId: options.hitAreaId ?? options.elementId
      },
      { tabIndex: options.tabIndex }
    );
    try {
      const input = new TextInput(
        realm,
        { ...options },
        focusable,
        (id, enabled) => this.runtime.platform.window.setImeAllowed(id as WindowId, enabled),
        () => this._textInputs.delete(focusable)
      );
      this._textInputs.set(focusable, input);
      return input;
    } catch (error) {
      focusable.dispose();
      throw error;
    }
  }

  /** Clears all registered focusables and text inputs while remaining attached to the runtime. */
  reset(): void {
    for (const input of [...this._textInputs.values()]) input.dispose();
    this._focus.dispose();
  }

  /** Disposes all UI targets and detaches from the runtime. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._unobserve();
    this.reset();
  }
}

/** Creates and attaches a `UiSystem` to a `MultiverseRuntime`. */
export function createUi(runtime: MultiverseRuntime): UiSystem {
  return new UiSystem(runtime);
}
