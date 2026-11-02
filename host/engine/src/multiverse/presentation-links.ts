import type { TargetTextureBinding } from '@galfus/transport-types';
import type { PresentationBinding, PresentationSurface } from './presentation-graph';

export interface PresentationLinksSnapshot {
  readonly revision: number;
  readonly bindings: readonly PresentationBinding[];
  readonly surfaces: readonly PresentationSurface[];
}

/** Host-owned links that are not represented by the render schedule. */
export class PresentationLinks {
  private readonly bindings = new Map<number, Map<string, PresentationBinding>>();
  private readonly byTarget = new Map<number, Set<PresentationBinding>>();
  private readonly surfaces = new Map<number, Map<string, Set<number>>>();
  private revision = 0;
  private cached?: PresentationLinksSnapshot;

  getBindings(): readonly PresentationBinding[] {
    return Array.from(this.bindings.values()).flatMap((slots) => [...slots.values()]);
  }
  getBindingsForTarget(targetId: number): readonly PresentationBinding[] {
    return [...(this.byTarget.get(targetId) ?? [])];
  }
  getBindingsForRealm(realmId: number): readonly PresentationBinding[] {
    return [...(this.bindings.get(realmId)?.values() ?? [])];
  }
  private changed(): void {
    this.revision++;
    this.cached = undefined;
  }
  bind(binding: TargetTextureBinding): void {
    if (
      this.bindings.get(binding.realmId)?.get(binding.slot)?.sourceTargetId ===
      binding.sourceTargetId
    )
      return;
    this.unbind(binding.realmId, binding.slot);
    let slots = this.bindings.get(binding.realmId);
    if (!slots) {
      slots = new Map();
      this.bindings.set(binding.realmId, slots);
    }
    const stored = Object.freeze({
      realmId: binding.realmId,
      slot: binding.slot,
      sourceTargetId: binding.sourceTargetId
    });
    slots.set(binding.slot, stored);
    let targetBindings = this.byTarget.get(binding.sourceTargetId);
    if (!targetBindings) {
      targetBindings = new Set();
      this.byTarget.set(binding.sourceTargetId, targetBindings);
    }
    targetBindings.add(stored);
    this.changed();
  }
  unbind(realmId: number, slot: string): void {
    const slots = this.bindings.get(realmId);
    const previous = slots?.get(slot);
    if (!slots || !previous) return;
    slots.delete(slot);
    const targetBindings = this.byTarget.get(previous.sourceTargetId);
    targetBindings?.delete(previous);
    if (!targetBindings?.size) this.byTarget.delete(previous.sourceTargetId);
    if (!slots.size) this.bindings.delete(realmId);
    const surfaces = this.surfaces.get(realmId);
    surfaces?.delete(slot);
    if (!surfaces?.size) this.surfaces.delete(realmId);
    this.changed();
  }
  /** Records a validated surface; callers remove it when its entity or material changes. */
  connectSurface(surface: PresentationSurface): void {
    if (!this.bindings.get(surface.realmId)?.has(surface.slot))
      throw new Error('Surface requires a registered target texture binding.');
    let slots = this.surfaces.get(surface.realmId);
    if (!slots) {
      slots = new Map();
      this.surfaces.set(surface.realmId, slots);
    }
    let entities = slots.get(surface.slot);
    if (!entities) {
      entities = new Set();
      slots.set(surface.slot, entities);
    }
    if (!entities.has(surface.entityId)) {
      entities.add(surface.entityId);
      this.changed();
    }
  }
  disconnectSurface(surface: PresentationSurface): void {
    const slots = this.surfaces.get(surface.realmId);
    const entities = slots?.get(surface.slot);
    if (!entities?.delete(surface.entityId)) return;
    if (!entities.size) slots!.delete(surface.slot);
    if (!slots!.size) this.surfaces.delete(surface.realmId);
    this.changed();
  }
  snapshot(): PresentationLinksSnapshot {
    if (this.cached) return this.cached;
    const surfaces: PresentationSurface[] = [];
    for (const [realmId, slots] of this.surfaces)
      for (const [slot, entities] of slots)
        for (const entityId of entities) surfaces.push(Object.freeze({ realmId, slot, entityId }));
    this.cached = Object.freeze({
      revision: this.revision,
      bindings: Object.freeze(this.getBindings()),
      surfaces: Object.freeze(surfaces)
    });
    return this.cached;
  }
  clear(): void {
    this.bindings.clear();
    this.byTarget.clear();
    this.surfaces.clear();
    this.changed();
  }
}
