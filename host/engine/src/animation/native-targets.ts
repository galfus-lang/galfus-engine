import type { AnimationTarget } from '@galfus/transport-types';

/** Tracks native targets whose host-side presentation data requires refreshing. */
export class NativeTargetTracker {
  private readonly transitions = new Map<number, AnimationTarget>();
  private readonly paths = new Map<number, AnimationTarget>();
  private observer?: (target: AnimationTarget) => void;
  setObserver(observer: (target: AnimationTarget) => void): void {
    this.observer = observer;
  }
  private set(map: Map<number, AnimationTarget>, id: number, target?: AnimationTarget): void {
    if (target && target.kind === 'camera3DLookAt') map.set(id, { ...target });
    else map.delete(id);
  }
  transition(id: number, target?: AnimationTarget): void {
    this.set(this.transitions, id, target);
  }
  path(id: number, target?: AnimationTarget): void {
    this.set(this.paths, id, target);
  }
  refresh(): void {
    if (!this.observer || (!this.transitions.size && !this.paths.size)) return;
    for (const target of this.transitions.values()) this.observer(target);
    for (const target of this.paths.values()) this.observer(target);
  }
  clear(): void {
    this.transitions.clear();
    this.paths.clear();
  }
}
