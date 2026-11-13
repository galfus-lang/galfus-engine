import type { UiQuad2DDesc, UiText2DDesc } from '@galfus/transport-types';
import { clampSize, resolvePadding, solveLayout } from '../layout/solver';
import type {
  LayoutConfig,
  PanelResizeOptions,
  PanelStyle,
  UiBorderColor,
  UiBorderRadius,
  UiBorderWidth,
  UiColor,
  UiPadding,
  UiRect,
  UiSizeConstraints
} from '../layout/types';
import type { InteractiveListener } from '@galfus/engine';
import {
  UiContentNode,
  type UiContentOptions,
  type UiHitTarget,
  type UiHost,
  type UiNode
} from './node';

export type { PanelResizeOptions } from '../layout/types';
import { animatePanel, type PanelAnimationOptions } from './panel-animator';
import { PanelEventEmitter, type PanelInteractionEvent } from './panel-events';
import { compilePanelVisual } from './panel-compiler';
import {
  bindPanelDraggable,
  bindPanelResizable,
  hitTestPanel,
  hitTestPanelScroll
} from './panel-interaction';
import type { ScrollPanel, ScrollPanelOptions } from './scroll-panel';
import type { SplitGroup, SplitGroupOptions } from './split-group';
import type { SpritePanel, SpritePanelOptions } from './sprite-panel';
import { UiText, type UiTextOptions } from './ui-text';

let createScrollPanelFactory: ((options?: ScrollPanelOptions) => ScrollPanel) | undefined;
let createSplitGroupFactory: ((options?: SplitGroupOptions) => SplitGroup) | undefined;
let createSpritePanelFactory: ((options?: SpritePanelOptions) => SpritePanel) | undefined;

export function _registerScrollPanelFactory(
  factory: (options?: ScrollPanelOptions) => ScrollPanel
): void {
  createScrollPanelFactory = factory;
}

export function _registerSplitGroupFactory(
  factory: (options?: SplitGroupOptions) => SplitGroup
): void {
  createSplitGroupFactory = factory;
}

export function _registerSpritePanelFactory(
  factory: (options?: SpritePanelOptions) => SpritePanel
): void {
  createSpritePanelFactory = factory;
}

export interface PanelOptions extends UiSizeConstraints {
  readonly id?: string;
  readonly title?: string;
  readonly style?: PanelStyle;
  readonly backgroundColor?: UiColor;
  readonly borderColor?: UiBorderColor;
  readonly borderWidth?: UiBorderWidth;
  readonly borderRadius?: UiBorderRadius;
  readonly padding?: UiPadding;
  readonly layout?: LayoutConfig;
  readonly clip?: boolean;
  readonly resizable?: boolean | PanelResizeOptions;
  readonly draggable?: boolean;
}

let panelIdCounter = 0;
export function nextUiId(prefix: string): string {
  return `${prefix}-${++panelIdCounter}`;
}

/** Fundamental UI container holding a `LayoutConfig` and nested `Panel`, `ScrollPanel`, or `SplitGroup` children. */
export class Panel implements UiNode {
  readonly id: string;
  readonly constraints: UiSizeConstraints;
  parent?: UiNode;
  protected _rect: UiRect;
  protected _appliedRect?: UiRect;
  protected _parentBounds: UiRect | undefined;
  protected _host: UiHost | undefined;
  protected _title: string | undefined;
  protected _style: PanelStyle;
  protected _padding: UiPadding | undefined;
  protected _layout: LayoutConfig;
  protected readonly _clip: boolean;
  protected readonly _resizable: PanelResizeOptions | undefined;
  protected readonly _draggable: boolean;
  protected readonly _children: UiNode[] = [];
  protected readonly _resizeListeners = new Set<(rect: UiRect) => void>();

  constructor(options: PanelOptions = {}) {
    this.id = options.id ?? nextUiId('panel');
    this.constraints = {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      minWidth: options.minWidth,
      maxWidth: options.maxWidth,
      minHeight: options.minHeight,
      maxHeight: options.maxHeight,
      flex: options.flex
    };
    const initW = typeof options.width === 'number' ? options.width : 300;
    const initH = typeof options.height === 'number' ? options.height : 200;
    this._rect = {
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: initW,
      height: initH
    };
    this._title = options.title;
    this._style = {
      fill: options.backgroundColor ?? options.style?.fill ?? '#101d2d',
      stroke: options.borderColor ?? options.style?.stroke ?? '#244263',
      strokeWidth: options.borderWidth ?? options.style?.strokeWidth ?? 1.5,
      radius: options.borderRadius ?? options.style?.radius ?? 8,
      headerFill: options.style?.headerFill ?? '#162940',
      headerHeight: options.style?.headerHeight ?? 30,
      titleColor: options.style?.titleColor ?? '#f0f7ff',
      titleFontSize: options.style?.titleFontSize ?? 13,
      ...options.style
    };
    this._padding = options.padding ?? 8;
    this._layout = options.layout ?? { type: 'vertical', gap: 8 };
    this._clip = options.clip ?? false;
    this._resizable =
      options.resizable === true
        ? { edges: ['right', 'bottom', 'corner'], handleSize: 8 }
        : options.resizable || undefined;
    this._draggable = options.draggable ?? false;
  }

