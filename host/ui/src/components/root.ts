import type {
  InteractiveCallback,
  InteractiveEventType,
  InteractiveListener,
  Model2DUIComponent,
  MultiverseRuntime,
  Realm2D
} from '@galfus/engine';
import {
  assertValidLogicalId,
  type KeyboardEvent,
  type UiCommandDesc,
  type UiLayoutStyleDesc,
  type UiNodeKindDesc
} from '@galfus/transport-types';
import {
  createUiTheme,
  mergeUiTheme,
  UI_STYLE_STATE_ORDER,
  type UiStyle,
  type UiStyleConfig,
  type UiStyleState,
  type UiTheme,
  type UiThemeOverrides
} from '../style/theme';
import { reconcileStyles } from '../style/reconcile';
import { sameUiValue } from '../style/resolve';
import type { FocusManager } from '../focus';
import { ComponentInteractions, type PanelInteraction } from './interaction';
import type { UiIconAtlas } from '../icons/atlas';
import { stageSpriteUv } from './sprite-uv';

export * from './types';
export * from './component';
import {
  type ComponentRootOptions,
  type ComponentSyncState,
  type NodeRecord,
  syncRootCollider,
  validateComponentRootOptions
} from './types';
import {
  UiComponent,
  UiPanelComponent,
  UiSpritePanelComponent,
  UiTextComponent
} from './component';

/** Component tree whose staged changes are committed atomically to one Model2DUI. */
export class ComponentRoot {
  readonly root: UiPanelComponent;
  readonly handle: ReturnType<Realm2D['createUi']>;
  private nodes = new Map<number, NodeRecord>();
  private committed: Map<number, NodeRecord> | undefined;
  private presented: Map<number, NodeRecord> | undefined;
  private theme: UiTheme;
  private committedTheme: UiTheme | undefined;
  private commands: UiCommandDesc[] = [];
  private nextId = 2;
  private state: ComponentSyncState = 'pending';
  private error: unknown;
  private readonly listeners = new Map<number, InteractiveListener>();
  private readonly components = new Map<number, UiComponent>();
  private readonly stateListeners = new Set<(state: ComponentSyncState, error?: unknown) => void>();
  private readonly stopObserving: () => void;
  private readonly stopRealmObserver: () => void;
  private readonly stopEntityObserver: () => void;
  private readonly windowId: number | undefined;
  private readonly colliderId: number;
  private colliderSize: [number, number];
  private colliderActive = true;
  private interactions?: ComponentInteractions;
  private iconsProvider?: (name: string) => UiIconAtlas;

  attachIcons(provider: (name: string) => UiIconAtlas): void {
    this.iconsProvider = provider;
  }
  private tickProvider?: (cb: (dt: number) => void) => () => void;
  attachTick(provider: (cb: (dt: number) => void) => () => void): void {
    this.tickProvider = provider;
  }
  onTick(callback: (dt: number) => void): () => void {
    if (this.tickProvider) return this.tickProvider(callback);
    return this.runtime.on('tick', ({ dt }) => callback(dt));
  }
  getIcons(name: string): UiIconAtlas {
    if (!this.iconsProvider) throw new Error('Icons require a root created by UiSystem.');
    return this.iconsProvider(name);
  }

  /** @internal */
  getRuntime(): MultiverseRuntime {
    return this.runtime;
  }

