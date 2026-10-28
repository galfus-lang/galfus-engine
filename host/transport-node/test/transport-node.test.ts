import { describe, expect, it } from 'bun:test';
import { createNodeTransport } from '../src/index';

describe('@galfus/transport-node', () => {
  it('should initialize headless and retrieve capabilities using the local compiled addon', () => {
    const transport = createNodeTransport();
    expect(transport.isInitialized).toBe(false);

    transport.init({ headless: true });
    expect(transport.isInitialized).toBe(true);

    const caps = transport.engine.platformGetCapabilities();
    expect(caps).toBeDefined();
    expect(caps.isHeadless).toBe(true);

    transport.dispose();
    expect(transport.isInitialized).toBe(false);
  });

  it('should execute Multiverse and Realm commands via Node-API addon', () => {
    const transport = createNodeTransport();
    transport.init({ headless: true });

    const engine = transport.engine;

    // 1. Create Target in Multiverse
    expect(() => {
      engine.multiverseCreateTarget(1, {
        kind: { type: 'texture', width: 640, height: 480 }
      });
    }).not.toThrow();

    // 2. Register a Color Realm
    expect(() => {
      engine.multiverseRegisterColorRealm(10, 0.2, 0.4, 0.8, 1.0);
    }).not.toThrow();

    // 3. Create Invocation linking Realm to Target
    expect(() => {
      engine.multiverseCreateInvocation(100, {
        realmId: 10,
        targetId: 1,
        viewport: {
          width: { px: 640 },
          height: { px: 480 }
        }
      });
    }).not.toThrow();

    // 4. Resolve Multiverse Schedule
    const schedule = engine.multiverseResolve();
    expect(schedule).toBeDefined();
    expect(Array.isArray(schedule.targetBlocks)).toBe(true);

    // 5. Dispatch Frame
    expect(() => {
      engine.multiverseDispatch(1, 0.016);
    }).not.toThrow();

    // 6. Cleanup
    engine.multiverseDestroyInvocation(100);
    engine.multiverseUnregisterRealm(10);
    engine.multiverseDestroyTarget(1);

    transport.dispose();
  });

  it('should execute 2D and 3D Realm bindings via Node-API addon', () => {
    const transport = createNodeTransport();
    transport.init({ headless: true });
    try {
      const engine = transport.engine;

      // 2D Realm: create realm, create camera, create light, destroy
      expect(() => {
        engine.realm2dCreate(20);
        engine.realm2dCreateCamera(
          20,
          201,
          { orthoScale: 1.0 },
          { position: [0, 0], rotation: 0, scale: [1, 1] }
        );
        engine.realm2dCreateLight(
          20,
          202,
          { color: [1, 1, 1], intensity: 1.0, range: 100 },
          { position: [10, 10], rotation: 0, scale: [1, 1] }
        );
        engine.realm2dDestroy(20);
      }).not.toThrow();

      // 3D Realm: create realm, create cube geometry, create camera, destroy
      expect(() => {
        engine.realm3dCreate(30);
        engine.realm3dCreateCube(30, 301, 2.0);
        engine.realm3dCreateCamera(
          30,
          302,
          { kind: 'perspective', fovY: 1.047, near: 0.1, far: 1000 },
          { position: [0, 5, -10], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
        );
        engine.realm3dDestroyGeometry(30, 301);
        engine.realm3dDestroy(30);
      }).not.toThrow();
    } finally {
      transport.dispose();
    }
  });

  it('should drive frames and manage 120 FPS loop lifecycle', async () => {
    const transport = createNodeTransport();
    transport.init({ headless: true });

    let framesReceived = 0;
    transport.startLoop(
      (timing) => {
        framesReceived++;
        expect(timing.frameId).toBeGreaterThan(0);
        expect(timing.timeMs).toBeGreaterThan(0);
      },
      { targetFps: 120 }
    );

    expect(transport.isRunning).toBe(true);

    // Wait for frames at 120 FPS (~25ms)
    await new Promise((resolve) => setTimeout(resolve, 35));

    transport.stopLoop();
    expect(transport.isRunning).toBe(false);
    expect(framesReceived).toBeGreaterThanOrEqual(1);

    transport.dispose();
  });
});
