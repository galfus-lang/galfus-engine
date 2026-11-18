import type { UiLayoutStyleDesc } from '@galfus/transport-types';
import type { UiComponentStyleKind, UiStyle, UiStyleState, UiTokenOverrides } from '../style/theme';
import type { UiActivationCallback, UiInteractionState } from './interaction';
import { UiPanelComponent, UiTextComponent } from './component';

export type UiOrientation = 'horizontal' | 'vertical';
export interface UiControlOptions {
  readonly variant?: string;
  readonly style?: UiStyle;
  readonly states?: Partial<Record<UiStyleState, UiStyle>>;
  readonly tokens?: UiTokenOverrides;
  readonly layout?: UiLayoutStyleDesc;
  readonly disabled?: boolean;
}
export interface UiButtonOptions extends UiControlOptions {
  readonly label: string;
  readonly tabIndex?: number;
  readonly onActivate?: UiActivationCallback;
}
export interface UiContainerOptions extends UiControlOptions {
  readonly orientation?: UiOrientation;
  readonly spacing?: number;
}

function checkedSpacing(spacing: number): number {
  if (!Number.isFinite(spacing) || spacing < 0)
    throw new RangeError('Spacing must be non-negative and finite.');
  return spacing;
}
function direction(orientation: UiOrientation): 'row' | 'column' {
  if (orientation === 'horizontal') return 'row';
  if (orientation === 'vertical') return 'column';
  throw new Error('Invalid UI orientation.');
}
export function makePanel(
  parent: UiPanelComponent,
  kind: UiComponentStyleKind,
  options: UiControlOptions,
  layout: UiLayoutStyleDesc
): UiPanelComponent {
  const panel = parent.addPanel({}, layout);
  try {
    panel.setComponentStyle(kind);
    if (options.tokens) panel.setTokens(options.tokens);
    if (options.variant !== undefined) panel.setVariant(options.variant);
    if (options.style) panel.setStyle(options.style);
    if (options.states)
      for (const [state, style] of Object.entries(options.states))
        panel.setStateStyle(state as UiStyleState, style);
    if (options.disabled) panel.setDisabled(true);
    return panel;
  } catch (error) {
    panel.remove();
    throw error;
  }
}

/** A package component owns one panel subtree in the parent component tree. */
export abstract class UiControl {
  protected constructor(readonly panel: UiPanelComponent) {}
  get isAttached(): boolean {
    return this.panel.isAttached;
  }
  setStyle(style: UiStyle): this {
    this.panel.setStyle(style);
    return this;
  }
  setStateStyle(state: UiStyleState, style?: UiStyle): this {
    this.panel.setStateStyle(state, style);
    return this;
  }
  setTokens(tokens: UiTokenOverrides): this {
    this.panel.setTokens(tokens);
    return this;
  }
  setVariant(variant?: string): this {
    this.panel.setVariant(variant);
    return this;
  }
  setVisible(visible: boolean): this {
    this.panel.setVisible(visible);
    return this;
  }
  setDisabled(disabled: boolean): this {
    this.panel.setDisabled(disabled);
    return this;
  }
  getInteractionState(windowId?: number): UiInteractionState {
    return this.panel.getInteractionState(windowId);
  }
  remove(): void {
    if (this.isAttached) this.panel.remove();
  }
  dispose(): void {
    this.remove();
  }
}

/** A focusable panel with a non-interactive text label. */
export class UiButton extends UiControl {
  readonly labelNode: UiTextComponent;
  constructor(parent: UiPanelComponent, options: UiButtonOptions) {
    if (options.tabIndex !== undefined && !Number.isSafeInteger(options.tabIndex))
      throw new RangeError('tabIndex must be a safe integer.');
    const panel = makePanel(parent, 'button', options, {
      padding: [8, 12, 8, 12],
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 36,
      ...options.layout
    });
    super(panel);
    try {
      this.labelNode = panel.addText(options.label);
      panel.setFocusable(options.tabIndex);
      if (options.onActivate) panel.onActivate(options.onActivate);
    } catch (error) {
      panel.remove();
      throw error;
    }
  }
  get label(): string {
    return this.labelNode.text;
  }
  setLabel(label: string): this {
    this.labelNode.setText(label);
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
  onActivate(callback: UiActivationCallback): () => void {
    return this.panel.onActivate(callback);
  }
}

/** A structural panel; child controls belong to its subtree and are disposed with it. */
export abstract class UiControlContainer extends UiControl {
  protected constructor(
    parent: UiPanelComponent,
    kind: UiComponentStyleKind,
    options: UiContainerOptions
  ) {
    const axis =
      options.orientation === undefined
        ? (options.layout?.direction ?? 'row')
        : direction(options.orientation);
    const gap =
      options.spacing === undefined
        ? (options.layout?.gap ?? [8, 8])
        : ([checkedSpacing(options.spacing), options.spacing] as [number, number]);
    super(
      makePanel(parent, kind, options, {
        alignItems: 'center',
        ...options.layout,
        direction: axis,
        gap
      })
    );
  }
  get children(): readonly (UiPanelComponent | UiTextComponent)[] {
    return this.panel.children as readonly (UiPanelComponent | UiTextComponent)[];
  }
  get orientation(): UiOrientation {
    return this.panel.layout.direction === 'column' ? 'vertical' : 'horizontal';
  }
  setOrientation(value: UiOrientation): this {
    this.panel.setLayout({ ...this.panel.layout, direction: direction(value) });
    return this;
  }
  setSpacing(value: number): this {
    const spacing = checkedSpacing(value);
    this.panel.setLayout({ ...this.panel.layout, gap: [spacing, spacing] });
    return this;
  }
  addButton(options: UiButtonOptions): UiButton {
    return new UiButton(this.panel, options);
  }
  addButtonGroup(options: UiContainerOptions = {}): UiButtonGroup {
    return new UiButtonGroup(this.panel, options);
  }
  addToolbar(options: UiContainerOptions = {}): UiToolbar {
    return new UiToolbar(this.panel, options);
  }
  addText(text: string): UiTextComponent {
    return this.panel.addText(text);
  }
  moveChild(child: UiControl | UiPanelComponent | UiTextComponent, index: number): this {
    this.panel.moveChild(child instanceof UiControl ? child.panel : child, index);
    return this;
  }
}
export class UiButtonGroup extends UiControlContainer {
  constructor(parent: UiPanelComponent, options: UiContainerOptions = {}) {
    super(parent, 'buttonGroup', options);
  }
}
export class UiToolbar extends UiControlContainer {
  constructor(parent: UiPanelComponent, options: UiContainerOptions = {}) {
    super(parent, 'toolbar', options);
  }
}
export class UiAppBar extends UiControlContainer {
  constructor(parent: UiPanelComponent, options: UiContainerOptions = {}) {
    super(parent, 'appBar', options);
  }
}
