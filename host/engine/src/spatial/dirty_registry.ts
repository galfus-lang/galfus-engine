/**
 * DirtyRegistry manages mutations, dirty revision tracking, and transaction coalescence.
 * Prevents redundant ABI uploads and cancels create+destroy cycles within uncommitted frames.
 */

export type DirtyOp = 'create' | 'update' | 'destroy';

export interface DirtyRecord<T = unknown> {
  readonly scopeId: number;
  readonly objectKey: number | string;
  op: DirtyOp;
  currentRevision: number;
  uploadedRevision: number;
  payload?: T;
  /** Indicates that the object has never been successfully confirmed to core yet. */
  isNew: boolean;
}

export class DirtyRegistry<T = unknown> {
  private readonly _records = new Map<string, DirtyRecord<T>>();

  private _makeKey(scopeId: number, objectKey: number | string): string {
    return `${scopeId}:${objectKey}`;
  }

  /** Total number of tracked records in the registry. */
  get size(): number {
    return this._records.size;
  }

  /** Number of records currently needing upload to core. */
  get pendingCount(): number {
    let count = 0;
    for (const record of this._records.values()) {
      if (record.currentRevision > record.uploadedRevision) {
        count++;
      }
    }
    return count;
  }

  /**
   * Registers a new object creation in this scope.
   */
  recordCreate(scopeId: number, objectKey: number | string, payload?: T): DirtyRecord<T> {
    const key = this._makeKey(scopeId, objectKey);
    const existing = this._records.get(key);

    if (existing) {
      if (existing.op === 'destroy') {
        existing.op = existing.uploadedRevision > 0 ? 'update' : 'create';
      }
      existing.currentRevision++;
      if (payload !== undefined) {
        existing.payload = payload;
      }
      return existing;
    }

    const record: DirtyRecord<T> = {
      scopeId,
      objectKey,
      op: 'create',
      currentRevision: 1,
      uploadedRevision: 0,
      payload,
      isNew: true
    };
    this._records.set(key, record);
    return record;
  }

  /**
   * Records a mutation on an object, incrementing its revision.
   */
  recordMutation(scopeId: number, objectKey: number | string, payload?: T): DirtyRecord<T> {
    const key = this._makeKey(scopeId, objectKey);
    const existing = this._records.get(key);

    if (existing) {
      existing.currentRevision++;
      if (payload !== undefined) {
        existing.payload = payload;
      }
      return existing;
    }

    // Object was already known to core prior to tracking
    const record: DirtyRecord<T> = {
      scopeId,
      objectKey,
      op: 'update',
      currentRevision: 1,
      uploadedRevision: 0,
      payload,
      isNew: false
    };
    this._records.set(key, record);
    return record;
  }

  /**
   * Records an object destruction.
   * If the object was created and destroyed prior to any core upload,
   * it is completely coalesced and removed from the registry (0 ABI calls).
   *
   * @returns `true` if a core destroy call is pending; `false` if coalesced to zero.
   */
  recordDestroy(scopeId: number, objectKey: number | string): boolean {
    const key = this._makeKey(scopeId, objectKey);
    const existing = this._records.get(key);

    if (existing) {
      // Coalescence rule: created and destroyed before first upload
      if (existing.isNew && existing.uploadedRevision === 0) {
        this._records.delete(key);
        return false;
      }

      existing.op = 'destroy';
      existing.currentRevision++;
      existing.payload = undefined;
      return true;
    }

    // Object was previously uploaded and tracked by core
    const record: DirtyRecord<T> = {
      scopeId,
      objectKey,
      op: 'destroy',
      currentRevision: 1,
      uploadedRevision: 0,
      isNew: false
    };
    this._records.set(key, record);
    return true;
  }

  /**
   * Returns all records whose currentRevision > uploadedRevision.
   */
  getPendingDirty(): DirtyRecord<T>[] {
    const pending: DirtyRecord<T>[] = [];
    for (const record of this._records.values()) {
      if (record.currentRevision > record.uploadedRevision) {
        pending.push(record);
      }
    }
    return pending;
  }

  /**
   * Iterates through pending dirty records without allocating an intermediate array.
   */
  forEachPending(callback: (record: DirtyRecord<T>) => void): void {
    for (const record of this._records.values()) {
      if (record.currentRevision > record.uploadedRevision) {
        callback(record);
      }
    }
  }

  /**
   * Confirms successful synchronization of an object to the core.
   */
  confirmSync(scopeId: number, objectKey: number | string, revision?: number): void {
    const key = this._makeKey(scopeId, objectKey);
    const existing = this._records.get(key);
    if (!existing) return;

    if (existing.op === 'destroy') {
      this._records.delete(key);
      return;
    }

    existing.uploadedRevision = revision ?? existing.currentRevision;
    existing.isNew = false;
    if (existing.op === 'create') {
      existing.op = 'update';
    }
  }

  /**
   * Indicates sync failed for an object, retaining its dirty status for retry on the next frame.
   */
  failSync(_scopeId: number, _objectKey: number | string): void {
    // uploadedRevision is left unchanged so currentRevision > uploadedRevision persists
  }

  /**
   * Retrieves a record by scope and object key.
   */
  get(scopeId: number, objectKey: number | string): DirtyRecord<T> | undefined {
    return this._records.get(this._makeKey(scopeId, objectKey));
  }

  /**
   * Checks whether a record is tracked.
   */
  has(scopeId: number, objectKey: number | string): boolean {
    return this._records.has(this._makeKey(scopeId, objectKey));
  }

  /**
   * Deletes a record from the registry.
   */
  delete(scopeId: number, objectKey: number | string): boolean {
    return this._records.delete(this._makeKey(scopeId, objectKey));
  }

  /**
   * Clears all records.
   */
  clear(): void {
    this._records.clear();
  }
}
