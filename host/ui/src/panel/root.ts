import type {
  Collider2DComponent,
  InteractiveListener,
  MultiverseRuntime,
  Realm2D
} from '@galfus/engine';
import type { UiQuad2DDesc, UiText2DDesc } from '@galfus/transport-types';
import type { UiContentNode, UiContentOptions, UiHost } from './node';
import { nextUiId, Panel, type PanelOptions } from './panel';
import { ScrollPanel, type ScrollPanelOptions } from './scroll-panel';
import { SplitGroup, type SplitGroupOptions } from './split-group';
import { SpritePanel, type SpritePanelOptions } from './sprite-panel';
import { UiText, type UiTextOptions } from './ui-text';

export interface UiRootOptions extends PanelOptions {
  readonly width?: number;
  readonly height?: number;
  readonly position?: [number, number];
  readonly scale?: [number, number];
  readonly rotation?: number;
  readonly zLayer?: number;
  readonly drawOrder?: number;
}

/**
 * Root container owning a native `Model2DUI` in a `Realm2D`.
 * Coordinates layout and GPU compilation for nested `Panel`, `SpritePanel`, `ScrollPanel`, `SplitGroup`, and `UiText` nodes.
 */
export class UiRoot implements UiHost {
  readonly rootPanel: Panel;
  private _width: number;
  private _height: number;
  private _uiHandle: { readonly entityId: number; readonly uiId: number };
  private _colliderId: number | undefined;
  private _interactiveSubscription: InteractiveListener | undefined;
  private _pressedTargetId: string | undefined;
  private _hoveredTargetId: string | undefined;
  private _structureDirty = false;
  private _layoutDirty = false;
  private _batching = false;
  private _disposed = false;
  private readonly _userListeners = new Map<string, Set<(event?: any) => void>>();

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

    // Native Model2DUI
    const quads: UiQuad2DDesc[] = [];
    const texts: UiText2DDesc[] = [];
    this.rootPanel.compileUi(quads, texts);
    const scale = options.scale ?? [1, 1];
    this._uiHandle = realm.createUi(
      { quads, texts },
      {
        position: options.position ?? [0, 0],
        scale,
        rotation: options.rotation,
        zLayer: options.zLayer ?? 0,
        drawOrder: options.drawOrder ?? 0
      }
    );

    // Attach collider to make UiRoot interactive
    this._colliderId = realm.addCollider(this.entityId, {
      type: 'rectangle',
      halfExtents: [this._width * 0.5, this._height * 0.5]
    });

    this.rootPanel.attachHost(this);
    this.rootPanel.bindInteractions(this);

