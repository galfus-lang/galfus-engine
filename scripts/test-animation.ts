import { GalfusBun } from '../sdk/bun/galfus.ts';
import { resolve } from 'path';

console.log('=== Testing Galfus Animation System via Bun FFI SDK ===\n');

const libPath = resolve(import.meta.dir, '../build/cargo-target/debug/libgalfus_native.so');
const engine = new GalfusBun(libPath);

engine.platformInitHeadless();

// 1. Create a scalar transition with delay
console.log('--> Creating scalar transition (ID: 100) with delay: 0.5s...');
engine.animationCreateScalarTransition(100, 0.0, 1.0, 0.5, 0); // 0 = Linear
engine.animationTransitionToScalar(100, 50.0, 1.0, 0.5, 0);

let state = engine.animationGetState(100);
console.log(`Initial state: ${state.status}, remainingDelay: ${state.remainingDelay.toFixed(2)}s`);
if (state.status !== 'delay') {
  throw new Error(`Expected status 'delay', got '${state.status}'`);
}

// Advance 0.25s (still in delay)
engine.animationStep(0.25);
state = engine.animationGetState(100);
console.log(`After 0.25s: ${state.status}, remainingDelay: ${state.remainingDelay.toFixed(2)}s`);
if (state.status !== 'delay') {
  throw new Error(`Expected status 'delay', got '${state.status}'`);
}

// Advance 0.25s (delay finishes, transition starts)
engine.animationStep(0.25);
state = engine.animationGetState(100);
console.log(`After 0.50s: ${state.status}, elapsed: ${state.elapsed.toFixed(2)}s`);
if (state.status !== 'running') {
  throw new Error(`Expected status 'running', got '${state.status}'`);
}

let events: any = engine.animationPumpEvents();
console.log(`Pumped events count: ${events.length}`);
if (events.length !== 1 || events[0]!.eventType !== 'started') {
  throw new Error(`Expected 1 'started' event, got: ${JSON.stringify(events)}`);
}

// Advance 0.5s -> should reach 25.0 (halfway)
engine.animationStep(0.5);
state = engine.animationGetState(100);
const midVal = (state.currentValue as any).value;
console.log(`Halfway value: ${midVal.toFixed(2)} (expected: 25.00)`);
if (Math.abs(midVal - 25.0) > 0.1) {
  throw new Error(`Expected ~25.0, got ${midVal}`);
}

// Smooth retargeting mid-flight: redirect towards 125.0 in 1.0s
console.log('--> Retargeting towards 125.0 mid-flight...');
engine.animationTransitionToScalar(100, 125.0, 1.0, 0.0, 0);
state = engine.animationGetState(100);
const startVal = (state.startValue as any).value;
console.log(`New startValue seamlessly captured: ${startVal.toFixed(2)} (expected ~25.00)`);
if (Math.abs(startVal - 25.0) > 0.1) {
  throw new Error(`Expected startValue ~25.0, got ${startVal}`);
}

// Advance 1.0s to complete
engine.animationStep(1.0);
state = engine.animationGetState(100);
const finalVal = (state.currentValue as any).value;
console.log(`Final value: ${finalVal.toFixed(2)} (status: ${state.status})`);
if (state.status !== 'completed' || Math.abs(finalVal - 125.0) > 0.1) {
  throw new Error(`Expected completion at 125.0, got status ${state.status}, val ${finalVal}`);
}

events = engine.animationPumpEvents();
console.log(`Completion events count: ${events.length}`);
if (events.length !== 1 || events[0]!.eventType !== 'completed') {
  throw new Error(`Expected 1 'completed' event, got: ${JSON.stringify(events)}`);
}

// 2. Test binding to a Realm 3D model transform
console.log('\n--> Testing Realm 3D entity transform animation binding...');
engine.realm3dCreate(1);
engine.realm3dCreateModel(
  1,
  10,
  {
    geometryId: 1,
    materialId: 1,
    castShadow: true,
    receiveShadow: true,
    castOutline: false,
    outlineColor: [1, 1, 1, 1],
    active: true,
    boneOffset: 0,
    boneCount: 0
  },
  { position: [0, 0, 0], scale: [1, 1, 1] }
);

// Create transition ID 200 bound to ModelTransform3D
engine.animationCreateTransition(
  200,
  {
    type: 'transform3D',
    value: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]
  },
  {
    duration: 1.0,
    delay: 0.0,
    easing: 'linear',
    loopMode: 'once'
  }
);

engine.animationBindTarget(200, {
  kind: 'modelTransform3D',
  realmId: 1,
  modelId: 10
});

// Trigger 3D transform transition: move to pos [10, 20, 30] and scale [2, 2, 2]
engine.animationTransitionTo(200, {
  type: 'transform3D',
  value: [10, 20, 30, 0, 0, 0, 1, 2, 2, 2]
});

// Advance 0.5s
engine.animationStep(0.5);
const modelT = engine.realm3dGetModelTransform(1, 10);
console.log(
  `Model position halfway: [${modelT[0]!.toFixed(1)}, ${modelT[1]!.toFixed(1)}, ${modelT[2]!.toFixed(1)}]`
);
if (
  Math.abs(modelT[0]! - 5.0) > 0.1 ||
  Math.abs(modelT[1]! - 10.0) > 0.1 ||
  Math.abs(modelT[2]! - 15.0) > 0.1
) {
  throw new Error(`Expected model pos [5, 10, 15], got [${modelT.slice(0, 3)}]`);
}

// 3. Test Custom Channels
console.log('\n--> Testing Custom Animation Channels...');
engine.animationSetCustomChannel(500, { type: 'scalar', value: 42.0 });
const channelVal = engine.animationGetCustomChannel(500);
console.log(`Custom channel 500 value: ${(channelVal as any).value}`);
if ((channelVal as any).value !== 42.0) {
  throw new Error(`Expected custom channel value 42.0`);
}

engine.platformShutdown();
console.log('\n✔ Galfus Animation integration test passed successfully!');
