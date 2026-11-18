export type PanelInteractionEvent =
  'hover' | 'leave' | 'press' | 'release' | 'click' | 'drag' | 'scroll';

export class PanelEventEmitter {
  private readonly _hoverListeners = new Set<() => void>();
  private readonly _leaveListeners = new Set<() => void>();
  private readonly _pressListeners = new Set<() => void>();
  private readonly _releaseListeners = new Set<() => void>();
  private readonly _clickListeners = new Set<() => void>();
  private readonly _dragListeners = new Set<(dx: number, dy: number) => void>();
  private readonly _scrollListeners = new Set<(dx: number, dy: number) => void>();

  on(event: 'hover' | 'leave' | 'press' | 'release' | 'click', cb: () => void): () => void;
  on(event: 'drag' | 'scroll', cb: (dx: number, dy: number) => void): () => void;
  on(event: PanelInteractionEvent, cb: any): () => void {
    const targetSet = this.getSet(event);
    targetSet.add(cb);
    return () => targetSet.delete(cb);
  }

  emit(event: 'hover' | 'leave' | 'press' | 'release' | 'click'): void;
  emit(event: 'drag' | 'scroll', dx: number, dy: number): void;
  emit(event: PanelInteractionEvent, a?: number, b?: number): void {
    const set = this.getSet(event);
    for (const listener of set) {
      if (a !== undefined && b !== undefined) {
        (listener as (x: number, y: number) => void)(a, b);
      } else {
        (listener as () => void)();
      }
    }
  }

  hasListeners(event?: PanelInteractionEvent): boolean {
    if (event !== undefined) return this.getSet(event).size > 0;
    return (
      this._hoverListeners.size > 0 ||
      this._leaveListeners.size > 0 ||
      this._pressListeners.size > 0 ||
      this._releaseListeners.size > 0 ||
      this._clickListeners.size > 0 ||
      this._dragListeners.size > 0 ||
      this._scrollListeners.size > 0
    );
  }

  private getSet(event: PanelInteractionEvent): Set<any> {
    switch (event) {
      case 'hover':
        return this._hoverListeners;
      case 'leave':
        return this._leaveListeners;
      case 'press':
        return this._pressListeners;
      case 'release':
        return this._releaseListeners;
      case 'click':
        return this._clickListeners;
      case 'drag':
        return this._dragListeners;
      case 'scroll':
        return this._scrollListeners;
    }
  }
}