  get rect(): UiRect {
    return this._rect;
  }

  get children(): readonly UiNode[] {
    return this._children;
  }

  get layout(): LayoutConfig {
    return this._layout;
  }

  get style(): PanelStyle {
    return this._style;
  }

  get title(): string | undefined {
    return this._title;
  }

  protected get headerOffset(): number {
    return this._title !== undefined ? (this._style.headerHeight ?? 30) : 0;
  }

  /** Returns the inner viewport rectangle below the optional header bar. */
  get bodyRect(): UiRect {
    const hh = this.headerOffset;
    return {
      x: this._rect.x,
      y: this._rect.y + hh,
      width: this._rect.width,
      height: Math.max(0, this._rect.height - hh)
    };
  }

  addNode<T extends UiNode>(node: T): T {
    this._appliedRect = undefined;
    node.parent = this;
    this._children.push(node);
    node.attachHost(this._host);
    this.layoutChildren();
    this._host?.markStructureDirty();
    return node;
  }

  findNode(id: string): UiNode | undefined {
    if (this.id === id) return this;
    for (const child of this._children) {
      if (child.id === id) return child;
      if ('findNode' in child && typeof (child as any).findNode === 'function') {
        const found = (child as any).findNode(id);
        if (found) return found;
      }
    }
    return undefined;
  }

  addChild<T extends UiNode>(node: T): T {
    return this.addNode(node);
  }

  addPanel(options: PanelOptions = {}): Panel {
    return this.addNode(new Panel(options));
  }

  addScrollPanel(options: ScrollPanelOptions = {}): ScrollPanel {
    if (!createScrollPanelFactory) throw new Error('ScrollPanel factory is not registered.');
    return this.addNode(createScrollPanelFactory(options));
  }

  addSplitGroup(options: SplitGroupOptions = {}): SplitGroup {
    if (!createSplitGroupFactory) throw new Error('SplitGroup factory is not registered.');
    return this.addNode(createSplitGroupFactory(options));
  }

  addSpritePanel(options: SpritePanelOptions = {}): SpritePanel {
    if (!createSpritePanelFactory) throw new Error('SpritePanel factory is not registered.');
    return this.addNode(createSpritePanelFactory(options));
  }

  addText(optionsOrText: UiTextOptions | UiText = {}): UiText {
    if (optionsOrText instanceof UiText) {
      return this.addNode(optionsOrText);
    }
    return this.addNode(new UiText(optionsOrText));
  }

  addContent(options: UiContentOptions = {}): UiContentNode {
    return this.addNode(new UiContentNode(options));
  }

  setLayout(layout: LayoutConfig): void {
    this._appliedRect = undefined;
    this._layout = layout;
    this.layoutChildren(this._host);
    this._host?.markLayoutDirty();
  }

  setPadding(padding: UiPadding): void {
    this._appliedRect = undefined;
    this._padding = padding;
    this.layoutChildren(this._host);
    this._host?.markLayoutDirty();
  }

  setParentBounds(bounds: UiRect | undefined): void {
    this._parentBounds = bounds;
  }

  /** Sets the local `(x, y)` position relative to the parent panel's inner content area. */
  setPosition(x: number, y: number): void {
    const bounds = this._parentBounds;
    const localX = bounds ? clampSize(x, 0, Math.max(0, bounds.width - this._rect.width)) : x;
    const localY = bounds ? clampSize(y, 0, Math.max(0, bounds.height - this._rect.height)) : y;
    this.constraints.x = localX;
    this.constraints.y = localY;
    const absX = (bounds?.x ?? 0) + localX;
    const absY = (bounds?.y ?? 0) + localY;
    this.applyRect({ ...this._rect, x: absX, y: absY }, this._host);
    this._host?.markStructureDirty();
  }

  /** Translates the panel by `(dx, dy)` pixels within its parent container. */
  moveBy(dx: number, dy: number): void {
    const curLocalX = this._parentBounds
      ? this._rect.x - this._parentBounds.x
      : (this.constraints.x ?? this._rect.x);
    const curLocalY = this._parentBounds
      ? this._rect.y - this._parentBounds.y
      : (this.constraints.y ?? this._rect.y);
    this.setPosition(curLocalX + dx, curLocalY + dy);
  }

