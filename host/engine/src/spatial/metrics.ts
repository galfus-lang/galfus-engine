/**
 * ABI Call Metrics Tracker for monitoring, diagnostics, and zero-ABI regression testing.
 * Intercepts GalfusEngine calls and categorizes them.
 */
import type { GalfusEngine } from '@galfus/transport-types';

export type AbiCallCategory =
  'create' | 'updateTransform' | 'updateDescriptor' | 'destroy' | 'query' | 'dispatch' | 'other';

export interface AbiMetricsSnapshot {
  readonly total: number;
  readonly byCategory: Record<AbiCallCategory, number>;
  readonly byMethod: Record<string, number>;
}

function categorizeMethod(name: string): AbiCallCategory {
  if (name.includes('Dispatch') || name.includes('PumpEvents')) {
    return 'dispatch';
  }
  if (
    name.startsWith('realm3dUpdateModelTransform') ||
    name.startsWith('realm2dUpdate') ||
    name.includes('Transform') ||
    name.includes('SetPosition') ||
    name.includes('SetRotation')
  ) {
    return 'updateTransform';
  }
  if (
    name.includes('Update') ||
    name.includes('Set') ||
    name.includes('Attribute') ||
    name.includes('Morph') ||
    name.includes('Bones')
  ) {
    return 'updateDescriptor';
  }
  if (
    name.includes('Create') ||
    name.includes('Load') ||
    name.includes('Register') ||
    name.includes('Attach')
  ) {
    return 'create';
  }
  if (
    name.includes('Destroy') ||
    name.includes('Close') ||
    name.includes('Unregister') ||
    name.includes('Unload') ||
    name.includes('Dispose') ||
    name.includes('Clear')
  ) {
    return 'destroy';
  }
  if (
    name.includes('Get') ||
    name.includes('Has') ||
    name.includes('Find') ||
    name.includes('Query')
  ) {
    return 'query';
  }
  return 'other';
}

export class AbiMetricsTracker {
  private _total = 0;
  private readonly _byCategory: Record<AbiCallCategory, number> = {
    create: 0,
    updateTransform: 0,
    updateDescriptor: 0,
    destroy: 0,
    query: 0,
    dispatch: 0,
    other: 0
  };
  private readonly _byMethod: Record<string, number> = {};

  recordCall(methodName: string): void {
    this._total++;
    const cat = categorizeMethod(methodName);
    this._byCategory[cat]++;
    this._byMethod[methodName] = (this._byMethod[methodName] ?? 0) + 1;
  }

  reset(): void {
    this._total = 0;
    for (const key of Object.keys(this._byCategory) as AbiCallCategory[]) {
      this._byCategory[key] = 0;
    }
    for (const key of Object.keys(this._byMethod)) {
      delete this._byMethod[key];
    }
  }

  getSnapshot(): AbiMetricsSnapshot {
    return {
      total: this._total,
      byCategory: { ...this._byCategory },
      byMethod: { ...this._byMethod }
    };
  }

  /**
   * Wraps a GalfusEngine instance with a proxy that tracks every method invocation.
   */
  wrapEngine(engine: GalfusEngine): GalfusEngine {
    const tracker = this;
    return new Proxy(engine, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver);
        if (typeof orig === 'function') {
          return function (...args: unknown[]) {
            tracker.recordCall(String(prop));
            return orig.apply(target, args);
          };
        }
        return orig;
      }
    });
  }
}