    this.setupInteractionRouting();
  }

  get uiId(): number {
    return this._uiHandle.uiId;
  }

  get entityId(): number {
    return this._uiHandle.entityId;
  }

  get interactiveListener(): InteractiveListener | undefined {
    return this._interactiveSubscription;
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

  addSpritePanel(options: SpritePanelOptions = {}): SpritePanel {
    return this.rootPanel.addSpritePanel(options);
  }

  addText(options: UiTextOptions = {}): UiText {
    return this.rootPanel.addText(options);
  }

  addContent(options: UiContentOptions = {}): UiContentNode {
    return this.rootPanel.addContent(options);
  }

  /** Batches multiple structural or layout mutations into a single Model2DUI synchronization pass. */
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

  /** Resizes the root UI viewport and recalculates the entire panel hierarchy. */
  resizeViewport(width: number, height: number): void {
    if (this._disposed) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (w === this._width && h === this._height) return;
    this._width = w;
    this._height = h;

    // Update collider extents
    if (this._colliderId !== undefined) {
      const collider = this.realm.world.getComponent<Collider2DComponent>(
        this.entityId,
        'Collider2D'
      );
      if (collider) {
        collider.set(this._colliderId, {
          type: 'rectangle',
          halfExtents: [w * 0.5, h * 0.5]
        });
      }
    }

    this.rootPanel.constraints.width = w;
    this.rootPanel.constraints.height = h;
    this._structureDirty = true;
    this.flush();
  }

  /** Synchronizes any pending structural or layout changes to the underlying `Model2DUI`. */
  flush(): void {
    if (this._disposed || this._batching) return;
    if (this._structureDirty || this._layoutDirty) {
      this._structureDirty = false;
      this._layoutDirty = false;
      this.rootPanel.applyRect({ x: 0, y: 0, width: this._width, height: this._height });

      const quads: UiQuad2DDesc[] = [];
      const texts: UiText2DDesc[] = [];
      this.rootPanel.compileUi(quads, texts);
      if (this._uiHandle) {
        this.realm.setUiContent(this._uiHandle, { quads, texts });
      }
    }
  }

  /** Compiles the UI hierarchy into native 2D UI quad and text runs. */
  compileUi(): { quads: UiQuad2DDesc[]; texts: UiText2DDesc[] } {
    const quads: UiQuad2DDesc[] = [];
    const texts: UiText2DDesc[] = [];
    this.rootPanel.compileUi(quads, texts);
    return { quads, texts };
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

  listen(elementId: string): InteractiveListener {
    return {
      realmId: this.realm.realmId,
      target: { type: 'collider', entityId: this.entityId } as any,
      on: (event: any, handler: any) => {
        let set = this._userListeners.get(`${elementId}:${event}`);
        if (!set) this._userListeners.set(`${elementId}:${event}`, (set = new Set()));
        set.add(handler);
        return () => void set?.delete(handler);
      },
      hasListeners: (event: any) => {
        const set = this._userListeners.get(`${elementId}:${event}`);
        return set !== undefined && set.size > 0;
      },
      emit: (event: any) => {
        const set = this._userListeners.get(`${elementId}:${event.type}`);
        if (set) {
          for (const fn of set) fn(event);
        }
      },
      dispose: () => {
        for (const key of [...this._userListeners.keys()]) {
          if (key.startsWith(`${elementId}:`)) this._userListeners.delete(key);
        }
      }
    } as unknown as InteractiveListener;
  }

  hasListeners(key: string): boolean {
    const set = this._userListeners.get(key);
    return set !== undefined && set.size > 0;
  }

  private setupInteractionRouting(): void {
    const listener = this.runtime.interactive(this.realm.realmId, {
      type: 'collider',
      entityId: this.entityId
    });
    this._interactiveSubscription = listener;

    const toUiCoords = (ev: {
      pointer: { position: readonly [number, number] };
      uv?: readonly [number, number];
    }): [number, number] => {
      if (ev.uv && Array.isArray(ev.uv) && ev.uv.length >= 2) {
        return [ev.uv[0] * this._width, (1.0 - ev.uv[1]) * this._height];
      }
      const lx = ev.pointer.position[0];
      const ly = ev.pointer.position[1];
      const uiX = lx + this._width * 0.5;
      const uiY = this._height * 0.5 - ly;
      return [uiX, uiY];
    };

    const makePointerEvent = (ev: any, uiX: number, uiY: number) => ({
      ...ev.pointer,
      position: [uiX, uiY] as [number, number]
    });

    listener.on('down', (ev: any) => {
      const [uiX, uiY] = toUiCoords(ev);
      const hit = this.rootPanel.hitTest(uiX, uiY);
      if (hit) {
        this._pressedTargetId = hit.id;
        this.emitToTargetAndAncestors(hit.id, 'down', {
          ...ev,
          pointer: makePointerEvent(ev, uiX, uiY)
        });
      }
    });

    listener.on('pressmove', (ev: any) => {
      const [uiX, uiY] = toUiCoords(ev);
      if (this._pressedTargetId) {
        this.emitToTargetAndAncestors(this._pressedTargetId, 'pressmove', {
          ...ev,
          pointer: makePointerEvent(ev, uiX, uiY)
        });
      }
    });

    listener.on('pressup', (ev: any) => {
      const [uiX, uiY] = toUiCoords(ev);
      const targetId = this._pressedTargetId;
      this._pressedTargetId = undefined;
      if (targetId) {
        const pEv = { ...ev, pointer: makePointerEvent(ev, uiX, uiY) };
        this.emitToTargetAndAncestors(targetId, 'pressup', pEv);
        this.emitToTargetAndAncestors(targetId, 'up', pEv);
      }
    });

    listener.on('cancel', (ev: any) => {
      const targetId = this._pressedTargetId;
      this._pressedTargetId = undefined;
      if (targetId) {
        this.emitToTargetAndAncestors(targetId, 'cancel', ev);
      }
    });

    listener.on('hover', (ev: any) => {
      const [uiX, uiY] = toUiCoords(ev);
      this.updateHover(uiX, uiY, ev);
    });

    listener.on('move', (ev: any) => {
      const [uiX, uiY] = toUiCoords(ev);
      this.updateHover(uiX, uiY, ev);
      if (this._hoveredTargetId) {
        this.emitToTargetAndAncestors(this._hoveredTargetId, 'move', {
          ...ev,
          pointer: makePointerEvent(ev, uiX, uiY)
        });
      }
    });

    listener.on('leave', (ev: any) => {
      if (this._hoveredTargetId) {
        this.emitToTargetAndAncestors(this._hoveredTargetId, 'leave', ev);
        this._hoveredTargetId = undefined;
      }
    });

    listener.on('scroll', (ev: any) => {
      const [uiX, uiY] = toUiCoords(ev);
      const hit = this.rootPanel.hitTestScroll(uiX, uiY);
      if (hit) {
        const pEv = { ...ev, pointer: makePointerEvent(ev, uiX, uiY) };
        this.emitScrollToTargetAndAncestors(hit.id, pEv);
      }
    });
  }

  private updateHover(uiX: number, uiY: number, ev: any): void {
    if (this._pressedTargetId) return;
    const hit = this.rootPanel.hitTest(uiX, uiY);
    const newHover = hit?.id;
    if (newHover !== this._hoveredTargetId) {
      if (this._hoveredTargetId) {
        this.emitToTargetAndAncestors(this._hoveredTargetId, 'leave', ev);
      }
      this._hoveredTargetId = newHover;
      if (newHover) {
        this.emitToTargetAndAncestors(newHover, 'hover', {
          ...ev,
          pointer: { ...ev.pointer, position: [uiX, uiY] }
        });
      }
    }
  }

  emitToUserListener(elementId: string, eventType: string, eventData: any): void {
    const set = this._userListeners.get(`${elementId}:${eventType}`);
    if (set) {
      for (const fn of set) {
        try {
          fn(eventData);
        } catch (err) {
          console.error(`Error in UI listener for ${elementId}:${eventType}:`, err);
        }
      }
    }
  }

  /**
   * Dispatches an event to the target element and bubbles it up through parent ancestors.
   */
  emitToTargetAndAncestors(targetId: string, eventType: string, eventData: any): void {
    let current = this.rootPanel.findNode(targetId);
    let currId: string | undefined = targetId;

    while (currId) {
      this.emitToUserListener(currId, eventType, eventData);
      current = current?.parent;
      currId = current?.id;
    }
  }

  /**
   * Dispatches a scroll event to the target element and ancestors, triggering both direct
   * and `-wheel` subscriber patterns.
   */
  emitScrollToTargetAndAncestors(targetId: string, eventData: any): void {
    let current = this.rootPanel.findNode(targetId);
    let currId: string | undefined = targetId;

    while (currId) {
      this.emitToUserListener(currId, 'scroll', eventData);
      this.emitToUserListener(`${currId}-wheel`, 'scroll', eventData);
      current = current?.parent;
      currId = current?.id;
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._interactiveSubscription?.dispose();
    this._userListeners.clear();
    this.realm.destroyUi(this._uiHandle);
  }
}