  setSize(width: number, height: number): void {
    const bounds = this._parentBounds;
    const curLocalX = bounds ? Math.max(0, this._rect.x - bounds.x) : 0;
    const curLocalY = bounds ? Math.max(0, this._rect.y - bounds.y) : 0;
    const maxW = bounds
      ? Math.min(
          this.constraints.maxWidth ?? Infinity,
          Math.max(this.constraints.minWidth ?? 60, bounds.width - curLocalX)
        )
      : this.constraints.maxWidth;
    const maxH = bounds
      ? Math.min(
          this.constraints.maxHeight ?? Infinity,
          Math.max(this.constraints.minHeight ?? 40, bounds.height - curLocalY)
        )
      : this.constraints.maxHeight;
    const w = clampSize(width, this.constraints.minWidth ?? 60, maxW);
    const h = clampSize(height, this.constraints.minHeight ?? 40, maxH);
    this.constraints.width = w;
    this.constraints.height = h;
    if (this._host) {
      this.applyRect({ ...this._rect, width: w, height: h }, this._host);
      this._host.markLayoutDirty();
    } else {
      this.applyRect({ ...this._rect, width: w, height: h });
    }
  }

  setTitle(title: string): void {
    this._title = title;
    this._host?.markStructureDirty();
  }

  setStyle(style: Partial<PanelStyle>): void {
    this._style = { ...this._style, ...style };
    this._host?.markStructureDirty();
  }

  setBackgroundColor(color: UiColor): this {
    this._style = { ...this._style, fill: color };
    this._host?.markStructureDirty();
    return this;
  }

  setBorderColor(color: UiBorderColor): this {
    this._style = { ...this._style, stroke: color };
    this._host?.markStructureDirty();
    return this;
  }

  setBorderWidth(width: UiBorderWidth): this {
    this._style = { ...this._style, strokeWidth: width };
    this._host?.markStructureDirty();
    return this;
  }

  setBorderRadius(radius: UiBorderRadius): this {
    this._style = { ...this._style, radius };
    this._host?.markStructureDirty();
    return this;
  }

  setOpacity(opacity: number): this {
    this._style = { ...this._style, opacity };
    this._host?.markStructureDirty();
    return this;
  }

  protected readonly _events = new PanelEventEmitter();

  on(event: 'hover' | 'leave' | 'press' | 'release' | 'click', cb: () => void): () => void;
  on(event: 'drag' | 'scroll', cb: (dx: number, dy: number) => void): () => void;
  on(event: PanelInteractionEvent, cb: any): () => void {
    if (this._host) {
      this.ensureHostListener(this._host);
    }
    return this._events.on(event as any, cb);
  }

  onHover(cb: () => void): () => void {
    return this._events.on('hover', cb);
  }
  onLeave(cb: () => void): () => void {
    return this._events.on('leave', cb);
  }
  onPress(cb: () => void): () => void {
    return this._events.on('press', cb);
  }
  onRelease(cb: () => void): () => void {
    return this._events.on('release', cb);
  }
  onClick(cb: () => void): () => void {
    return this._events.on('click', cb);
  }
  onDrag(cb: (dx: number, dy: number) => void): () => void {
    return this._events.on('drag', cb);
  }
  onScroll(cb: (dx: number, dy: number) => void): () => void;
  onScroll(cb: (state: { scrollX: number; scrollY: number }) => void): () => void;
  onScroll(
    cb: ((dx: number, dy: number) => void) | ((state: { scrollX: number; scrollY: number }) => void)
  ): () => void {
    return this._events.on('scroll', (dx, dy) => {
      (cb as (dx: number, dy: number) => void)(dx, dy);
    });
  }

  animate(property: string, targetValue: any, options: PanelAnimationOptions = {}): this {
    animatePanel(this, property, targetValue, options);
    return this;
  }

  onResize(callback: (rect: UiRect) => void): () => void {
    this._resizeListeners.add(callback);
    return () => void this._resizeListeners.delete(callback);
  }

  private _boundHost: UiHost | undefined;
  private _boundListener: InteractiveListener | undefined;

  attachHost(host: UiHost | undefined): void {
    if (this._host !== host) {
      this._appliedRect = undefined;
    }
    this._host = host;
    if (host) {
      this.bindInteractions(host);
    }
    for (const child of this._children) child.attachHost(host);
  }