  constructor(
    private readonly runtime: MultiverseRuntime,
    readonly realm: Realm2D,
    options: ComponentRootOptions
  ) {
    validateComponentRootOptions(runtime, realm, options);
    this.windowId = options.windowId;
    this.theme = createUiTheme(options.theme);
    this.nodes.set(1, {
      id: 1,
      type: 'panel',
      parent: null,
      children: [],
      kind: structuredClone({ ...options.panel, type: 'panel' }),
      layout: structuredClone({
        ...options.layout,
        width: { type: 'exact', value: options.width },
        height: { type: 'exact', value: options.height }
      }),
      visible: true,
      style: {}
    });
    reconcileStyles(this.nodes, 1, this.theme);
    const resolved = this.nodes.get(1)!.resolved!;
    this.handle = realm.createUi({}, options.transform);
    try {
      this.colliderId = realm.addCollider(this.handle.entityId, {
        type: 'rectangle',
        halfExtents: [options.width / 2, options.height / 2]
      });
      this.colliderSize = [options.width, options.height];
      this.root = new UiPanelComponent(this, 1);
      this.components.set(1, this.root);
      this.commands.push({
        type: 'create',
        id: 1,
        kind: structuredClone(resolved.kind),
        layout: structuredClone(resolved.layout)
      });
      this.stopRealmObserver = realm.onDispose(() => this.dispose());
      this.stopEntityObserver = realm.world.onDestroyEntity((id) => {
        if (id === this.handle.entityId) this.dispose();
      });
      this.stopObserving = runtime.interaction.observe({
        onWindowClosed: (id) => {
          if (id === options.windowId) this.dispose();
        },
        onAfterDispatch: () => this.syncPresented(),
        onDispose: () => this.dispose()
      });
    } catch (err) {
      realm.destroyUi(this.handle);
      throw err;
    }
  }

  /** @internal */
  syncPresented(): void {
    if (!this._isLiveUi()) this.dispose();
    else {
      this.presented = this.committed;
      this.interactions?.afterDispatch();
    }
  }

  get syncState(): ComponentSyncState {
    return this.state;
  }
  get lastError(): unknown {
    return this.error;
  }
  get entityId(): number {
    return this.handle.entityId;
  }
  get uiId(): number {
    return this.handle.uiId;
  }
  /** Window lifetime associated with this root, if any. */
  get targetWindowId(): number | undefined {
    return this.windowId;
  }
  /** @internal */
  attachFocus(manager: FocusManager): void {
    this.interactions = new ComponentInteractions(this, manager, this.windowId);
  }
  /** @internal */
  handleKeyboard(event: KeyboardEvent): void {
    this.interactions?.handleKeyboard(event);
  }
  /** @internal */
  windowClosed(windowId: number): void {
    this.interactions?.windowClosed(windowId);
  }
  /** @internal */
  interactionFor(id: number): PanelInteraction {
    this.requireNode(id, 'panel');
    if (!this.interactions) throw new Error('Interaction requires a root created by UiSystem.');
    return this.interactions.get(id);
  }
  /** @internal */
  observePanel(id: number): void {
    this.interactions?.get(id);
  }
  /** @internal */
  interactionEligible(id: number): boolean {
    let node = this.nodes.get(id);
    if (!node || !this.hasNode(id)) return false;
    while (node) {
      if (!node.visible || this.interactions?.isDisabled(node.id)) return false;
      node = node.parent === null ? undefined : this.nodes.get(node.parent);
    }
    return true;
  }
  /** @internal */
  interactionDisabled(id: number): boolean {
    let node = this.nodes.get(id);
    while (node) {
      if (this.interactions?.isDisabled(node.id)) return true;
      node = node.parent === null ? undefined : this.nodes.get(node.parent);
    }
    return false;
  }
  /** @internal */
  containsPanel(ancestor: number, descendant: number): boolean {
    let node = this.nodes.get(descendant);
    while (node) {
      if (node.id === ancestor) return true;
      node = node.parent === null ? undefined : this.nodes.get(node.parent);
    }
    return false;
  }
  /** @internal */
  wasPresented(id: number): boolean {
    if (this.state === 'disposed' || this.realm.isDisposed) return false;
    let node = this.presented?.get(id);
    if (!node) return false;
    while (node) {
      if (!node.visible) return false;
      node = node.parent === null ? undefined : this.presented?.get(node.parent);
    }
    return true;
  }
  /** @internal */
  setInteractionStates(id: number, states: UiStyleState[]): void {
    if (!this.hasNode(id)) return;
    if (sameUiValue(this.requireNode(id).interactionStates ?? [], states)) return;
    const wasSynced = this.state === 'synced';
    this.updateNode(id, (node) => {
      node.interactionStates = states;
    });
    if (wasSynced && this.state === 'pending') this.flush();
  }
  /** Returns an isolated copy of the current staged theme. */
  getTheme(): UiTheme {
    this.assertLive();
    return structuredClone(this.theme);
  }
  /** Replaces the theme with the defaults plus these overrides. */
  setTheme(overrides: UiThemeOverrides): void {
    this.updateTheme(createUiTheme(overrides));
  }
  /** Merges overrides into the current theme without mutating the supplied objects. */
  patchTheme(overrides: UiThemeOverrides): void {
    this.updateTheme(mergeUiTheme(this.theme, overrides));
  }

