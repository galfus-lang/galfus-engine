/**
 * Intent store for atomic and deferred ECS state mutations.
 */
import type { Component } from './component';
import type { EntityId } from './entity';

export type Intent =
  | { kind: 'attach'; entityId: EntityId; component: Component }
  | { kind: 'detach'; entityId: EntityId; componentType: string }
  | { kind: 'destroy'; entityId: EntityId }
  | { kind: 'custom'; action: () => void };

export interface IntentFlusher {
  attachComponent(entityId: EntityId, component: Component): void;
  detachComponent(entityId: EntityId, componentType: string): void;
  destroyEntity(entityId: EntityId): void;
}

export class IntentStore {
  private _queue: Intent[] = [];

  /**
   * Enqueues an intention to attach a component to an entity on the next flush.
   */
  queueAttach(entityId: EntityId, component: Component): void {
    this._queue.push({ kind: 'attach', entityId, component });
  }

  /**
   * Enqueues an intention to detach a component from an entity on the next flush.
   */
  queueDetach(entityId: EntityId, componentType: string): void {
    this._queue.push({ kind: 'detach', entityId, componentType });
  }

  /**
   * Enqueues an intention to destroy an entity on the next flush.
   */
  queueDestroy(entityId: EntityId): void {
    this._queue.push({ kind: 'destroy', entityId });
  }

  /**
   * Enqueues a custom arbitrary atomic mutation callback.
   */
  queueCustom(action: () => void): void {
    this._queue.push({ kind: 'custom', action });
  }

  /**
   * Returns the count of pending queued intents.
   */
  get pendingCount(): number {
    return this._queue.length;
  }

  /**
   * Flushes all queued intents in the order they were submitted.
   *
   * @param flusher Target receiver executing the atomic state operations.
   */
  flush(flusher: IntentFlusher): void {
    if (this._queue.length === 0) return;

    const current = this._queue;
    this._queue = [];

    for (const intent of current) {
      switch (intent.kind) {
        case 'attach':
          flusher.attachComponent(intent.entityId, intent.component);
          break;
        case 'detach':
          flusher.detachComponent(intent.entityId, intent.componentType);
          break;
        case 'destroy':
          flusher.destroyEntity(intent.entityId);
          break;
        case 'custom':
          try {
            intent.action();
          } catch (err) {
            console.error('[IntentStore] Error executing custom intent:', err);
          }
          break;
      }
    }
  }

  /**
   * Discards all pending queued intents without executing them.
   */
  clear(): void {
    this._queue = [];
  }
}
