import type {
  InteractiveCallback,
  InteractiveEventType,
  InteractiveListener,
  MultiverseRuntime,
  Realm2D,
  Transform2DProps
} from '@galfus/engine';
import { assertValidLogicalId } from '@galfus/transport-types';
import type { UiCommandDesc, UiLayoutStyleDesc, UiNodeKindDesc } from '@galfus/transport-types';
import type { AnimValue, TransitionConfig } from '@galfus/transport-types';

export type NativeUiAnimationProperty =
  | 'backgroundColor'
  | 'borderColor'
  | 'borderWidth'
  | 'borderRadius'
  | 'opacity'
  | 'position'
  | 'size';

export interface NativeUiOptions {
  readonly width: number;
  readonly height: number;
  readonly rootId?: number;
  readonly root?: Omit<UiNodeKindDesc, 'type'>;
  readonly layout?: Omit<UiLayoutStyleDesc, 'width' | 'height'>;
  readonly transform?: Transform2DProps;
}

/** A UI element handle. Geometry and tree ownership remain in the core. */
export class NativeUiElement {
  constructor(
    protected readonly model: NativeUiModel,
    readonly id: number
  ) {}

  setLayout(layout: UiLayoutStyleDesc): this {
    this.model.apply([{ type: 'setLayout', id: this.id, layout }]);
    return this;
  }

  setVisible(visible: boolean): this {
    this.model.apply([{ type: 'setVisible', id: this.id, visible }]);
    return this;
  }

  remove(): void {
    this.model.removeElement(this.id);
  }
}

/** Text is a layout element and is not a pointer-event target. */
export class NativeUiText extends NativeUiElement {
  setText(
    text: string,
    fontSize: number,
    properties: Omit<UiNodeKindDesc, 'type' | 'text' | 'fontSize'> = {}
  ): this {
    this.model.apply([
      { type: 'setKind', id: this.id, kind: { ...properties, type: 'text', text, fontSize } }
    ]);
    return this;
  }
}

/** Core-owned panel handle; pointer events are delivered by the interaction system. */
export class NativeUiPanel extends NativeUiElement {
  /** Starts a transition evaluated and applied by the core animation system. */
  transition(
    property: NativeUiAnimationProperty,
    from: AnimValue,
    to: AnimValue,
    config: TransitionConfig
  ): this {
    this.model.transition(this.id, property, from, to, config);
    return this;
  }

  addPanel(
    properties: Omit<UiNodeKindDesc, 'type'> = {},
    layout: UiLayoutStyleDesc = {},
    id?: number
  ): NativeUiPanel {
    return this.model.createPanel(this.id, 'panel', properties, layout, id);
  }

  addSpritePanel(
    properties: Omit<UiNodeKindDesc, 'type'> = {},
    layout: UiLayoutStyleDesc = {},
    id?: number
  ): NativeUiPanel {
    return this.model.createPanel(this.id, 'spritePanel', properties, layout, id);
  }

  addScrollPanel(
    properties: Omit<UiNodeKindDesc, 'type'> = {},
    layout: UiLayoutStyleDesc = {},
    id?: number
  ): NativeUiPanel {
    return this.model.createPanel(this.id, 'scrollPanel', properties, layout, id);
  }

  addText(
    text: string,
    fontSize: number,
    properties: Omit<UiNodeKindDesc, 'type' | 'text' | 'fontSize'> = {},
    layout: UiLayoutStyleDesc = {},
    id?: number
  ): NativeUiText {
    const nodeId = this.model.createChild(
      this.id,
      { ...properties, type: 'text', text, fontSize },
      layout,
      id
    );
    return new NativeUiText(this.model, nodeId);
  }

  setKind(kind: UiNodeKindDesc): this {
    if (kind.type === 'text') throw new Error('A panel cannot be configured as text.');
    this.model.apply([{ type: 'setKind', id: this.id, kind }]);
    return this;
  }

  on(type: InteractiveEventType, callback: InteractiveCallback): () => void {
    return this.model.listen(this.id).on(type, callback);
  }
}

/** Command-only host facade for a core-owned Model2DUI. */
export class NativeUiModel {
  readonly root: NativeUiPanel;
  readonly handle: ReturnType<Realm2D['createUi']>;
  private nextId = 1;
  private disposed = false;
  private readonly listeners = new Map<number, InteractiveListener>();
  private readonly children = new Map<number, Set<number>>();
  private readonly parents = new Map<number, number>();
  private readonly transitions = new Map<
    number,
    Map<NativeUiAnimationProperty, ReturnType<MultiverseRuntime['animation']['createTransition']>>
  >();