  onSyncState(callback: (state: ComponentSyncState, error?: unknown) => void): () => void {
    this.assertLive();
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  /** Synchronizes host resources first, then submits this root's changes as one atomic batch. */
  flush(): void {
    this.assertLive();
    try {
      this.realm.flush();
      this.realm.commitUiCommands(this.handle, this.commands);
    } catch (error) {
      this.error = error;
      this.changeState('failed');
      throw error;
    }
    this.commands = [];
    this.committed = new Map(this.nodes);
    this.committedTheme = structuredClone(this.theme);
    const syncedCollider = syncRootCollider(
      this.realm,
      this.entityId,
      this.colliderId,
      this.nodes.get(1)!,
      this.colliderSize,
      this.colliderActive
    );
    this.colliderSize = syncedCollider.size;
    this.colliderActive = syncedCollider.active;
    this.error = undefined;
    this.releaseRemovedListeners();
    this.changeState('synced');
    this.interactions?.reconcile(true);
  }

  /** Restores the last acknowledged tree and drops its unsubmitted local commands. */
  discardChanges(): void {
    this.assertLive();
    if (!this.committed)
      throw new Error('The root must be synchronized before changes can be discarded.');
    this.nodes = new Map(this.committed);
    this.theme = structuredClone(this.committedTheme!);
    this.commands = [];
    this.error = undefined;
    this.releaseRemovedListeners();
    this.changeState('synced');
    this.interactions?.reconcile(true);
  }

  hasNode(id: number): boolean {
    return this.state !== 'disposed' && this._isLiveUi() && this.nodes.has(id);
  }

  /** @internal */
  nodeSnapshot(id: number): NodeRecord {
    return structuredClone(this.requireNode(id));
  }
  /** @internal */
  parentOf(id: number): UiPanelComponent | undefined {
    const parent = this.requireNode(id).parent;
    return parent === null ? undefined : (this.components.get(parent) as UiPanelComponent);
  }
  /** @internal */
  childrenOf(id: number): readonly UiComponent[] {
    return this.requireNode(id, 'panel').children.map((child) => this.components.get(child)!);
  }

  /** @internal */
  addNode(parent: number, kind: UiNodeKindDesc, layout: UiLayoutStyleDesc): UiComponent {
    this.requireNode(parent, 'panel');
    if (kind.type !== 'panel' && kind.type !== 'spritePanel' && kind.type !== 'text')
      throw new Error('Only panel, sprite panel and text components are supported.');
    const id = this.nextId;
    assertValidLogicalId(id, 'UI element ID');
    this.nextId++;
    const safeKind = structuredClone(kind),
      safeLayout = structuredClone(layout);
    const type = kind.type === 'text' ? 'text' : 'panel';
    const draft = new Map(this.nodes);
    const parentOriginal = draft.get(parent)!;
    const parentNode = { ...parentOriginal, children: [...parentOriginal.children, id] };
    draft.set(parent, parentNode);
    draft.set(id, {
      id,
      type,
      parent,
      children: [],
      kind: safeKind,
      layout: safeLayout,
      visible: true,
      style: {}
    });
    reconcileStyles(draft, id, this.theme);
    const resolved = draft.get(id)!.resolved!;
    this.nodes = draft;
    const component =
      type === 'text'
        ? new UiTextComponent(this, id)
        : kind.type === 'spritePanel'
          ? new UiSpritePanelComponent(this, id)
          : new UiPanelComponent(this, id);
    this.components.set(id, component);
    this.commands.push(
      {
        type: 'create',
        id,
        kind: structuredClone(resolved.kind),
        layout: structuredClone(resolved.layout)
      },
      { type: 'insert', parentId: parent, childId: id }
    );
    this.changeState('pending');
    return component;
  }

  /** @internal */
  setVisible(id: number, visible: boolean): void {
    const node = this.requireNode(id);
    this.nodes.set(id, { ...node, visible });
    this.commands.push({ type: 'setVisible', id, visible });
    this.changeState('pending');
    this.interactions?.reconcile();
  }
  /** @internal */
  setLayout(id: number, layout: UiLayoutStyleDesc): void {
    this.updateNode(id, (node) => {
      node.layout = structuredClone(layout);
    });
  }
  /** @internal */
  setText(id: number, text: string): void {
    this.requireNode(id, 'text');
    this.updateNode(id, (node) => {
      node.kind = { ...node.kind, text };
    });
  }
  /** @internal */
  setPanelProperties(id: number, properties: Omit<UiNodeKindDesc, 'type'>): void {
    this.requireNode(id, 'panel');
    this.updateNode(id, (node) => {
      node.kind = structuredClone({ ...properties, type: node.kind.type });
    });
  }

  setSpriteUvRect(id: number, uvRect: [number, number, number, number]): void {
    if (stageSpriteUv(this.nodes, this.requireNode(id, 'panel'), uvRect, this.commands))
      this.changeState('pending');
  }

  /** @internal */
  updateStyle(id: number, update: (config: UiStyleConfig) => void): void {
    this.updateNode(id, (node) => update(node.style));
  }

  /** @internal */
  setStateStyle(id: number, state: UiStyleState, style?: UiStyle): void {
    if (!UI_STYLE_STATE_ORDER.includes(state)) throw new Error(`Unknown UI style state: ${state}`);
    this.updateStyle(id, (config) => {
      config.states ??= {};
      if (style === undefined) delete config.states[state];
      else config.states[state] = structuredClone(style);
    });
  }

  /** @internal */
  setStyleState(id: number, state: UiStyleState, active: boolean): void {
    if (!UI_STYLE_STATE_ORDER.includes(state)) throw new Error(`Unknown UI style state: ${state}`);
    this.updateStyle(id, (config) => {
      const states = new Set(config.activeStates ?? []);
      if (active) states.add(state);
      else states.delete(state);
      config.activeStates = UI_STYLE_STATE_ORDER.filter((item) => states.has(item));
    });
  }

  private updateNode(id: number, update: (node: NodeRecord) => void): void {
    this.requireNode(id);
    const draft = new Map(this.nodes);
    const original = draft.get(id)!;
    const node: NodeRecord = {
      ...original,
      kind: structuredClone(original.kind),
      layout: structuredClone(original.layout),
      style: structuredClone(original.style),
      children: [...original.children]
    };
    draft.set(id, node);
    update(node);
    if (sameUiValue(node, original)) return;
    const updates = reconcileStyles(draft, id, this.theme);
    this.nodes = draft;
    this.commands.push(...updates);
    this.changeState('pending');
  }

  private updateTheme(theme: UiTheme): void {
    this.assertLive();
    if (sameUiValue(theme, this.theme)) return;
    const draft = new Map(this.nodes);
    const updates = reconcileStyles(draft, 1, theme, true);
    this.nodes = draft;
    this.theme = theme;
    this.commands.push(...updates);
    this.changeState('pending');
  }
  /** @internal */
  moveChild(parent: number, child: UiComponent, index: number): void {
    const original = this.requireNode(parent, 'panel');
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= original.children.length ||
      !original.children.includes(child.id) ||
      !child.isAttached ||
      !child.belongsTo(this)
    )
      throw new Error('Child or index is invalid.');
    const draft = new Map(this.nodes);
    const node = { ...original, children: [...original.children] };
    draft.set(parent, node);
    node.children.splice(node.children.indexOf(child.id), 1);
    node.children.splice(index, 0, child.id);
    this.nodes = draft;
    this.commands.push({ type: 'reorder', parentId: parent, childId: child.id, index });
    this.changeState('pending');
  }
  /** @internal */
  removeNode(id: number): void {
    const node = this.requireNode(id);
    if (node.parent === null)
      throw new Error('The root panel cannot be removed; dispose the root instead.');
    const draft = new Map(this.nodes);
    const parentOriginal = this.requireNode(node.parent, 'panel');
    draft.set(node.parent, {
      ...parentOriginal,
      children: parentOriginal.children.filter((childId) => childId !== id)
    });
    const todo = [id];
    while (todo.length) {
      const current = todo.pop()!;
      const entry = draft.get(current);
      if (entry) {
        todo.push(...entry.children);
        draft.delete(current);
      }
    }
    this.nodes = draft;
    this.commands.push({ type: 'remove', id });
    this.changeState('pending');
    this.interactions?.reconcile();
  }
  /** @internal */
  onPanel(id: number, type: InteractiveEventType, callback: InteractiveCallback): () => void {
    this.requireNode(id, 'panel');
    const listener = this.panelListener(id);
    return listener.on(type, (event) => {
      const isTerminal = type === 'leave' || type === 'cancel' || type === 'pressup';
      if (
        (isTerminal || this.interactionEligible(id)) &&
        (this.windowId === undefined || event.pointer.windowId === this.windowId)
      )
        callback(event);
    });
  }
  /** @internal */
  panelListener(id: number): InteractiveListener {
    this.requireNode(id, 'panel');
    let listener = this.listeners.get(id);
    if (!listener) {
      listener = this.runtime.interactive(this.realm.realmId, {
        type: 'ui',
        uiId: this.uiId,
        elementId: id
      });
      this.listeners.set(id, listener);
    }
    return listener;
  }

