import type { InteractiveCallback, InteractiveEventType } from '@galfus/engine';
import type { UiLayoutStyleDesc, UiNodeKindDesc } from '@galfus/transport-types';
import type { UiComponentStyleKind, UiStyle, UiStyleState, UiTokenOverrides } from '../style/theme';
import type { ComponentRoot } from './root';
import type { UiActivationCallback, UiInteractionState } from './interaction';
import type { KeyboardEvent } from '@galfus/transport-types';

/** A staged component backed by a core-owned UI element. */
export class UiComponent {
  constructor(
    protected readonly owner: ComponentRoot,
    readonly id: number
  ) {}

  /** @internal The root that owns this component. */
  get componentRoot(): ComponentRoot {
    return this.owner;
  }

  get isAttached(): boolean {
    return this.owner.hasNode(this.id);
  }
  get parent(): UiPanelComponent | undefined {
    return this.owner.parentOf(this.id);
  }
  get visible(): boolean {
    return this.owner.nodeSnapshot(this.id).visible;
  }
  get layout(): UiLayoutStyleDesc {
    return this.owner.nodeSnapshot(this.id).layout;
  }
  /** Style configuration and resolved ModelUI values are returned as isolated copies. */
  get resolvedStyle(): { kind: UiNodeKindDesc; layout: UiLayoutStyleDesc } {
    const resolved = this.owner.nodeSnapshot(this.id).resolved!;
    return { kind: resolved.kind, layout: resolved.layout };
  }
  setStyle(style: UiStyle): this {
    this.owner.updateStyle(this.id, (config) => {
      config.style = structuredClone(style);
    });
    return this;
  }
  setVariant(variant?: string): this {
    this.owner.updateStyle(this.id, (config) => {
      config.variant = variant;
    });
    return this;
  }
  setTokens(tokens: UiTokenOverrides): this {
    this.owner.updateStyle(this.id, (config) => {
      config.tokens = structuredClone(tokens);
    });
    return this;
  }
  setStateStyle(state: UiStyleState, style?: UiStyle): this {
    this.owner.setStateStyle(this.id, state, style);
    return this;
  }
  /** Controls additional, explicitly selected style states. */
  setStyleState(state: UiStyleState, active: boolean): this {
    this.owner.setStyleState(this.id, state, active);
    return this;
  }
  /** @internal */
  belongsTo(owner: ComponentRoot): boolean {
    return this.owner === owner;
  }
  setVisible(visible: boolean): this {
    this.owner.setVisible(this.id, visible);
    return this;
  }
  setLayout(layout: UiLayoutStyleDesc): this {
    this.owner.setLayout(this.id, layout);
    return this;
  }
  remove(): void {
    this.owner.removeNode(this.id);
  }
}

/** Visual text is a leaf; pointer subscriptions belong to its panel. */
export class UiTextComponent extends UiComponent {
  get text(): string {
    return this.owner.nodeSnapshot(this.id).kind.text ?? '';
  }
  setText(text: string): this {
    this.owner.setText(this.id, text);
    return this;
  }
}

/** A panel can own children and receive pointer interactions. */
export class UiPanelComponent extends UiComponent {
  /** @internal */
  setComponentStyle(kind: UiComponentStyleKind): this {
    this.owner.updateStyle(this.id, (config) => {
      config.component = kind;
    });
    return this;
  }
  override setStateStyle(state: UiStyleState, style?: UiStyle): this {
    this.owner.observePanel(this.id);
    return super.setStateStyle(state, style);
  }
  /** Enables pointer interaction and keyboard focus, including negative tab indices. */
  setFocusable(tabIndex = 0): this {
    this.owner.interactionFor(this.id).setFocusable(tabIndex);
    return this;
  }
  setDisabled(value: boolean): this {
    this.owner.interactionFor(this.id).setDisabled(value);
    return this;
  }
  setReadOnly(value: boolean): this {
    this.owner.interactionFor(this.id).setReadOnly(value);
    return this;
  }
  setInvalid(value: boolean): this {
    this.owner.interactionFor(this.id).setInvalid(value);
    return this;
  }
  getInteractionState(windowId?: number): UiInteractionState {
    return this.owner.interactionFor(this.id).getState(windowId);
  }
  requestFocus(windowId?: number): boolean {
    return this.owner.interactionFor(this.id).requestFocus(windowId);
  }
  blur(windowId?: number): void {
    this.owner.interactionFor(this.id).blur(windowId);
  }
  onActivate(callback: UiActivationCallback): () => void {
    return this.owner.interactionFor(this.id).onActivate(callback);
  }
  /** Receives keyboard events while this panel is focused. */
  onKeyboard(callback: (event: KeyboardEvent) => void): () => void {
    return this.owner.interactionFor(this.id).onKeyboard(callback);
  }
  /** @internal */
  requestKeyboardFocus(windowId: number): boolean {
    return this.owner.interactionFor(this.id).requestKeyboardFocus(windowId);
  }
  get children(): readonly UiComponent[] {
    return this.owner.childrenOf(this.id);
  }
  addPanel(
    properties: Omit<UiNodeKindDesc, 'type'> = {},
    layout: UiLayoutStyleDesc = {}
  ): UiPanelComponent {
    return this.owner.addNode(
      this.id,
      { ...properties, type: 'panel' },
      layout
    ) as UiPanelComponent;
  }
  addText(
    text: string,
    fontSize?: number,
    properties: Omit<UiNodeKindDesc, 'type' | 'text' | 'fontSize'> = {},
    layout: UiLayoutStyleDesc = {}
  ): UiTextComponent {
    return this.owner.addNode(
      this.id,
      { ...properties, type: 'text', text, ...(fontSize === undefined ? {} : { fontSize }) },
      layout
    ) as UiTextComponent;
  }
  setProperties(properties: Omit<UiNodeKindDesc, 'type'>): this {
    this.owner.setPanelProperties(this.id, properties);
    return this;
  }
  moveChild(child: UiComponent, index: number): this {
    this.owner.moveChild(this.id, child, index);
    return this;
  }
  on(type: InteractiveEventType, callback: InteractiveCallback): () => void {
    this.owner.observePanel(this.id);
    return this.owner.onPanel(this.id, type, callback);
  }
}
