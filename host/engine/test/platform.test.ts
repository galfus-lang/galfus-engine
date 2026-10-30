import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport } from '@galfus/transport-types';
import { MultiverseRuntime } from '../src/runtime';

describe('@galfus/engine > PlatformCoordinator & WindowManager', () => {
  it('manages windows and auto-allocates WindowId without manual ID passing', () => {
    const calls: string[] = [];

    const mockEngine = {
      windowCreate: (config: any) => {
        calls.push(`create:${config.id}:${config.title}:${config.size?.[0]}x${config.size?.[1]}`);
        return config.id;
      },
      windowClose: (id: number) => calls.push(`close:${id}`),
      windowSetTitle: (id: number, title: string) => calls.push(`setTitle:${id}:${title}`),
      windowSetCursorGrab: (id: number, mode: number) => calls.push(`setGrab:${id}:${mode}`),
      windowSetCursorIcon: (id: number, icon: number) => calls.push(`setIcon:${id}:${icon}`),
      windowSetIcon: (id: number, _data: Uint8Array, len: number) =>
        calls.push(`setWindowIcon:${id}:${len}`),
      platformGetWindowSize: (id: number) => [1280, 720],
      multiverseUpdateWindowSize: (id: number, w: number, h: number) =>
        calls.push(`updateSize:${id}:${w}x${h}`),
      platformPumpEvents: () => [],
      platformGetCapabilities: () => ({ supportsMultipleWindows: true }),
      multiverseAttachWindow: () => {},
      multiverseCreateTarget: () => {},
      multiverseDestroyTarget: () => {},
      multiverseCreateInvocation: () => {},
      multiverseDestroyInvocation: () => {},
      multiverseDispatch: () => {},
      realm3dCreate: () => {},
      realm3dDestroy: () => {},
      realm2dCreate: () => {},
      realm2dDestroy: () => {}
    } as unknown as GalfusEngine;

    const mockTransport: GalfusTransport = {
      engine: mockEngine,
      isInitialized: true,
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

    // 1. Create window with auto ID
    const win1 = runtime.platform.window.create({
      title: 'Main Game',
      size: [1280, 720]
    });
    expect(win1).toBe(1 as any);
    expect(calls).toContain('create:1:Main Game:1280x720');

    // 2. Control window with semantic strings
    runtime.platform.window.setTitle(win1, 'Level 1: Space');
    expect(calls).toContain('setTitle:1:Level 1: Space');

    runtime.platform.window.setCursorGrab(win1, 'locked');
    expect(calls).toContain('setGrab:1:2');

    runtime.platform.window.setCursorIcon(win1, 'pointer');
    expect(calls).toContain('setIcon:1:1');

    runtime.platform.window.setCursorIcon(win1, 'crosshair');
    expect(calls).toContain('setIcon:1:4');

    const fakeIconBytes = new Uint8Array([0, 0, 1, 0, 1, 0]);
    runtime.platform.window.setIcon(win1, fakeIconBytes);
    expect(calls).toContain('setWindowIcon:1:6');

    const size = runtime.platform.window.getSize(win1);
    expect(size).toEqual([1280, 720]);

    runtime.platform.window.updateSize(win1, 1920, 1080);
    expect(calls).toContain('updateSize:1:1920x1080');

    // 3. Platform events & capabilities
    const caps = runtime.platform.getCapabilities();
    expect(caps?.supportsMultipleWindows).toBe(true);

    const events = runtime.platform.pumpEvents();
    expect(events).toEqual([]);

    // 4. Auto-allocated realms
    const realm3D = runtime.createRealm3D();
    expect(realm3D.realmId).toBe(1 as any);

    const realm2D = runtime.createRealm2D();
    expect(realm2D.realmId).toBe(2 as any);

    // 5. Semantic Geometry Creation
    const { geometryId, entityId } = realm3D.createGeometry({
      positions: new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint16Array([0, 1, 2])
    });
    expect(geometryId).toBeDefined();
    expect(entityId).toBeDefined();

    // 6. Close and dispose
    runtime.platform.window.close(win1);
    expect(calls).toContain('close:1');

    runtime.dispose();
  });
});
