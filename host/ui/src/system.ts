import {
  type InteractiveTarget,
  type MultiverseRuntime,
  Realm2D,
  type WindowId
} from '@galfus/engine';
import { type Focusable, FocusManager } from './focus';
import { UiRoot, type UiRootOptions } from './panel/root';
import { NativeUiModel, type NativeUiOptions } from './native';
import { TextInput, type TextInputOptions } from './text/input';

/** Coordinates UI focus, Tab navigation, interactive inputs, and panel hierarchies on top of a `MultiverseRuntime`. */
export class UiSystem {
  private readonly _textInputs = new Map<Focusable, TextInput>();
  private readonly _roots = new Set<UiRoot>();
  private readonly _nativeRoots = new Set<NativeUiModel>();
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

  /** Binds editable text to a focus target (native UI or collider). */
  textInput(
    realmId: number,
    options: TextInputOptions & { target?: InteractiveTarget; entityId?: number }
  ): TextInput {
    if (this._disposed) throw new Error('UiSystem is disposed.');
    const realm = this.runtime.multiverse.getRealm(realmId);
    if (!(realm instanceof Realm2D) || realm.isDisposed)
      throw new Error(`Text input realm ${realmId} is not a registered Realm2D.`);
    const target =
      options.target ??
      (options.entityId !== undefined
        ? { type: 'collider' as const, entityId: options.entityId }
        : undefined);
    if (!target) throw new Error('Text input requires an interactive target or entityId.');
    const focusable = this.focusable(realmId, target, { tabIndex: options.tabIndex });
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

  /** Creates a `UiRoot` that compiles and manages a native `Model2DUI` panel hierarchy in `realm`. */
  createRoot(realm: Realm2D, options: UiRootOptions = {}): UiRoot {
    if (this._disposed) throw new Error('UiSystem is disposed.');
    const root = new UiRoot(this.runtime, realm, options);
    this._roots.add(root);
    return root;
  }

  /** Creates a command-only facade for a UI tree owned by the core. */
  createNativeRoot(realm: Realm2D, options: NativeUiOptions): NativeUiModel {
    if (this._disposed) throw new Error('UiSystem is disposed.');
    const root = new NativeUiModel(this.runtime, realm, options);
    this._nativeRoots.add(root);
    return root;
  }

  /** Clears all registered focusables, text inputs, and UI roots while remaining attached to the runtime. */
  reset(): void {
    for (const root of this._nativeRoots) root.dispose();
    this._nativeRoots.clear();
    for (const root of [...this._roots]) root.dispose();
    this._roots.clear();
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
