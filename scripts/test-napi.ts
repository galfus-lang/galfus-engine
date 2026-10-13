import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../build/cargo-target/debug/libgalfus_native.so');

console.log(`==> Loading Node-API native addon from: ${libPath}`);

// Load the native Node-API addon via process.dlopen
interface GalfusNativeAddon {
  platformInit(): void;
  platformInitHeadless(): void;
  platformShutdown(): void;
  platformGetCapabilities(): {
    supportsMultipleWindows: boolean;
    supportsWindowPositioning: boolean;
    supportsCursorGrab: boolean;
    supportsGamepad: boolean;
    supportsAudio: boolean;
    isHeadless: boolean;
  };
  windowCreate(config: {
    id: number;
    title: string;
    size?: [number, number];
    resizable?: boolean;
    decorations?: boolean;
    transparent?: boolean;
  }): number;
  windowClose(windowId: number): void;
  windowSetTitle(windowId: number, title: string): void;
  windowSetCursorGrab(windowId: number, mode: number): void;
  windowSetCursorIcon(windowId: number, icon: number): void;
  platformPumpEvents(): Array<unknown>;

  // Multiverse Node-API methods
  multiverseCreateTarget(targetId: number, desc: unknown): void;
  multiverseDestroyTarget(targetId: number): void;
  multiverseRegisterColorRealm(realmId: number, r: number, g: number, b: number, a: number): void;
  multiverseUnregisterRealm(realmId: number): void;
  multiverseRegisterShader(shaderId: number, source: string): void;
  multiverseCreateInvocation(invocationId: number, desc: unknown): void;
  multiverseDestroyInvocation(invocationId: number): void;
  multiverseSetInvocationEnabled(invocationId: number, enabled: boolean): void;
  multiverseSetInvocationViewport(invocationId: number, viewport: unknown): void;
  multiverseSetInvocationFilters(invocationId: number, filters: unknown): void;
  multiverseSetInvocationClearColor(
    invocationId: number,
    r: number,
    g: number,
    b: number,
    a: number,
    hasClear: boolean
  ): void;
  multiverseSetInvocationCameraSlot(
    invocationId: number,
    cameraSlot: number,
    hasSlot: boolean
  ): void;
  multiverseUpdateWindowSize(windowId: number, width: number, height: number): void;
  multiverseCreateConnector(connectorId: number, desc: unknown): void;
  multiverseDestroyConnector(connectorId: number): void;
  multiverseSetConnectorEnabled(connectorId: number, enabled: boolean): void;
  multiverseBindTargetTexture(binding: unknown): void;
  multiverseUnbindTargetTexture(realmId: number, slot: string): void;
  multiverseResolve(): { targetBlocks: Array<unknown> };
  multiverseDispatch(frameId: number, deltaTime: number): void;
}

const addonModule: { exports: Partial<GalfusNativeAddon> } = { exports: {} };
process.dlopen(addonModule, libPath);
const galfus = addonModule.exports as GalfusNativeAddon;

console.log('==> Exported Node-API symbols count:', Object.keys(galfus).length);

// 1. Initialize headless platform
console.log('==> Testing platformInitHeadless()...');
galfus.platformInitHeadless();
console.log('✔ Platform initialized via Node-API');

// 2. Capabilities as direct JavaScript object
console.log('==> Testing platformGetCapabilities()...');
const caps = galfus.platformGetCapabilities();
console.log('✔ Capabilities received as direct JS Object:', caps);

if (typeof caps !== 'object' || caps === null) {
  throw new Error('Expected capabilities to be a direct JavaScript object');
}
if (caps.isHeadless !== true) {
  throw new Error(`Expected caps.isHeadless === true, got: ${caps.isHeadless}`);
}
if (typeof caps.supportsMultipleWindows !== 'boolean') {
  throw new Error('Expected caps.supportsMultipleWindows to be a boolean');
}