  constructor(
    private readonly runtime: MultiverseRuntime,
    readonly realm: Realm2D,
    options: NativeUiOptions
  ) {
    if (
      !Number.isFinite(options.width) ||
      options.width <= 0 ||
      !Number.isFinite(options.height) ||
      options.height <= 0
    ) {
      throw new Error('UI width and height must be positive finite values.');
    }
    const id = this.allocateId(options.rootId);
    this.handle = realm.createUi({}, options.transform);
    this.root = new NativeUiPanel(this, id);
    this.apply([
      {
        type: 'create',
        id,
        kind: { ...options.root, type: 'panel' },
        layout: {
          ...options.layout,
          width: { type: 'exact', value: options.width },
          height: { type: 'exact', value: options.height }
        }
      }
    ]);
    this.children.set(id, new Set());
  }

  get uiId(): number {
    return this.handle.uiId;
  }
  get entityId(): number {
    return this.handle.entityId;
  }

  apply(commands: readonly UiCommandDesc[]): void {
    if (this.disposed) throw new Error('UI model is disposed.');
    this.realm.applyUiCommands(this.handle, commands);
  }

  createChild(
    parentId: number,
    kind: UiNodeKindDesc,
    layout: UiLayoutStyleDesc,
    id?: number
  ): number {
    const childId = this.allocateId(id);
    this.apply([
      { type: 'create', id: childId, kind, layout },
      { type: 'insert', parentId, childId }
    ]);
    this.children.set(childId, new Set());
    this.children.get(parentId)?.add(childId);
    this.parents.set(childId, parentId);
    return childId;
  }

  /** Removes a subtree and releases its host-side event subscriptions. */
  removeElement(id: number): void {
    this.apply([{ type: 'remove', id }]);
    const parent = this.parents.get(id);
    if (parent !== undefined) this.children.get(parent)?.delete(id);
    const pending = [id];
    while (pending.length > 0) {
      const current = pending.pop()!;
      pending.push(...(this.children.get(current) ?? []));
      this.listeners.get(current)?.dispose();
      this.listeners.delete(current);
      this.clearTransitions(current);
      this.children.delete(current);
      this.parents.delete(current);
    }
  }

  transition(
    id: number,
    property: NativeUiAnimationProperty,
    from: AnimValue,
    to: AnimValue,
    config: TransitionConfig
  ): void {
    if (this.disposed) throw new Error('UI model is disposed.');
    if (!this.children.has(id)) throw new Error(`UI element ${id} does not exist.`);
    const types: Record<NativeUiAnimationProperty, AnimValue['type']> = {
      backgroundColor: 'vec4',
      borderColor: 'vec4',
      borderWidth: 'vec4',
      borderRadius: 'vec4',
      opacity: 'scalar',
      position: 'vec2',
      size: 'vec2'
    };
    if (from.type !== types[property] || to.type !== types[property])
      throw new Error(`Invalid value type for UI ${property}.`);
    const transitions = this.transitions.get(id) ?? new Map();
    const previous = transitions.get(property);
    if (previous !== undefined) this.runtime.animation.destroyTransition(previous);
    const kind = `uiElement${property.charAt(0).toUpperCase()}${property.slice(1)}` as
      | 'uiElementBackgroundColor'
      | 'uiElementBorderColor'
      | 'uiElementBorderWidth'
      | 'uiElementBorderRadius'
      | 'uiElementOpacity'
      | 'uiElementPosition'
      | 'uiElementSize';
    const transition = this.runtime.animation.createTransition(from, config, {
      kind,
      realmId: this.realm.realmId,
      uiId: this.uiId,
      elementId: id
    });
    transitions.set(property, transition);
    this.transitions.set(id, transitions);
    this.runtime.animation.transitionTo(transition, to, config);
  }

  private clearTransitions(id: number): void {
    for (const transition of this.transitions.get(id)?.values() ?? [])
      this.runtime.animation.destroyTransition(transition);
    this.transitions.delete(id);
  }

  createPanel(
    parentId: number,
    type: 'panel' | 'spritePanel' | 'scrollPanel',
    properties: Omit<UiNodeKindDesc, 'type'>,
    layout: UiLayoutStyleDesc,
    id?: number
  ): NativeUiPanel {
    return new NativeUiPanel(this, this.createChild(parentId, { ...properties, type }, layout, id));
  }

  listen(id: number): InteractiveListener {
    if (this.disposed) throw new Error('UI model is disposed.');
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
    if (this.disposed) return;
    this.disposed = true;
    for (const listener of this.listeners.values()) listener.dispose();
    this.listeners.clear();
    for (const id of this.transitions.keys()) this.clearTransitions(id);
    this.children.clear();
    this.parents.clear();
    this.realm.destroyUi(this.handle);
  }

  private allocateId(requested?: number): number {
    const id = requested ?? this.nextId;
    assertValidLogicalId(id, 'UI element ID');
    this.nextId = Math.max(this.nextId, id + 1);
    return id;
  }
}
