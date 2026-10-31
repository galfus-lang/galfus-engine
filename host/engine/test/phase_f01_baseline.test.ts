/**
 * Baseline Metrics & Contract Tests for Phase F01.
 * Measures current ABI call overhead in static and dynamic scenes before refactoring.
 */
import { describe, expect, it } from 'bun:test';
import type {
  GalfusEngine,
  GalfusTransport,
  Model3DDesc,
  Transform3D
} from '@galfus/transport-types';
import { MultiverseRuntime } from '../src/runtime';
import { AbiMetricsTracker, SpatialDirtyFlags } from '../src/spatial/index';

describe('Phase F01 — Baseline, Contratos e Métricas ABI', () => {
  it('SpatialDirtyFlags: bitmask transitions follow the two-stage lifecycle', () => {
    let flags = SpatialDirtyFlags.Clean;
    expect(flags).toBe(0);

    // 1. Gameplay / Animation mutates local pose
    flags |= SpatialDirtyFlags.LocalDirty;
    expect((flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(true);
    expect((flags & SpatialDirtyFlags.WorldDirty) !== 0).toBe(false);

    // 2. Anchor Solver processes localDirty -> worldDirty
    flags = (flags & ~SpatialDirtyFlags.LocalDirty) | SpatialDirtyFlags.WorldDirty;
    expect((flags & SpatialDirtyFlags.LocalDirty) !== 0).toBe(false);
    expect((flags & SpatialDirtyFlags.WorldDirty) !== 0).toBe(true);

    // 3. Realm Sync uploads worldMatrix -> clean
    flags &= ~SpatialDirtyFlags.WorldDirty;
    expect(flags).toBe(SpatialDirtyFlags.Clean);
  });

  it('AbiMetricsTracker: accurately categorizes and counts engine ABI calls', () => {
    const tracker = new AbiMetricsTracker();

    const mockRawEngine = {
      realm3dCreateModel: (_r: number, _m: number, _desc: Model3DDesc, _tf: Transform3D) => {},
      realm3dSetModelTransform: (_r: number, _m: number, _tf: Transform3D) => {},
      realm3dDestroyModel: (_r: number, _m: number) => {},
      multiverseDispatch: () => {},
      multiverseAttachWindow: () => {},
      multiverseCreateTarget: () => {},
      multiverseCreateInvocation: () => {},
      platformPumpEvents: () => []
    } as unknown as GalfusEngine;

    const engine = tracker.wrapEngine(mockRawEngine);

    // Simulate calls
    engine.realm3dCreateModel(1, 10, {} as Model3DDesc, {} as Transform3D);
    engine.realm3dSetModelTransform(1, 10, {} as Transform3D);
    engine.realm3dDestroyModel(1, 10);
    engine.multiverseDispatch(1, 0.016);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.total).toBe(4);
    expect(snapshot.byCategory.create).toBe(1);
    expect(snapshot.byCategory.updateTransform).toBe(1);
    expect(snapshot.byCategory.destroy).toBe(1);
    expect(snapshot.byCategory.dispatch).toBe(1);
  });

  it('Baseline Measurement: demonstrates that currently static scenes issue ABI calls every frame (HOST-025 / HOST-030 baseline)', () => {
    const tracker = new AbiMetricsTracker();

    const mockEngine = tracker.wrapEngine({
      realm3dCreate: () => {},
      realm3dCreateCube: () => {},
      realm3dCreateModel: () => {},
      realm3dSetModelTransform: () => {},
      realm3dDestroyModel: () => {},
      realm2dCreate: () => {},
      multiverseCreateTarget: () => {},
      multiverseCreateInvocation: () => {},
      multiverseAttachWindow: () => {},
      multiverseDispatch: () => {},
      platformPumpEvents: () => []
    } as unknown as GalfusEngine);

    const mockTransport: GalfusTransport = {
      engine: mockEngine,
      isInitialized: true,
      isDisposed: false,
      isRunning: false,
      init: async () => {},
      startLoop: () => {},
      stopLoop: () => {},
      step: () => {},
      dispose: () => {}
    };

    const runtime = new MultiverseRuntime(mockTransport);
    runtime.platform.bindEngine(mockEngine);
    runtime.multiverse.bindEngine(mockEngine);

    const realm3D = runtime.createRealm3D();

    // Create 10 static entities with models
    const MODEL_COUNT = 10;
    for (let i = 0; i < MODEL_COUNT; i++) {
      realm3D.createPrimitive({ kind: 'cube', size: 1 }, 1, {
        position: [i * 2, 0, 0]
      });
    }

    // Frame 1: Initial creation & sync (10 cubes + 10 models = 20 creates)
    tracker.reset();
    runtime.tick(0.016);
    const frame1Snapshot = tracker.getSnapshot();
    expect(frame1Snapshot.byCategory.create).toBe(MODEL_COUNT * 2);

    // Frame 2: Static scene (NOTHING moved)
    tracker.reset();
    runtime.tick(0.016);
    const frame2Snapshot = tracker.getSnapshot();

    // In the CURRENT implementation before F13 (HOST-030), line 208 of realm3d/sync.ts
    // calls realm3dSetModelTransform for every model on every frame unconditionally:
    expect(frame2Snapshot.byCategory.updateTransform).toBe(MODEL_COUNT);
    // This baseline explicitly documents that CURRENTLY static scenes waste 10 ABI calls/frame.
    // In Phase F13, with SpatialDirtyFlags and incremental sync, this will drop to ZERO!
  });
});