// 3. Window creation with a native JS Object (must reject in headless mode)
console.log('==> Testing windowCreate() with direct JS Object...');
try {
  galfus.windowCreate({
    id: 1,
    title: 'Test Native Window',
    size: [800, 600],
    resizable: true
  });
  throw new Error('windowCreate should have thrown an error in headless mode');
} catch (err: unknown) {
  const message = (err as Error).message;
  console.log(`✔ Native error caught from Rust: "${message}"`);
  if (!message.includes('headless mode')) {
    throw new Error(`Unexpected error message: ${message}`);
  }
}

// 4. Pump events as direct JavaScript Array
console.log('==> Testing platformPumpEvents()...');
const events = galfus.platformPumpEvents();
if (!Array.isArray(events)) {
  throw new Error('Expected platformPumpEvents() to return an Array');
}
console.log(`✔ Pump events returned native Array with length: ${events.length}`);

// 5. Multiverse Targets
console.log('==> Testing Node-API Multiverse Targets...');
galfus.multiverseCreateTarget(1, { kind: { type: 'texture', width: 800, height: 600 } });
galfus.multiverseCreateTarget(2, { kind: { type: 'texture', width: 800, height: 600 } });
console.log('✔ Targets created via Node-API');

// 6. Multiverse Color Realm & Custom Shader
console.log('==> Testing Node-API Multiverse Realm & Shader registration...');
galfus.multiverseRegisterColorRealm(10, 0.5, 0.5, 0.5, 1.0);
galfus.multiverseRegisterShader(
  1001,
  '@vertex fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); } @fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }'
);
console.log('✔ ColorRealm and Shader registered via Node-API');

// 7. Multiverse Invocation
console.log('==> Testing Node-API Multiverse Invocation...');
galfus.multiverseCreateInvocation(100, {
  realmId: 10,
  targetId: 1,
  cameraSlot: 1,
  viewport: { unit: 'normalized', x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
  filters: ['sepia'],
  zIndex: 0,
  enabled: true,
  clearColor: [0.2, 0.4, 0.6, 1.0]
});
galfus.multiverseSetInvocationCameraSlot(100, 3, true);
galfus.multiverseSetInvocationViewport(100, {
  unit: 'pixels',
  x: 0,
  y: 0,
  width: 400,
  height: 300
});
galfus.multiverseSetInvocationFilters(100, [{ custom: { shaderId: 1001 } }]);
galfus.multiverseSetInvocationClearColor(100, 0.0, 0.0, 0.0, 1.0, true);
console.log('✔ Invocation created and dynamically mutated via Node-API');

// 8. Multiverse Connector & Target Texture Binding
console.log('==> Testing Node-API Multiverse Connector & Bindings...');
galfus.multiverseCreateConnector(200, {
  sourceTargetId: 1,
  destinationTargetId: 2,
  effect: 'blit',
  zIndex: 0,
  enabled: true
});
galfus.multiverseSetConnectorEnabled(200, false);
galfus.multiverseBindTargetTexture({ sourceTargetId: 1, realmId: 10, slot: 'mat0' });
galfus.multiverseUnbindTargetTexture(10, 'mat0');
console.log('✔ Connector and Texture Binding verified via Node-API');

// 9. Multiverse Resolve & Dispatch
console.log('==> Testing Node-API Multiverse Resolve & Dispatch...');
const schedule = galfus.multiverseResolve();
console.log('✔ Schedule resolved via Node-API:', JSON.stringify(schedule));
if (!schedule || !Array.isArray(schedule.targetBlocks) || schedule.targetBlocks.length === 0) {
  throw new Error('Expected targetBlocks in schedule');
}

galfus.multiverseDispatch(1, 0.016);
console.log('✔ Dispatched frame via Node-API');

// 10. Multiverse Cleanup
galfus.multiverseDestroyConnector(200);
galfus.multiverseDestroyInvocation(100);
galfus.multiverseUnregisterRealm(10);
galfus.multiverseDestroyTarget(1);
galfus.multiverseDestroyTarget(2);
console.log('✔ Multiverse resources cleaned up');

// 11. Shutdown
console.log('==> Testing platformShutdown()...');
galfus.platformShutdown();
console.log('✔ Platform cleanly shut down via Node-API');

console.log('\n🎉 All Galfus Node-API validations passed successfully!');
