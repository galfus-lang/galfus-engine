import { GalfusBun } from '../sdk/bun/galfus.ts';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../build/cargo-target/debug/libgalfus_native.so');

console.log(`==> Loading Galfus dynamic library via GalfusBun SDK from: ${libPath}`);
const galfus = new GalfusBun(libPath);

// 1. Initialize Headless Platform
console.log('==> Testing platformInitHeadless()...');
galfus.platformInitHeadless();
console.log('✔ Platform context initialized successfully');

// 2. Query Capabilities
console.log('==> Testing platformGetCapabilities()...');
const capabilities = galfus.platformGetCapabilities();
console.log('✔ Capabilities received:', capabilities);
if (capabilities.isHeadless !== true) {
  throw new Error(`Expected isHeadless: true, received: ${capabilities.isHeadless}`);
}

// 3. Pump Events
console.log('==> Testing platformPumpEvents()...');
const events = galfus.platformPumpEvents();
console.log(`✔ Pump events received: ${events.length} events`);

// 4. Multiverse: Create Targets
console.log('==> Testing Multiverse Targets...');
galfus.multiverseCreateTarget(1, {
  kind: { type: 'texture', width: 800, height: 600 }
});
galfus.multiverseCreateTarget(2, {
  kind: { type: 'texture', width: 800, height: 600 }
});
console.log('✔ Created Texture Targets (#1 and #2)');

// 5. Multiverse: Register ColorRealm & Custom Shader
console.log('==> Testing Multiverse Realm & Shader registration...');
galfus.multiverseRegisterColorRealm(10, 0.2, 0.7, 1.0, 1.0);
console.log('✔ Registered ColorRealm (#10)');

const dummyWgsl = `
fn screen_effect(in: ScreenInput) -> vec4<f32> {
    return vec4<f32>(1.0 - in.color.rgb, in.color.a);
}
`;
galfus.multiverseRegisterShader(1001, dummyWgsl);
console.log('✔ Registered custom ShaderEffect (#1001)');

// 6. Multiverse: Create Invocation with Sepia filter
console.log('==> Testing Multiverse Invocation creation...');
galfus.multiverseCreateInvocation(100, {
  realmId: 10,
  targetId: 1,
  cameraSlot: 1,
  viewport: { anchorX: 'left', width: { vw: 50 }, height: { vh: 100 } },
  filters: ['sepia'],
  zIndex: 0,
  enabled: true,
  clearColor: [0.1, 0.2, 0.3, 1.0]
});
console.log('✔ Created Invocation (#100) with Sepia filter');

// 7. Dynamic Invocation Mutations
console.log('==> Testing Invocation dynamic mutations...');
galfus.multiverseSetInvocationCameraSlot(100, 2, true);
galfus.multiverseSetInvocationViewport(100, {
  width: { vw: 100 },
  height: { vh: 100 }
});
console.log('==> Testing ShaderEffects custom shader registration...');
galfus.multiverseRegisterShader(
  1001,
  'fn screen_effect(in: ScreenInput) -> vec4<f32> { return vec4<f32>(1.0 - in.color.rgb, in.color.a); }'
);
galfus.multiverseSetInvocationFilters(100, [{ custom: { shaderId: 1001 } }]);
galfus.multiverseSetInvocationClearColor(100, 0.0, 0.0, 0.0, 1.0, true);
console.log('✔ Registered custom ShaderEffect snippet and applied to invocation filters');

// 8. Multiverse: Target Texture Binding & Unbinding
console.log('==> Testing Target Texture binding...');
galfus.multiverseBindTargetTexture({
  sourceTargetId: 1,
  realmId: 10,
  slot: 'albedo'
});
galfus.multiverseUnbindTargetTexture(10, 'albedo');
console.log('✔ Bound and unbound Target Texture slot');

// 9. Multiverse: Resolve Schedule & Dispatch Frame
console.log('==> Testing Multiverse Resolve & Dispatch...');
const schedule = galfus.multiverseResolve();
console.log('✔ Multiverse Schedule resolved (typed object):', JSON.stringify(schedule));
if (!schedule.targetBlocks || schedule.targetBlocks.length === 0) {
  throw new Error('Expected at least one target block in schedule');
}

galfus.multiverseDispatch(1, 0.016);
console.log('✔ Dispatched frame 1 with delta 0.016s');

// 10. Multiverse: Cleanup
console.log('==> Testing Multiverse entity destruction & cleanup...');
galfus.multiverseDestroyInvocation(100);
galfus.multiverseUnregisterRealm(10);
galfus.multiverseDestroyTarget(1);
galfus.multiverseDestroyTarget(2);
console.log('✔ Destroyed invocation, realm, and targets cleanly');

// 12. Shutdown Platform
console.log('==> Testing platformShutdown()...');
galfus.platformShutdown();
console.log('✔ Context shut down cleanly');

console.log('\n🎉 All Galfus Native C-ABI / Bun FFI validations passed successfully!');
