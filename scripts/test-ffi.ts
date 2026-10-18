import { GalfusBun, ViewportRect } from '../sdk/bun/galfus.ts';
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

// 4. Multiverse: Create Targets & Query Target Size
console.log('==> Testing Multiverse Targets...');
galfus.multiverseCreateTarget(1, {
  kind: { type: 'texture', width: 800, height: 600 }
});
galfus.multiverseCreateTarget(2, {
  kind: { type: 'texture', width: 800, height: 600 }
});
console.log('✔ Created Texture Targets (#1 and #2)');

console.log('==> Testing multiverseGetTargetSize()...');
const targetSize = galfus.multiverseGetTargetSize(1);
console.log(`✔ Target #1 size: ${targetSize[0]}x${targetSize[1]}`);
if (targetSize[0] !== 800 || targetSize[1] !== 600) {
  throw new Error(`Expected [800, 600], received: ${JSON.stringify(targetSize)}`);
}

// 5. ViewportRect Responsive Helpers
console.log('==> Testing ViewportRect factory helpers...');
const fullVp = ViewportRect.full();
const pxVp = ViewportRect.px(10, 20, 400, 300);
const pipVp = ViewportRect.pip('right', 'bottom', 30, 25, 15);
if (
  ('vw' in fullVp.width && fullVp.width.vw !== 100) ||
  ('px' in pxVp.width && pxVp.width.px !== 400) ||
  pipVp.anchorX !== 'right'
) {
  throw new Error('ViewportRect helper factory mismatch');
}
console.log('✔ ViewportRect helpers verified');

// 6. Realm 3D: Fast-path transforms, Getters & World AABB
console.log('==> Testing Realm 3D fast-path transforms, getters, and AABB...');
galfus.realm3dCreate(20);
galfus.realm3dCreateCamera(
  20,
  1,
  { fovY: 60, near: 0.1, far: 1000 },
  { position: [0, 5, -10], rotation: [0, 0, 0, 1] }
);
const cam3dTf = galfus.realm3dGetCameraTransform(20, 1);
if (
  Math.abs(cam3dTf[0]! - 0) > 0.001 ||
  Math.abs(cam3dTf[1]! - 5) > 0.001 ||
  Math.abs(cam3dTf[2]! - -10) > 0.001
) {
  throw new Error(`Realm3D Camera transform readback failed: ${cam3dTf}`);
}

// Set Camera Transform via Float32Array direct buffer
galfus.realm3dSetCameraTransform(20, 1, new Float32Array([1.5, 2.5, 3.5, 0, 0, 0, 1, 1, 1, 1]));
const cam3dTfUpdated = galfus.realm3dGetCameraTransform(20, 1);
if (Math.abs(cam3dTfUpdated[0]! - 1.5) > 0.001 || Math.abs(cam3dTfUpdated[1]! - 2.5) > 0.001) {
  throw new Error(`Realm3D Camera raw array transform failed: ${cam3dTfUpdated}`);
}

// Create Cube Geometry (size: 2.0 -> half-extent 1.0 -> min: [-1, -1, -1], max: [1, 1, 1])
galfus.realm3dCreateGeometry(20, 1, { primitive: 'cube', size: 2.0 });
galfus.realm3dCreateMaterial(20, 1, { baseColor: [1, 0, 0, 1], albedoTextureId: 2 });
// Create Model at position [10, 20, 30] scaled by [2, 2, 2]
galfus.realm3dCreateModel(
  20,
  1,
  { geometryId: 1, materialId: 1 },
  { position: [10, 20, 30], scale: [2, 2, 2] }
);
const modelTf = galfus.realm3dGetModelTransform(20, 1);
if (Math.abs(modelTf[0]! - 10) > 0.001 || Math.abs(modelTf[7]! - 2) > 0.001) {
  throw new Error(`Realm3D Model transform readback failed: ${modelTf}`);
}

