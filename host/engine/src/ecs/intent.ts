/**
 * Intent store for atomic and deferred ECS state mutations.
 * Built on a strictly FIFO linked list with isolated error recovery and recursion bounds.
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

interface IntentNode {
  intent: Intent;
  next: IntentNode | null;
}

export class IntentStore {
  private _head: IntentNode | null = null;
  private _tail: IntentNode | null = null;
  private _size = 0;
  private _lastErrors: Error[] = [];

  /**
   * Enqueues an intention to attach a component to an entity on the next flush.
   */
  queueAttach(entityId: EntityId, component: Component): void {
    this._enqueue({ kind: 'attach', entityId, component });
  }

  /**
   * Enqueues an intention to detach a component from an entity on the next flush.
   */
  queueDetach(entityId: EntityId, componentType: string): void {
    this._enqueue({ kind: 'detach', entityId, componentType });
  }

  /**
   * Enqueues an intention to destroy an entity on the next flush.
   */
  queueDestroy(entityId: EntityId): void {
    this._enqueue({ kind: 'destroy', entityId });
  }

  /**
   * Enqueues a custom arbitrary atomic mutation callback.
   */
  queueCustom(action: () => void): void {
    this._enqueue({ kind: 'custom', action });
  }

  /**
   * Returns the count of pending queued intents.
   */
  get pendingCount(): number {
    return this._size;
  }

  /**
   * Returns errors captured during the last flush execution.
   */
  get lastErrors(): readonly Error[] {
    return this._lastErrors;
  }

  /**
   * Clears recorded execution errors.
   */
  clearErrors(): void {
    this._lastErrors = [];
  }

  /**
   * Flushes all queued intents strictly in FIFO order.
   * If intent executions trigger further intents, they are flushed up to `maxFlushDepth`.
   * Each intent is executed in an isolated try/catch so a failure does not break subsequent intents.
   *
   * @param flusher Target receiver executing the atomic state operations.
   * @param maxFlushDepth Maximum number of recursive flush cycles before aborting (default 100).
   * @returns Array of errors that occurred during this flush.
   */
  flush(flusher: IntentFlusher, maxFlushDepth = 100): readonly Error[] {
    this._lastErrors = [];
    let depth = 0;

    while (this._head !== null) {
      if (++depth > maxFlushDepth) {
        const overflow = new Error(
          `[IntentStore] Max flush depth (${maxFlushDepth}) exceeded; dropping pending intents to prevent infinite recursion.`
        );
        this._lastErrors.push(overflow);
        console.error(overflow.message);
        this.clear();
        break;
      }

      // Detach current chain for processing this cycle
      let current: IntentNode | null = this._head;
      this._head = null;
      this._tail = null;
      this._size = 0;

      while (current !== null) {
        const node = current;
        current = current.next;

        try {
          switch (node.intent.kind) {
            case 'attach':
              flusher.attachComponent(node.intent.entityId, node.intent.component);
              break;
            case 'detach':
              flusher.detachComponent(node.intent.entityId, node.intent.componentType);
              break;
            case 'destroy':
              flusher.destroyEntity(node.intent.entityId);
              break;
            case 'custom':
              node.intent.action();
              break;
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this._lastErrors.push(error);
          console.error('[IntentStore] Error executing intent:', error);
        }
      }
    }

    return this._lastErrors;
  }

  /**
   * Discards all pending queued intents without executing them.
   */
  clear(): void {
    this._head = null;
    this._tail = null;
    this._size = 0;
  }

  private _enqueue(intent: Intent): void {
    const node: IntentNode = { intent, next: null };
    if (this._tail === null) {
      this._head = node;
      this._tail = node;
    } else {
      this._tail.next = node;
      this._tail = node;
    }
    this._size++;
  }
}
