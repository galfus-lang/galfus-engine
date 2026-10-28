/**
 * Entity management and ID allocation with policy enforcement.
 */
import { assertValidLogicalId } from '@galfus/transport-types';

export type EntityId = number;

export class EntityManager {
  private _nextId = 1;
  private readonly _alive = new Set<EntityId>();
  private readonly _freeList: EntityId[] = [];

  /**
   * Allocates a new unique EntityId, reusing recycled IDs before incrementing,
   * and asserting validity against the core reserved range.
   */
  create(): EntityId {
    let id: EntityId;
    if (this._freeList.length > 0) {
      id = this._freeList.pop()!;
    } else {
      id = this._nextId++;
      assertValidLogicalId(id, 'EntityId');
    }

    this._alive.add(id);
    return id;
  }

  /**
   * Destroys an entity, marking its ID as free for recycling.
   *
   * @param id The EntityId to destroy.
   * @returns True if the entity was alive and destroyed, false otherwise.
   */
  destroy(id: EntityId): boolean {
    if (!this._alive.has(id)) {
      return false;
    }
    this._alive.delete(id);
    this._freeList.push(id);
    return true;
  }

  /**
   * Checks whether the specified EntityId is currently alive.
   */
  isAlive(id: EntityId): boolean {
    return this._alive.has(id);
  }

  /**
   * Returns the count of currently alive entities.
   */
  aliveCount(): number {
    return this._alive.size;
  }

  /**
   * Returns an array of all currently active entity IDs.
   */
  getActiveEntities(): EntityId[] {
    return Array.from(this._alive);
  }

  /**
   * Clears all entities and resets the allocation sequence.
   */
  clear(): void {
    this._alive.clear();
    this._freeList.length = 0;
    this._nextId = 1;
  }
}
