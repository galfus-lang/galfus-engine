import type { MultiverseSchedule, TargetDesc } from '@galfus/transport-types';
import type { PresentationLinksSnapshot } from './presentation-links';

/** A confirmed surface that maps a consumer realm's texture slot to a source target. */
export interface PresentationSurface {
  readonly realmId: number;
  readonly slot: string;
  readonly entityId: number;
}
export interface PresentationBinding {
  readonly realmId: number;
  readonly slot: string;
  readonly sourceTargetId: number;
}
export interface PresentationConnection extends PresentationBinding {
  readonly entityId: number;
}
export interface PresentedInvocation {
  readonly invocationId: number;
  readonly realmId: number;
  readonly cameraSlot?: number;
  readonly resolvedViewport: readonly [number, number, number, number];
  readonly zIndex: number;
}
/** Immutable view of one dispatched schedule, rooted at an open window. */
export interface WindowPresentation {
  readonly windowId: number;
  readonly rootTargetIds: readonly number[];
  readonly targetIds: readonly number[];
  readonly invocationIds: readonly number[];
  readonly realmIds: readonly number[];
  readonly candidateBindings: readonly PresentationBinding[];
  readonly connections: readonly PresentationConnection[];
  /** Render dependency edges sampled from the previous frame to break cycles. */
  readonly softCutEdges: readonly (readonly [number, number])[];
  /** IDs are in render order, as resolved by the renderer. */
  getInvocations(targetId: number): readonly number[];
  getInvocation(invocationId: number): PresentedInvocation | undefined;
  getCandidates(realmId: number): readonly PresentationBinding[];
}
export interface PresentationGraphView {
  getWindow(windowId: number): WindowPresentation | undefined;
  getWindowIds(): readonly number[];
}
interface Snapshot {
  readonly signature: readonly (number | undefined)[];
  readonly linksRevision: number;
  readonly windowRevision: number;
  readonly windows: Map<number, WindowPresentation>;
}
const EMPTY: readonly never[] = Object.freeze([]);
function sorted(values: Iterable<number>): readonly number[] {
  return Object.freeze([...values].sort((a, b) => a - b));
}
function compareSlot(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Publishes only render schedules whose dispatch completed successfully. */
export class PresentationGraph {
  private readonly openWindows = new Set<number>();
  private windowRevision = 0;
  private published?: Snapshot;
  private pending?: Snapshot;
  private windowIds: readonly number[] = EMPTY;
  readonly view: PresentationGraphView = Object.freeze({
    getWindow: (id: number) =>
      this.openWindows.has(id) ? this.published?.windows.get(id) : undefined,
    getWindowIds: () => this.windowIds
  });

  windowOpened(windowId: number): void {
    if (!this.openWindows.has(windowId)) {
      this.openWindows.add(windowId);
      this.windowRevision++;
    }
  }
  windowClosed(windowId: number): void {
    if (!this.openWindows.delete(windowId)) return;
    this.windowRevision++;
    this.published?.windows.delete(windowId);
    this.pending?.windows.delete(windowId);
    this.refreshWindowIds();
  }
  private refreshWindowIds(): void {
    this.windowIds = sorted(this.published?.windows.keys() ?? []);
  }

  private matches(
    snapshot: Snapshot,
    schedule: MultiverseSchedule,
    targets: ReadonlyMap<number, TargetDesc>,
    linksRevision: number
  ): boolean {
    if (snapshot.linksRevision !== linksRevision || snapshot.windowRevision !== this.windowRevision)
      return false;
    const signature = snapshot.signature;
    let i = 0;
    const blocks = schedule.targetBlocks!;
    if (signature[i++] !== blocks.length) return false;
    for (const block of blocks) {
      const target = targets.get(block.targetId);
      const windowId = target?.kind.type === 'window' ? target.kind.windowId : undefined;
      if (
        signature[i++] !== block.targetId ||
        signature[i++] !== windowId ||
        signature[i++] !== block.invocations.length
      )
        return false;
      for (const inv of block.invocations) {
        if (
          signature[i++] !== inv.invocationId ||
          signature[i++] !== inv.realmId ||
          signature[i++] !== inv.cameraSlot ||
          signature[i++] !== inv.zIndex ||
          signature[i++] !== inv.resolvedViewport.length
        )
          return false;
        for (const value of inv.resolvedViewport) if (signature[i++] !== value) return false;
      }
    }
    const cuts = schedule.softCutEdges;
    if (signature[i++] !== (cuts?.length ?? 0)) return false;
    if (cuts)
      for (const edge of cuts) {
        if (signature[i++] !== edge[0] || signature[i++] !== edge[1]) return false;
      }
    return i === signature.length;
  }

  stage(
    schedule: MultiverseSchedule | undefined,
    targets: ReadonlyMap<number, TargetDesc>,
    links: PresentationLinksSnapshot
  ): void {
    this.pending = undefined;
    if (!schedule || !Array.isArray(schedule.targetBlocks)) return;
    if (this.published && this.matches(this.published, schedule, targets, links.revision)) {
      this.pending = this.published;
      return;
    }
    const roots: Array<[number, number]> = [];
    const signature: (number | undefined)[] = [schedule.targetBlocks.length];
    for (const block of schedule.targetBlocks) {
      const target = targets.get(block.targetId);
      signature.push(
        block.targetId,
        target?.kind.type === 'window' ? target.kind.windowId : undefined,
        block.invocations.length
      );
      for (const inv of block.invocations)
        signature.push(
          inv.invocationId,
          inv.realmId,
          inv.cameraSlot,
          inv.zIndex,
          inv.resolvedViewport.length,
          ...inv.resolvedViewport
        );
      if (target?.kind.type === 'window' && this.openWindows.has(target.kind.windowId))
        roots.push([target.kind.windowId, block.targetId]);
    }
    const cuts = schedule.softCutEdges ?? [];
    signature.push(cuts.length);
    for (const [source, target] of cuts) signature.push(source, target);
    const blocks = new Map(schedule.targetBlocks.map((block) => [block.targetId, block]));
    const bindingsByRealm = new Map<number, PresentationBinding[]>();
    for (const binding of links.bindings) {
      let entries = bindingsByRealm.get(binding.realmId);
      if (!entries) {
        entries = [];
        bindingsByRealm.set(binding.realmId, entries);
      }
      entries.push(binding);
    }
    const surfacesByRealm = new Map<number, Map<string, number[]>>();
    for (const surface of links.surfaces) {
      let slots = surfacesByRealm.get(surface.realmId);
      if (!slots) {
        slots = new Map();
        surfacesByRealm.set(surface.realmId, slots);
      }
      let entities = slots.get(surface.slot);
      if (!entities) {
        entities = [];
        slots.set(surface.slot, entities);
      }
      entities.push(surface.entityId);
    }
    const rootMap = new Map<number, number[]>();
    for (const [windowId, targetId] of roots) {
      let ids = rootMap.get(windowId);
      if (!ids) {
        ids = [];
        rootMap.set(windowId, ids);
      }
      ids.push(targetId);
    }
    const windows = new Map<number, WindowPresentation>();
    for (const [windowId, rootTargets] of rootMap) {
      const visitedTargets = new Set<number>();
      const realms = new Set<number>();
      const invocations = new Map<number, PresentedInvocation>();
      const byTarget = new Map<number, readonly number[]>();
      const byRealm = new Map<number, readonly PresentationBinding[]>();
      const candidates = new Set<PresentationBinding>();
      const connections: PresentationConnection[] = [];
      const pending = [...rootTargets];
      while (pending.length) {
        const targetId = pending.pop()!;
        if (visitedTargets.has(targetId)) continue;
        const block = blocks.get(targetId);
        if (!block) continue;
        visitedTargets.add(targetId);
        const ids: number[] = [];
        for (const inv of block.invocations) {
          ids.push(inv.invocationId);
          invocations.set(
            inv.invocationId,
            Object.freeze({
              invocationId: inv.invocationId,
              realmId: inv.realmId,
              cameraSlot: inv.cameraSlot,
              resolvedViewport: Object.freeze([...inv.resolvedViewport]) as readonly [
                number,
                number,
                number,
                number
              ],
              zIndex: inv.zIndex
            })
          );
          if (realms.has(inv.realmId)) continue;
          realms.add(inv.realmId);
          const bindings = [...(bindingsByRealm.get(inv.realmId) ?? [])].sort((a, b) =>
            compareSlot(a.slot, b.slot)
          );
          byRealm.set(inv.realmId, Object.freeze(bindings));
          for (const binding of bindings) {
            candidates.add(binding);
            for (const entityId of surfacesByRealm.get(inv.realmId)?.get(binding.slot) ?? []) {
              if (!blocks.has(binding.sourceTargetId)) continue;
              connections.push(Object.freeze({ ...binding, entityId }));
              pending.push(binding.sourceTargetId);
            }
          }
        }
        byTarget.set(targetId, Object.freeze(ids));
      }
      connections.sort(
        (a, b) => a.realmId - b.realmId || compareSlot(a.slot, b.slot) || a.entityId - b.entityId
      );
      const candidateList = [...candidates].sort(
        (a, b) => a.realmId - b.realmId || compareSlot(a.slot, b.slot)
      );
      const softCutEdges = Object.freeze(
        cuts
          .filter(([source, target]) => visitedTargets.has(source) && visitedTargets.has(target))
          .map(([source, target]) => Object.freeze([source, target] as const))
      );
      windows.set(
        windowId,
        Object.freeze({
          windowId,
          rootTargetIds: sorted(rootTargets),
          targetIds: sorted(visitedTargets),
          invocationIds: sorted(invocations.keys()),
          realmIds: sorted(realms),
          candidateBindings: Object.freeze(candidateList),
          connections: Object.freeze(connections),
          softCutEdges,
          getInvocations: (targetId: number) => byTarget.get(targetId) ?? EMPTY,
          getInvocation: (id: number) => invocations.get(id),
          getCandidates: (realmId: number) => byRealm.get(realmId) ?? EMPTY
        })
      );
    }
    this.pending = {
      signature,
      linksRevision: links.revision,
      windowRevision: this.windowRevision,
      windows
    };
  }
  commit(): void {
    if (this.published === this.pending) {
      this.pending = undefined;
      return;
    }
    this.published = this.pending;
    this.pending = undefined;
    this.refreshWindowIds();
  }
  discard(): void {
    this.pending = undefined;
  }
  clear(): void {
    this.published = undefined;
    this.pending = undefined;
    this.windowIds = EMPTY;
  }
  dispose(): void {
    this.clear();
    this.openWindows.clear();
  }
}