  protected ensureHostListener(host: UiHost): void {
    if (this._boundListener) return;
    this._boundHost = host;
    const listener = host.listen(this.id);
    this._boundListener = listener;

    let dragLastPos: [number, number] | undefined;

    listener.on('hover', () => this._events.emit('hover'));
    listener.on('leave', () => this._events.emit('leave'));
    listener.on('down', ({ pointer }) => {
      dragLastPos = pointer ? [pointer.position[0], pointer.position[1]] : undefined;
      this._events.emit('press');
    });
    listener.on('pressmove', ({ pointer }) => {
      if (dragLastPos && pointer) {
        const dx = pointer.position[0] - dragLastPos[0];
        const dy = pointer.position[1] - dragLastPos[1];
        dragLastPos = [pointer.position[0], pointer.position[1]];
        this._events.emit('drag', dx, dy);
      }
    });
    listener.on('pressup', () => {
      dragLastPos = undefined;
      this._events.emit('release');
      this._events.emit('click');
    });
    listener.on('up', () => {
      dragLastPos = undefined;
    });
    listener.on('cancel', () => {
      dragLastPos = undefined;
      this._events.emit('release');
    });
    listener.on('scroll', ({ scrollDelta }) => {
      if (!scrollDelta) return;
      const [dx, dy] = 'pixels' in scrollDelta ? scrollDelta.pixels : scrollDelta.lines;
      this._events.emit('scroll', dx, dy);
    });
  }

  bindInteractions(host: UiHost): void {
    bindPanelDraggable(host, this, this._draggable, this._title);
    bindPanelResizable(host, this, this._resizable);

    this.ensureHostListener(host);

    for (const child of this._children) child.bindInteractions(host);
  }

  hitTest(x: number, y: number): UiHitTarget | undefined {
    return hitTestPanel(
      this.id,
      this._rect,
      this._children,
      this._resizable,
      this._draggable,
      this._title,
      this.headerOffset,
      x,
      y
    );
  }

  hitTestScroll(x: number, y: number): UiHitTarget | undefined {
    return hitTestPanelScroll(
      this.id,
      this._rect,
      this._children,
      this._events.hasListeners('scroll') || !!this._host?.hasListeners?.(`${this.id}:scroll`),
      x,
      y
    );
  }

  compileUi(
    outQuads: UiQuad2DDesc[],
    outTexts: UiText2DDesc[],
    clipRect?: [number, number, number, number]
  ): void {
    compilePanelVisual(
      this._rect,
      this._style,
      this._title,
      this.headerOffset,
      outQuads,
      outTexts,
      clipRect
    );

    this.compileChildrenUi(outQuads, outTexts, clipRect);
  }

  protected compileChildrenUi(
    outQuads: UiQuad2DDesc[],
    outTexts: UiText2DDesc[],
    clipRect?: [number, number, number, number]
  ): void {
    const body = this.bodyRect;
    let childClip = clipRect;
    if (this._clip) {
      if (clipRect) {
        const cx0 = Math.max(clipRect[0], body.x);
        const cy0 = Math.max(clipRect[1], body.y);
        const cx1 = Math.min(clipRect[0] + clipRect[2], body.x + body.width);
        const cy1 = Math.min(clipRect[1] + clipRect[3], body.y + body.height);
        childClip = [cx0, cy0, Math.max(0, cx1 - cx0), Math.max(0, cy1 - cy0)];
      } else {
        childClip = [body.x, body.y, body.width, body.height];
      }
    }
    for (const child of this._children) {
      child.compileUi?.(outQuads, outTexts, childClip);
    }
  }

  applyRect(rect: UiRect, host?: UiHost): void {
    const prev = this._appliedRect;
    if (
      prev &&
      prev.x === rect.x &&
      prev.y === rect.y &&
      prev.width === rect.width &&
      prev.height === rect.height
    ) {
      return;
    }
    const sizeChanged = !prev || prev.width !== rect.width || prev.height !== rect.height;
    this._appliedRect = { ...rect };
    this._rect = rect;

    this.layoutChildren(host);
    if (sizeChanged) {
      for (const cb of this._resizeListeners) cb(this._rect);
    }
  }

  protected layoutChildren(host?: UiHost): void {
    if (this._children.length === 0) return;
    const body = this.bodyRect;
    const pad = resolvePadding(this._padding);
    const innerBounds: UiRect = {
      x: body.x + pad.left,
      y: body.y + pad.top,
      width: Math.max(0, body.width - pad.left - pad.right),
      height: Math.max(0, body.height - pad.top - pad.bottom)
    };
    const solution = solveLayout(
      body,
      this._padding,
      this._layout,
      this._children.map((c) => c.constraints)
    );
    for (let i = 0; i < this._children.length; i++) {
      const child = this._children[i]!;
      const childRect = solution.rects[i]!;
      child.setParentBounds?.(innerBounds);
      if (this._layout.type === 'free') {
        child.constraints.x = childRect.x - innerBounds.x;
        child.constraints.y = childRect.y - innerBounds.y;
      }
      child.applyRect(childRect, host);
    }
  }
}
