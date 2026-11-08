import type {
  InteractiveListener,
  MultiverseRuntime,
  Realm2D,
  Svg2DComponent
} from '@galfus/engine';
import { fmtNum, type UiContentNode, type UiContentOptions, type UiHost } from './node';
import { nextUiId, Panel, type PanelOptions } from './panel';
import { ScrollPanel, type ScrollPanelOptions } from './scroll-panel';
import { SplitGroup, type SplitGroupOptions } from './split-group';

export interface UiRootOptions extends PanelOptions {
  readonly width?: number;
  readonly height?: number;
  readonly zLayer?: number;
  readonly drawOrder?: number;
}

/**
 * Owns an auto-generated `Svg2D` model in a `Realm2D` and manages a hierarchy of
 * `Panel`, `ScrollPanel`, and `SplitGroup` containers.
 */
export class UiRoot implements UiHost {
  readonly rootPanel: Panel;
  private _width: number;
  private _height: number;
  private _svgHandle: { readonly entityId: number; readonly svgId: number };
  private _structureDirty = false;
  private _layoutDirty = false;
  private _dimensionsDirty = false;
  private _batching = false;
  private _rebinding = false;
  private _disposed = false;
  private readonly _boundListeners: InteractiveListener[] = [];
  private readonly _userListeners: InteractiveListener[] = [];
  private readonly _attrCache = new Map<string, Map<string, string>>();
  private readonly _textCache = new Map<string, string>();

  constructor(
    private readonly runtime: MultiverseRuntime,
    readonly realm: Realm2D,
    options: UiRootOptions = {}
  ) {
    this._width = Math.max(1, options.width ?? 800);
    this._height = Math.max(1, options.height ?? 600);
    this.rootPanel = new Panel({
      ...options,
      id: options.id ?? nextUiId('ui-root'),
      x: 0,
      y: 0,
      width: this._width,
      height: this._height,
      clip: options.clip ?? false
    });
    this.rootPanel.applyRect({ x: 0, y: 0, width: this._width, height: this._height });
    const xml = this.buildSvgXml();
    this._svgHandle = realm.createSvg(
      {
        source: xml,
        dimensions: [this._width, this._height],
        castShadow: false,
        receiveShadow: false
      },
      {
        position: [0, 0],
        zLayer: options.zLayer ?? 0,
        drawOrder: options.drawOrder ?? 0
      }
    );
    this.rootPanel.attachHost(this);
    this.rebindInteractions();
  }

  get svgId(): number {
    return this._svgHandle.svgId;
  }

  get entityId(): number {
    return this._svgHandle.entityId;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  addPanel(options: PanelOptions = {}): Panel {
    return this.rootPanel.addPanel(options);
  }

  addScrollPanel(options: ScrollPanelOptions = {}): ScrollPanel {
    return this.rootPanel.addScrollPanel(options);
  }

  addSplitGroup(options: SplitGroupOptions = {}): SplitGroup {
    return this.rootPanel.addSplitGroup(options);
  }

  addContent(options: UiContentOptions = {}): UiContentNode {
    return this.rootPanel.addContent(options);
  }

  /** Batches multiple structural or layout mutations into a single SVG synchronization pass. */
  batch(fn: () => void): void {
    const prev = this._batching;
    this._batching = true;
    try {
      fn();
    } finally {
      this._batching = prev;
      if (!prev) this.flush();
    }
  }

  /** Resizes the root SVG viewport and recalculates the entire panel hierarchy. */
  resizeViewport(width: number, height: number): void {
    if (this._disposed) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (w === this._width && h === this._height) return;
    this._width = w;
    this._height = h;
    this.rootPanel.constraints.width = w;
    this.rootPanel.constraints.height = h;
    this._dimensionsDirty = true;
    this._structureDirty = true;
    this.flush();
  }

  /** Synchronizes any pending structural or layout changes to the underlying `Svg2D`. */
  flush(): void {
    if (this._disposed || this._batching) return;
    if (this._structureDirty) {
      this._attrCache.clear();
      this._textCache.clear();
      this.rootPanel.applyRect({ x: 0, y: 0, width: this._width, height: this._height });
      this._structureDirty = false;
      this._layoutDirty = false;
      const xml = this.buildSvgXml();
      const svgComp = this.realm.world.getComponent<Svg2DComponent>(
        this._svgHandle.entityId,
        'Svg2D'
      );
      if (svgComp) {
        svgComp.desc = {
          ...svgComp.desc,
          source: xml,
          dimensions: [this._width, this._height]
        };
        if (this._dimensionsDirty) {
          svgComp.isDirty = true;
          this._dimensionsDirty = false;
        }
      }
      this.realm.setSvgSource(this._svgHandle, xml);
      this.rebindInteractions();
    } else if (this._layoutDirty) {
      this._layoutDirty = false;
      this.rootPanel.applyRect({ x: 0, y: 0, width: this._width, height: this._height }, this);
    }
  }

  /** Returns the current generated SVG XML string for inspection or testing. */
  toSvgString(): string {
    return this.buildSvgXml();
  }

  allocateId(prefix: string): string {
    return nextUiId(prefix);
  }

  markStructureDirty(): void {
    this._structureDirty = true;
    if (!this._batching) this.flush();
  }

  markLayoutDirty(): void {
    if (this._structureDirty) return;
    this._layoutDirty = true;
    if (!this._batching) this.flush();
  }

  setAttr(elementId: string, name: string, value: string): void {
    if (this._disposed || this._structureDirty || this._batching) return;
    let map = this._attrCache.get(elementId);
    if (map?.get(name) === value) return;
    if (!map) this._attrCache.set(elementId, (map = new Map()));
    map.set(name, value);
    this.realm.setSvgAttribute(this._svgHandle, elementId, name, value);
  }

  setText(elementId: string, value: string): void {
    if (this._disposed || this._structureDirty || this._batching) return;
    if (this._textCache.get(elementId) === value) return;
    this._textCache.set(elementId, value);
    this.realm.setSvgText(this._svgHandle, elementId, value);
  }

  listen(elementId: string): InteractiveListener {
    const listener = this.runtime.interactive(this.realm.realmId, {
      type: 'svg',
      svgId: this._svgHandle.svgId,
      elementId
    });
    if (this._rebinding) this._boundListeners.push(listener);
    else this._userListeners.push(listener);
    return listener;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const listener of this._boundListeners) listener.dispose();
    for (const listener of this._userListeners) listener.dispose();
    this._boundListeners.length = 0;
    this._userListeners.length = 0;
    this._attrCache.clear();
    this._textCache.clear();
  }

  private rebindInteractions(): void {
    for (const listener of this._boundListeners) listener.dispose();
    this._boundListeners.length = 0;
    this._rebinding = true;
    try {
      this.rootPanel.bindInteractions(this);
    } finally {
      this._rebinding = false;
    }
  }

  private buildSvgXml(): string {
    const defs: string[] = [];
    this.rootPanel.collectDefs(defs);
    const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';
    const w = fmtNum(this._width);
    const h = fmtNum(this._height);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defsBlock}${this.rootPanel.renderSvg()}</svg>`;
  }
}
