import {
  type InteractiveListener,
  type InteractiveTarget,
  type MultiverseRuntime,
  Realm2D,
  type WindowId
} from '@galfus/engine';
import { type Focusable, FocusManager } from './focus';
import { UiRoot, type UiRootOptions } from './panel/root';
import { NativeUiModel, type NativeUiOptions } from './native';
import { TextInput, type TextInputOptions } from './text/input';
import { ComponentRoot, type ComponentRootOptions } from './components/root';
import { UiOverlayManager } from './overlay/manager';
import type { KeyboardEvent } from '@galfus/transport-types';
import type { UiPanelComponent } from './components/component';

// Focus and keyboard capture are window-global. Competing coordinators would
// deliver one event to multiple focus targets and cannot contain modal input.
const runtimeOwners = new WeakMap<MultiverseRuntime, UiSystem>();

/** Coordinates UI focus, Tab navigation, interactive inputs, and panel hierarchies on top of a `MultiverseRuntime`. */
export class UiSystem {
  private readonly _textInputs = new Map<
    Focusable,
    { handleKeyboard(event: KeyboardEvent): void; dispose(): void }
  >();
  private readonly _roots = new Set<UiRoot>();
  private readonly _nativeRoots = new Set<NativeUiModel>();
  private readonly _componentRoots = new Set<ComponentRoot>();
  private readonly _overlayManagers = new Set<UiOverlayManager>();
  private readonly _focus: FocusManager;
  private readonly _unobserve: () => void;
  private readonly _unfilter: () => void;
  private _disposed = false;

  constructor(private readonly runtime: MultiverseRuntime) {
    if (runtime.isDisposed) throw new Error('Cannot create UiSystem for a disposed runtime.');
    if (runtimeOwners.has(runtime))
      throw new Error('Only one UiSystem may own a runtime. Dispose it before creating another.');
    this._focus = new FocusManager(
      runtime.interaction,
      () => runtime.multiverse.presentationGraph.getWindowIds(),
      (windowId, enabled) => runtime.platform.window.setTabCapture(windowId as WindowId, enabled),
      (windowId) => runtime.platform.window.requestInputFocus(windowId as WindowId)
    );
    this._unfilter = runtime.interaction.addDispatchFilter((listener, event) =>
      this._focus.allowsPointer(listener, event.windowId)
    );
    this._unobserve = runtime.interaction.observe({
      onWindowEvent: (event) => {
        if (event.type === 'focusChanged') {
          this._focus.windowFocusChanged(event.windowId, event.focused);
          if (!event.focused)
            for (const root of this._componentRoots) root.windowClosed(event.windowId);
        }
      },
      onPointerEvent: (event) => {
        this._focus.handlePointer(event);
      },
      onKeyboardEvent: (event) => {
        this._focus.handleKeyboard(event);
        for (const root of this._componentRoots) root.handleKeyboard(event);
        const focused = this._focus.getFocused(event.windowId);
        if (focused) this._textInputs.get(focused)?.handleKeyboard(event);
      },
      onWindowClosed: (windowId) => {
        this._focus.windowClosed(windowId);
        for (const root of this._componentRoots) root.windowClosed(windowId);
      },
      onAfterDispatch: () => {
        this._focus.afterDispatch();
        for (const [focusable, input] of this._textInputs) {
          if (focusable.isDisposed) input.dispose();
        }
      },
      onDispose: () => {
        if (runtime.state === 'disposing') this.dispose();
        else this.reset();
      }
    });
    runtimeOwners.set(runtime, this);
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
  /** @internal */
  pushFocusScope(
    windowId: number,
    accepts: (target: Focusable) => boolean,
    acceptsPointer: (listener: InteractiveListener) => boolean
  ): () => void {
    return this._focus.pushScope(windowId, accepts, acceptsPointer);
  }
  /** @internal */
  enforceFocusScope(windowId: number): void {
    this._focus.enforceScope(windowId);
  }
  /** @internal */
  getRuntime(): MultiverseRuntime {
    return this.runtime;
  }
  /** @internal */
  ownsComponentRoot(root: ComponentRoot): boolean {
    return !this._disposed && this._componentRoots.has(root);
  }
  /** @internal Shares the panel's listener and focus target with a component editor. */
  bindPanelEditor(
    panel: UiPanelComponent,
    editor: { handleKeyboard(event: KeyboardEvent): void; dispose(): void },
    tabIndex = 0
  ): { focusable: Focusable; detach: () => void } {
    if (this._disposed || !this._componentRoots.has(panel.componentRoot))
      throw new Error('Text field panel must belong to this UiSystem.');
    panel.setFocusable(tabIndex);
    const focusable = panel.componentRoot.interactionFor(panel.id).getFocusable()!;
    if (this._textInputs.has(focusable)) throw new Error('Panel already has a text editor.');
    this._textInputs.set(focusable, editor);
    return {
      focusable,
      detach: () => {
        if (this._textInputs.get(focusable) === editor) this._textInputs.delete(focusable);
      }
    };
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

  /** Creates a staged component tree backed by a core-owned Model2DUI. */
  createComponentRoot(realm: Realm2D, options: ComponentRootOptions): ComponentRoot {
    if (this._disposed) throw new Error('UiSystem is disposed.');
    if (this.runtime.multiverse.getRealm(realm.realmId) !== realm || realm.isDisposed)
      throw new Error('UI root requires a registered, live Realm2D.');
    const root = new ComponentRoot(this.runtime, realm, options);
    root.attachFocus(this._focus);
    this._componentRoots.add(root);
    root.onSyncState((state) => {
      if (state === 'disposed') this._componentRoots.delete(root);
    });
    return root;
  }

  /** Creates overlays in one explicitly selected, directly presented window. */
  createOverlayManager(root: ComponentRoot, windowId: number): UiOverlayManager {
    if (this._disposed || !this._componentRoots.has(root))
      throw new Error('Overlay owner must be a live root belonging to this UiSystem.');
    if ([...this._overlayManagers].some((manager) => manager.owner.realm === root.realm))
      throw new Error('Only one overlay manager may own a realm.');
    const manager = new UiOverlayManager(this, this.runtime, root, windowId, () =>
      this._overlayManagers.delete(manager)
    );
    this._overlayManagers.add(manager);
    return manager;
  }

  /** Clears all registered focusables, text inputs, and UI roots while remaining attached to the runtime. */
  reset(): void {
    let failure: unknown;
    let failed = false;
    const run = (action: () => void) => {
      try {
        action();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    };
    for (const manager of [...this._overlayManagers]) run(() => manager.dispose());
    this._overlayManagers.clear();
    for (const root of [...this._componentRoots]) run(() => root.dispose());
    this._componentRoots.clear();
    for (const root of this._nativeRoots) run(() => root.dispose());
    this._nativeRoots.clear();
    for (const root of [...this._roots]) run(() => root.dispose());
    this._roots.clear();
    for (const input of [...this._textInputs.values()]) run(() => input.dispose());
    run(() => this._focus.dispose());
    if (failed) throw failure;
  }

  /** Disposes all UI targets and detaches from the runtime. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._unobserve();
    this._unfilter();
    try {
      this.reset();
    } finally {
      runtimeOwners.delete(this.runtime);
    }
  }
}

/** Creates and attaches a `UiSystem` to a `MultiverseRuntime`. */
export function createUi(runtime: MultiverseRuntime): UiSystem {
  return new UiSystem(runtime);
}