// Query AABB (local [-1,1] * 2 = [-2, 2] + [10, 20, 30] = min [8, 18, 28], max [12, 22, 32])
const aabb = galfus.realm3dGetModelAabb(20, 1);
console.log('✔ Model #1 world AABB:', aabb);
if (Math.abs(aabb.min[0] - 8) > 0.01 || Math.abs(aabb.max[0] - 12) > 0.01) {
  throw new Error(`Realm3D Model AABB query failed: ${JSON.stringify(aabb)}`);
}

// Multiverse resolve check: material references Target #2 without explicit binding
console.log('==> Testing Multiverse warning for unbound target texture...');
galfus.multiverseResolve();
console.log('✔ Multiverse resolve executed with binding validation');

// Update Model Transform via number[] raw fast-path
galfus.realm3dSetModelTransform(20, 1, [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
const modelTf2 = galfus.realm3dGetModelTransform(20, 1);
if (Math.abs(modelTf2[0]!) > 0.001 || Math.abs(modelTf2[7]! - 1) > 0.001) {
  throw new Error(`Realm3D Model raw array update failed: ${modelTf2}`);
}

// 7. Realm 2D: Fast-path transforms & Getters
console.log('==> Testing Realm 2D fast-path transforms and getters...');
galfus.realm2dCreate(30);
galfus.realm2dCreateCamera(30, 1, { orthoScale: 1.0 }, { position: [50, 100], rotation: 0.25 });
const cam2dTf = galfus.realm2dGetCameraTransform(30, 1);
if (Math.abs(cam2dTf[0]! - 50) > 0.01 || Math.abs(cam2dTf[1]! - 100) > 0.01) {
  throw new Error(`Realm2D Camera transform readback failed: ${cam2dTf}`);
}
// Update 2D camera transform raw
galfus.realm2dSetCameraTransform(30, 1, new Float32Array([200, 300, 0, 2, 2, 0]));
const cam2dTf2 = galfus.realm2dGetCameraTransform(30, 1);
if (Math.abs(cam2dTf2[0]! - 200) > 0.01 || Math.abs(cam2dTf2[1]! - 300) > 0.01) {
  throw new Error(`Realm2D Camera raw update failed: ${cam2dTf2}`);
}

// Create Sprite
galfus.realm2dCreateMaterial(30, 1, { baseColor: [0, 1, 0, 1] });
galfus.realm2dCreateSprite(
  30,
  1,
  { dimensions: [64, 64], materialId: 1 },
  { position: [40, 80], rotation: 0, scale: [1, 1], zLayer: 3 }
);
const spriteTf = galfus.realm2dGetSpriteTransform(30, 1);
if (Math.abs(spriteTf[0]! - 40) > 0.01 || Math.abs(spriteTf[5]! - 3) > 0.01) {
  throw new Error(`Realm2D Sprite transform readback failed: ${spriteTf}`);
}
// Update Sprite transform raw
galfus.realm2dSetSpriteTransform(30, 1, [150, 250, 1.0, 2, 2, 10]);
const spriteTf2 = galfus.realm2dGetSpriteTransform(30, 1);
if (Math.abs(spriteTf2[0]! - 150) > 0.01 || Math.abs(spriteTf2[5]! - 10) > 0.01) {
  throw new Error(`Realm2D Sprite raw update failed: ${spriteTf2}`);
}

// Create SVG entity
console.log('==> Testing Realm 2D SVG vector entity & dynamic mutations...');
const sampleSvg = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <circle id="idle" r="20" fill="blue"/>
    <circle id="hover" r="20" fill="green"/>
  </defs>
  <rect id="bg" width="100" height="100" fill="red"/>
  <use id="icon" href="#idle"/>
  <text id="label" x="10" y="50" font-size="14" fill="white">Hello</text>
</svg>`;

galfus.realm2dCreateSvg(
  30,
  10,
  { source: sampleSvg, dimensions: [100, 100] },
  { position: [100, 200], rotation: 0, scale: [1, 1], zLayer: 2 }
);
const svgTf = galfus.realm2dGetSvgTransform(30, 10);
if (
  Math.abs(svgTf[0]! - 100) > 0.01 ||
  Math.abs(svgTf[1]! - 200) > 0.01 ||
  Math.abs(svgTf[5]! - 2) > 0.01
) {
  throw new Error(`Realm2D SVG transform readback failed: ${svgTf}`);
}
console.log('✔ Created Svg2D (#10) with initial transform');

// Mutate SVG attributes: switch href to #hover and remove fill from bg
galfus.realm2dSetSvgAttribute(30, 10, 'icon', 'href', '#hover');
galfus.realm2dRemoveSvgAttribute(30, 10, 'bg', 'fill');
galfus.realm2dSetSvgText(30, 10, 'label', 'Updated Svg Text');
console.log('✔ Mutated SVG element attributes and text content');

// Update SVG transform via fast-path Float32Array
galfus.realm2dSetSvgTransform(30, 10, new Float32Array([120, 220, 0.5, 2, 2, 5]));
const svgTf2 = galfus.realm2dGetSvgTransform(30, 10);
if (
  Math.abs(svgTf2[0]! - 120) > 0.01 ||
  Math.abs(svgTf2[1]! - 220) > 0.01 ||
  Math.abs(svgTf2[5]! - 5) > 0.01
) {
  throw new Error(`Realm2D SVG transform raw update failed: ${svgTf2}`);
}
console.log('✔ SVG transform updated via fast-path Float32Array');

// Destroy SVG
galfus.realm2dDestroySvg(30, 10);
let svgFoundAfterDestroy = false;
try {
  galfus.realm2dGetSvgTransform(30, 10);
  svgFoundAfterDestroy = true;
} catch {
  // Expected: destroyed
}
if (svgFoundAfterDestroy) {
  throw new Error('Expected SVG #10 to be destroyed');
}
console.log('✔ SVG entity destroyed cleanly');

// 8. Realm Lifecycle: Clear & Destroy
console.log('==> Testing Realm lifecycle (clear & destroy)...');
galfus.realmClear(20);
let modelFoundAfterClear = false;
try {
  galfus.realm3dGetModelTransform(20, 1);
  modelFoundAfterClear = true;
} catch {
  // Expected: model was cleared
}
if (modelFoundAfterClear) {
  throw new Error('Expected Model #1 to be cleared by realmClear');
}
console.log('✔ Realm #20 cleared entities cleanly');

galfus.realmDestroy(20);
galfus.realmClear(30);
galfus.realmDestroy(30);
console.log('✔ Realms #20 and #30 destroyed cleanly via realmDestroy()');

// 9. Multiverse: Register ColorRealm & Custom Shader
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

// 10. Multiverse: Create Invocation with Sepia filter
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

// 11. Dynamic Invocation Mutations
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

// 12. Multiverse: Target Texture Binding & Unbinding
console.log('==> Testing Target Texture binding...');
galfus.multiverseBindTargetTexture({
  sourceTargetId: 1,
  realmId: 10,
  slot: 'albedo'
});
galfus.multiverseUnbindTargetTexture(10, 'albedo');
console.log('✔ Bound and unbound Target Texture slot');

// 13. Multiverse: Resolve Schedule & Dispatch Frame
console.log('==> Testing Multiverse Resolve & Dispatch...');
const schedule = galfus.multiverseResolve();
console.log('✔ Multiverse Schedule resolved (typed object):', JSON.stringify(schedule));
if (!schedule.targetBlocks || schedule.targetBlocks.length === 0) {
  throw new Error('Expected at least one target block in schedule');
}

galfus.multiverseDispatch(1, 0.016);
console.log('✔ Dispatched frame 1 with delta 0.016s');

// 14. Multiverse: Cleanup
console.log('==> Testing Multiverse entity destruction & cleanup...');
galfus.multiverseDestroyInvocation(100);
galfus.multiverseUnregisterRealm(10);
galfus.multiverseDestroyTarget(1);
galfus.multiverseDestroyTarget(2);
console.log('✔ Destroyed invocation, realm, and targets cleanly');

// 15. Shutdown Platform
console.log('==> Testing platformShutdown()...');
galfus.platformShutdown();
console.log('✔ Context shut down cleanly');

console.log('\n🎉 All Galfus Native C-ABI / Bun FFI validations passed successfully!');
