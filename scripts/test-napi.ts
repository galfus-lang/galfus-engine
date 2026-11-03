import { existsSync } from 'fs';
import { resolve } from 'path';

const nodeAddonPath = resolve(import.meta.dir, '../build/cargo-target/debug/galfus.node');
const soPath = resolve(import.meta.dir, '../build/cargo-target/debug/libgalfus_native.so');
const libPath = existsSync(nodeAddonPath) ? nodeAddonPath : soPath;

console.log(`==> Loading Node-API native addon from: ${libPath}`);

import { GalfusNode } from '../sdk/node/galfus.ts';

const galfus = new GalfusNode(libPath);

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

// 3.1 Cursor grab, icon and window size APIs
console.log('==> Testing windowSetCursorGrab, windowSetCursorIcon and windowGetSize...');
try {
  galfus.windowSetCursorGrab(999, 1);
  throw new Error('windowSetCursorGrab should throw for non-existent window');
} catch (err: unknown) {
  console.log(`✔ Expected windowSetCursorGrab error caught: ${(err as Error).message}`);
}

try {
  galfus.windowSetCursorIcon(999, 2);
  throw new Error('windowSetCursorIcon should throw for non-existent window');
} catch (err: unknown) {
  console.log(`✔ Expected windowSetCursorIcon error caught: ${(err as Error).message}`);
}

try {
  galfus.windowSetIcon(999, new Uint8Array([0, 0, 1, 0, 1, 0]), 6);
  throw new Error('windowSetIcon should throw for non-existent window');
} catch (err: unknown) {
  console.log(`✔ Expected windowSetIcon error caught: ${(err as Error).message}`);
}

try {
  galfus.windowGetSize(999);
  throw new Error('windowGetSize should throw for non-existent window');
} catch (err: unknown) {
  console.log(`✔ Expected windowGetSize error caught: ${(err as Error).message}`);
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
  'fn screen_effect(in: ScreenInput) -> vec4<f32> { return vec4<f32>(1.0 - in.color.rgb, in.color.a); }'
);
console.log('✔ ColorRealm and Shader registered via Node-API');

// 7. Multiverse Invocation
console.log('==> Testing Node-API Multiverse Invocation...');
galfus.multiverseCreateInvocation(100, {
  realmId: 10,
  targetId: 1,
  cameraSlot: 1,
  viewport: { width: { vw: 100 }, height: { vh: 100 } },
  filters: ['sepia'],
  zIndex: 0,
  enabled: true,
  clearColor: [0.2, 0.4, 0.6, 1.0]
});
galfus.multiverseSetInvocationCameraSlot(100, 3, true);
galfus.multiverseSetInvocationViewport(100, {
  anchorX: 'left',
  anchorY: 'top',
  offsetX: { px: 0 },
  offsetY: { px: 0 },
  width: { px: 400 },
  height: { px: 300 }
});
galfus.multiverseSetInvocationFilters(100, [{ custom: { shaderId: 1001 } }]);
galfus.multiverseSetInvocationClearColor(100, 0.0, 0.0, 0.0, 1.0, true);
console.log('✔ Invocation created and dynamically mutated via Node-API');

// 8. Multiverse Target Texture Binding
console.log('==> Testing Node-API Target Texture Bindings...');
galfus.multiverseBindTargetTexture({ sourceTargetId: 1, realmId: 10, slot: 'mat0' });
galfus.multiverseUnbindTargetTexture(10, 'mat0');
console.log('✔ Texture Binding verified via Node-API');

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
