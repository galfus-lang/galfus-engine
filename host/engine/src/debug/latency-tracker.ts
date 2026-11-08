import type { PlatformEvent } from '@galfus/transport-types';
import type { InteractiveTarget } from '../interaction/types';

interface HoverRecord {
  readonly frameId: number;
  readonly time: number;
  readonly inputFrameId: number;
}

interface StyleRecord {
  readonly elementId: string;
  readonly attr: string;
  readonly value: string;
  readonly styleFrameId: number;
  readonly styleTime: number;
  readonly hoverFrameId: number;
  readonly hoverTime: number;
}

/**
 * Diagnostic latency tracker active in debug mode (`GALFUS_DEBUG_LATENCY=1` or `DebugLatencyTracker.enable()`).
 * Measures the exact frame and millisecond distance from:
 * 1. Platform Input Event
 * 2. Hover / Interactive Hit Emission
 * 3. Style / Attribute / Model Mutation
 * 4. Multiverse Dispatch to GPU
 */
export class DebugLatencyTracker {
  static enabled =
    typeof process !== 'undefined' &&
    (process.env.GALFUS_DEBUG_LATENCY === '1' || process.env.GALFUS_DEBUG_INPUT === '1');

  static currentFrameId = 0;
  static lastInputFrameId = 0;
  static lastInputTime = 0;

  private static readonly hoverRecords = new Map<string, HoverRecord>();
  private static readonly pendingGpu = new Map<string, StyleRecord>();

  static enable(): void {
    this.enabled = true;
  }

  static disable(): void {
    this.enabled = false;
  }

  static clear(): void {
    this.hoverRecords.clear();
    this.pendingGpu.clear();
    this.lastInputFrameId = 0;
    this.lastInputTime = 0;
  }

  static getHoverRecord(key: string): HoverRecord | undefined {
    return this.hoverRecords.get(key);
  }

  static getPendingCount(): number {
    return this.pendingGpu.size;
  }

  static setFrameId(frameId: number): void {
    this.currentFrameId = frameId;
  }

  static recordInput(frameId: number, event: PlatformEvent): void {
    if (!this.enabled) return;
    this.lastInputFrameId = frameId;
    this.lastInputTime = performance.now();
    if (event.kind === 'pointer') {
      const pos = 'position' in event ? `(${event.position[0]}, ${event.position[1]})` : '';
      console.log(
        `[DEBUG-INPUT] frame=${frameId} type=pointer:${event.type} pos=${pos} time=${this.lastInputTime.toFixed(2)}ms`
      );
    }
  }

  static recordHover(frameId: number, target: InteractiveTarget): void {
    if (!this.enabled) return;
    const now = performance.now();
    const key = target.type === 'svg' ? target.elementId : `entity-${target.entityId}`;
    this.hoverRecords.set(key, {
      frameId,
      time: now,
      inputFrameId: this.lastInputFrameId
    });
    console.log(
      `[DEBUG-HOVER] frame=${frameId} target="${key}" | inputLag=${frameId - this.lastInputFrameId} frames`
    );
  }

  static recordStyleUpdate(
    frameId: number,
    svgId: number,
    elementId: string,
    attr: string,
    value: string
  ): void {
    if (!this.enabled) return;
    const now = performance.now();

    // Check direct element or base container name (e.g. "node-item-1-bg" matches "node-item-1")
    const cleanId = elementId.replace(/-bg$|-header$|-title$|-clip-rect$/, '');
    const hover = this.hoverRecords.get(elementId) ?? this.hoverRecords.get(cleanId);

    if (hover) {
      const deltaFrames = frameId - hover.frameId;
      const deltaMs = now - hover.time;
      const totalInputFrames = frameId - hover.inputFrameId;

      console.log(
        `🎯 [LATENCY HOVER -> STYLE] el="${elementId}" attr="${attr}=${value}"\n` +
          `   ├─ Distance: ${deltaFrames} frame(s), ${deltaMs.toFixed(2)}ms\n` +
          `   └─ Total since raw input: ${totalInputFrames} frame(s)`
      );

      this.pendingGpu.set(elementId, {
        elementId,
        attr,
        value,
        styleFrameId: frameId,
        styleTime: now,
        hoverFrameId: hover.frameId,
        hoverTime: hover.time
      });
    } else {
      console.log(
        `[DEBUG-STYLE] frame=${frameId} svg=${svgId} el="${elementId}" attr="${attr}=${value}" (no hover correlation)`
      );
    }
  }

  static recordModelUpdate(
    frameId: number,
    realmId: number,
    entityId: number,
    mutation: string
  ): void {
    if (!this.enabled) return;
    console.log(
      `[DEBUG-MODEL] frame=${frameId} realm=${realmId} entity=${entityId} mutation="${mutation}"`
    );
  }

  static recordDispatch(frameId: number): void {
    if (!this.enabled || this.pendingGpu.size === 0) return;
    const now = performance.now();
    for (const [key, item] of this.pendingGpu) {
      const styleToGpuFrames = frameId - item.styleFrameId;
      const styleToGpuMs = now - item.styleTime;
      const totalFrames = frameId - item.hoverFrameId;
      const totalMs = now - item.hoverTime;

      console.log(
        `🚀 [LATENCY HOVER -> GPU DISPATCH] el="${key}" attr="${item.attr}"\n` +
          `   ├─ Style -> GPU: ${styleToGpuFrames} frame(s), ${styleToGpuMs.toFixed(2)}ms\n` +
          `   └─ Total (Hover -> Render): ${totalFrames} frame(s), ${totalMs.toFixed(2)}ms`
      );
    }
    this.pendingGpu.clear();
  }
}