  dispose(): void {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    this.stopObserving();
    this.stopRealmObserver();
    this.stopEntityObserver();
    this.interactions?.dispose();
    for (const listener of this.listeners.values()) listener.dispose();
    this.listeners.clear();
    this.components.clear();
    this.nodes.clear();
    this.commands = [];
    this.committed = undefined;
    this.presented = undefined;
    if (this._isLiveUi()) this.realm.destroyUi(this.handle);
    try {
      for (const callback of [...this.stateListeners]) callback('disposed');
    } finally {
      this.stateListeners.clear();
    }
  }
  private _isLiveUi(): boolean {
    return (
      !this.realm.isDisposed &&
      this.realm.world.isAlive(this.handle.entityId) &&
      this.realm.world.getComponent<Model2DUIComponent>(this.handle.entityId, 'Model2DUI')?.uiId ===
        this.handle.uiId
    );
  }
  private assertLive(): void {
    if (this.state === 'disposed' || !this._isLiveUi())
      throw new Error('UI component root is disposed.');
  }
  private requireNode(id: number, type?: NodeRecord['type']): NodeRecord {
    this.assertLive();
    const node = this.nodes.get(id);
    if (!node || (type && node.type !== type))
      throw new Error('UI component does not exist or has the wrong type.');
    return node;
  }
  private releaseRemovedListeners(): void {
    for (const [id, listener] of this.listeners)
      if (!this.nodes.has(id)) {
        listener.dispose();
        this.listeners.delete(id);
      }
    for (const id of this.components.keys()) if (!this.nodes.has(id)) this.components.delete(id);
  }
  private changeState(state: ComponentSyncState): void {
    if (this.state === state) return;
    this.state = state;
    for (const callback of [...this.stateListeners]) callback(state, this.error);
  }
}
