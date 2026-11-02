import type {
  InteractiveCallback,
  InteractiveEvent,
  InteractiveEventType,
  InteractiveTarget
} from './types';

/** Event subscriptions for one registered interactive target. */
export class InteractiveListener {
  private readonly listeners = new Map<InteractiveEventType, Set<InteractiveCallback>>();
  private disposed = false;

  constructor(
    readonly realmId: number,
    readonly target: InteractiveTarget,
    private readonly remove: (listener: InteractiveListener) => void
  ) {}

  on(type: InteractiveEventType, callback: InteractiveCallback): () => void {
    if (this.disposed) throw new Error('Interactive listener is disposed.');
    let callbacks = this.listeners.get(type);
    if (!callbacks) this.listeners.set(type, (callbacks = new Set()));
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }

  off(type: InteractiveEventType, callback: InteractiveCallback): void {
    this.listeners.get(type)?.delete(callback);
  }

  /** @internal */
  emit(event: InteractiveEvent): void {
    if (this.disposed) return;
    const callbacks = this.listeners.get(event.type);
    if (!callbacks) return;
    for (const callback of callbacks) {
      callback(event);
      if (this.disposed) break;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.remove(this);
  }
}
