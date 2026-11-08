import { clampSize, resolvePadding, solveLayout } from '../layout/solver';
import type {
  LayoutConfig,
  PanelStyle,
  UiPadding,
  UiRect,
  UiSizeConstraints
} from '../layout/types';
import {
  escapeXml,
  fmtNum,
  UiContentNode,
  type UiContentOptions,
  type UiHost,
  type UiNode
} from './node';
import type { ScrollPanel, ScrollPanelOptions } from './scroll-panel';
import type { SplitGroup, SplitGroupOptions } from './split-group';

let createScrollPanelFactory: ((options?: ScrollPanelOptions) => ScrollPanel) | undefined;
let createSplitGroupFactory: ((options?: SplitGroupOptions) => SplitGroup) | undefined;

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

export interface PanelResizeOptions {
  readonly edges?: readonly ('right' | 'bottom' | 'corner')[];
  readonly handleSize?: number;
}

export interface PanelOptions extends UiSizeConstraints {
  readonly id?: string;
  readonly title?: string;
  readonly style?: PanelStyle;
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
      minWidth: options.minWidth ?? 60,
      maxWidth: options.maxWidth,
      minHeight: options.minHeight ?? 40,
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
      fill: '#101d2d',
      stroke: '#244263',
      strokeWidth: 1.5,
      radius: 8,
      headerFill: '#162940',
      headerHeight: 30,
      titleColor: '#f0f7ff',
      titleFontSize: 13,
      ...options.style
    };
    this._padding = options.padding ?? 8;
    this._layout = options.layout ?? { type: 'vertical', gap: 8 };
    this._clip = options.clip ?? true;
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
    this._children.push(node);
    node.attachHost(this._host);
    this.layoutChildren();
    this._host?.markStructureDirty();
    return node;
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

  addContent(options: UiContentOptions = {}): UiContentNode {
    const id = options.id ?? (this._host ? this._host.allocateId('item') : nextUiId('item'));
    return this.addNode(new UiContentNode(id, options));
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
    const w = clampSize(width, this.constraints.minWidth, maxW);
    const h = clampSize(height, this.constraints.minHeight, maxH);
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
    this._host?.setText(`${this.id}-title`, title);
  }

  setStyle(style: Partial<PanelStyle>): void {
    this._style = { ...this._style, ...style };
    if (!this._host) return;
    if (style.fill !== undefined) this._host.setAttr(`${this.id}-bg`, 'fill', style.fill);
    if (style.stroke !== undefined) this._host.setAttr(`${this.id}-bg`, 'stroke', style.stroke);
  }

  onResize(callback: (rect: UiRect) => void): () => void {
    this._resizeListeners.add(callback);
    return () => void this._resizeListeners.delete(callback);
  }

  attachHost(host: UiHost | undefined): void {
    if (this._host !== host) {
      this._appliedRect = undefined;
    }
    this._host = host;
    for (const child of this._children) child.attachHost(host);
  }

  collectDefs(defs: string[]): void {
    if (this._clip) {
      const body = this.bodyRect;
      defs.push(
        `<clipPath id="${this.id}-clip"><rect id="${this.id}-clip-rect" x="${fmtNum(body.x)}" y="${fmtNum(body.y)}" width="${fmtNum(body.width)}" height="${fmtNum(body.height)}"/></clipPath>`
      );
    }
    for (const child of this._children) child.collectDefs(defs);
  }

  renderSvg(): string {
    const { x, y, width, height } = this._rect;
    const rx = this._style.radius ?? 0;
    const rxAttr = rx > 0 ? ` rx="${fmtNum(rx)}"` : '';
    const fillAttr = this._style.fill ? ` fill="${this._style.fill}"` : ' fill="none"';
    const strokeAttr = this._style.stroke
      ? ` stroke="${this._style.stroke}" stroke-width="${fmtNum(this._style.strokeWidth ?? 1)}"`
      : '';
    const opacityAttr =
      this._style.opacity !== undefined ? ` fill-opacity="${fmtNum(this._style.opacity)}"` : '';

    const parts: string[] = [
      `<g id="${this.id}">`,
      `<rect id="${this.id}-bg" x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(width)}" height="${fmtNum(height)}"${rxAttr}${fillAttr}${strokeAttr}${opacityAttr}/>`
    ];

    if (this._title !== undefined) {
      const hh = this.headerOffset;
      const hFill = this._style.headerFill ?? '#162940';
      const fSize = this._style.titleFontSize ?? 13;
      parts.push(
        `<rect id="${this.id}-header" x="${fmtNum(x + 1)}" y="${fmtNum(y + 1)}" width="${fmtNum(Math.max(0, width - 2))}" height="${fmtNum(hh)}"${rxAttr} fill="${hFill}"/>`,
        `<text id="${this.id}-title" x="${fmtNum(x + 12)}" y="${fmtNum(y + hh * 0.5 + fSize * 0.36)}" fill="${this._style.titleColor ?? '#f0f7ff'}" font-family="sans-serif" font-size="${fmtNum(fSize)}" font-weight="bold">${escapeXml(this._title)}</text>`
      );
    }

    parts.push(this.renderChildrenSvg());
    parts.push(this.renderResizeHandlesSvg());
    parts.push('</g>');
    return parts.join('');
  }

  protected renderChildrenSvg(): string {
    const inner = this._children.map((child) => child.renderSvg()).join('');
    if (!this._clip) return `<g id="${this.id}-body">${inner}</g>`;
    return `<g id="${this.id}-body" clip-path="url(#${this.id}-clip)">${inner}</g>`;
  }

  protected renderResizeHandlesSvg(): string {
    if (!this._resizable) return '';
    const { x, y, width, height } = this._rect;
    const hs = this._resizable.handleSize ?? 8;
    const edges = this._resizable.edges ?? ['right', 'bottom', 'corner'];
    const parts: string[] = [];
    if (edges.includes('right')) {
      parts.push(
        `<rect id="${this.id}-res-r" x="${fmtNum(x + width - hs)}" y="${fmtNum(y)}" width="${fmtNum(hs)}" height="${fmtNum(height)}" fill="#ffffff" fill-opacity="0.005"/>`
      );
    }
    if (edges.includes('bottom')) {
      parts.push(
        `<rect id="${this.id}-res-b" x="${fmtNum(x)}" y="${fmtNum(y + height - hs)}" width="${fmtNum(width)}" height="${fmtNum(hs)}" fill="#ffffff" fill-opacity="0.005"/>`
      );
    }
    if (edges.includes('corner')) {
      const cs = hs * 1.5;
      parts.push(
        `<rect id="${this.id}-res-c" x="${fmtNum(x + width - cs)}" y="${fmtNum(y + height - cs)}" width="${fmtNum(cs)}" height="${fmtNum(cs)}" rx="3" fill="#38bdf8" fill-opacity="0.35"/>`
      );
    }
    return parts.join('');
  }

  bindInteractions(host: UiHost): void {
    if (this._draggable && this._title !== undefined) {
      let lastPos: [number, number] | undefined;
      const header = host.listen(`${this.id}-header`);
      header.on('down', ({ pointer }) => {
        if (pointer.type === 'button' && pointer.button === 'primary') {
          lastPos = [pointer.position[0], pointer.position[1]];
        }
      });
      header.on('pressmove', ({ pointer }) => {
        if (!lastPos) return;
        const dx = pointer.position[0] - lastPos[0];
        const dy = pointer.position[1] - lastPos[1];
        lastPos = [pointer.position[0], pointer.position[1]];
        this.moveBy(dx, dy);
      });
      header.on('pressup', () => (lastPos = undefined));
      header.on('cancel', () => (lastPos = undefined));
    }

    if (this._resizable) {
      const edges = this._resizable.edges ?? ['right', 'bottom', 'corner'];
      const bindEdge = (suffix: string, horiz: boolean, vert: boolean) => {
        let lastPos: [number, number] | undefined;
        const listener = host.listen(`${this.id}-${suffix}`);
        if (suffix === 'res-c') {
          listener.on('hover', () => host.setAttr(`${this.id}-res-c`, 'fill-opacity', '0.85'));
          listener.on('leave', () => host.setAttr(`${this.id}-res-c`, 'fill-opacity', '0.35'));
        }
        listener.on('down', ({ pointer }) => {
          if (pointer.type === 'button' && pointer.button === 'primary') {
            lastPos = [pointer.position[0], pointer.position[1]];
          }
        });
        listener.on('pressmove', ({ pointer }) => {
          if (!lastPos) return;
          const dx = horiz ? pointer.position[0] - lastPos[0] : 0;
          const dy = vert ? pointer.position[1] - lastPos[1] : 0;
          lastPos = [pointer.position[0], pointer.position[1]];
          this.setSize(this._rect.width + dx, this._rect.height + dy);
        });
        listener.on('pressup', () => (lastPos = undefined));
        listener.on('cancel', () => (lastPos = undefined));
      };
      if (edges.includes('corner')) bindEdge('res-c', true, true);
      if (edges.includes('right')) bindEdge('res-r', true, false);
      if (edges.includes('bottom')) bindEdge('res-b', false, true);
    }

    for (const child of this._children) child.bindInteractions(host);
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

    if (host) {
      const { x, y, width, height } = rect;
      host.setAttr(`${this.id}-bg`, 'x', fmtNum(x));
      host.setAttr(`${this.id}-bg`, 'y', fmtNum(y));
      host.setAttr(`${this.id}-bg`, 'width', fmtNum(width));
      host.setAttr(`${this.id}-bg`, 'height', fmtNum(height));

      if (this._title !== undefined) {
        const hh = this.headerOffset;
        const fSize = this._style.titleFontSize ?? 13;
        host.setAttr(`${this.id}-header`, 'x', fmtNum(x + 1));
        host.setAttr(`${this.id}-header`, 'y', fmtNum(y + 1));
        host.setAttr(`${this.id}-header`, 'width', fmtNum(Math.max(0, width - 2)));
        host.setAttr(`${this.id}-header`, 'height', fmtNum(hh));
        host.setAttr(`${this.id}-title`, 'x', fmtNum(x + 12));
        host.setAttr(`${this.id}-title`, 'y', fmtNum(y + hh * 0.5 + fSize * 0.36));
      }

      if (this._clip) {
        const body = this.bodyRect;
        host.setAttr(`${this.id}-clip-rect`, 'x', fmtNum(body.x));
        host.setAttr(`${this.id}-clip-rect`, 'y', fmtNum(body.y));
        host.setAttr(`${this.id}-clip-rect`, 'width', fmtNum(body.width));
        host.setAttr(`${this.id}-clip-rect`, 'height', fmtNum(body.height));
      }

      if (this._resizable) {
        const hs = this._resizable.handleSize ?? 8;
        const edges = this._resizable.edges ?? ['right', 'bottom', 'corner'];
        if (edges.includes('right')) {
          host.setAttr(`${this.id}-res-r`, 'x', fmtNum(x + width - hs));
          host.setAttr(`${this.id}-res-r`, 'y', fmtNum(y));
          host.setAttr(`${this.id}-res-r`, 'height', fmtNum(height));
        }
        if (edges.includes('bottom')) {
          host.setAttr(`${this.id}-res-b`, 'x', fmtNum(x));
          host.setAttr(`${this.id}-res-b`, 'y', fmtNum(y + height - hs));
          host.setAttr(`${this.id}-res-b`, 'width', fmtNum(width));
        }
        if (edges.includes('corner')) {
          const cs = hs * 1.5;
          host.setAttr(`${this.id}-res-c`, 'x', fmtNum(x + width - cs));
          host.setAttr(`${this.id}-res-c`, 'y', fmtNum(y + height - cs));
        }
      }
    }

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
