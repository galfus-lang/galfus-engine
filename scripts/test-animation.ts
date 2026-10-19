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

// 4. Test Target Conflict Locking & Interruption Policy
console.log('\n--> Testing Target Conflict Locking & Seamless Interruption...');
engine.animationCreateScalarTransition(301, 0.0, 2.0, 0.0, 0);
engine.animationCreateScalarTransition(302, 0.0, 2.0, 0.0, 0);

const targetChannel = { kind: 'customChannel' as const, channelId: 999 };

// Transition 301 binds and locks custom channel 999
engine.animationBindTarget(301, targetChannel);
engine.animationTransitionToScalar(301, 100.0, 2.0, 0.0, 0);

// Advance 0.5s -> transition 301 is mid-flight at value 25.0
engine.animationStep(0.5);
const val301 = (engine.animationGetValue(301) as any).value;
console.log(`Transition 301 mid-flight value: ${val301.toFixed(1)} (expected ~25.0)`);
if (Math.abs(val301 - 25.0) > 0.1) {
  throw new Error(`Expected ~25.0, got ${val301}`);
}

// Transition 302 tries to bind to the SAME occupied property -> MUST FAIL!
let conflictFailed = false;
try {
  engine.animationBindTarget(302, targetChannel);
} catch (err: any) {
  conflictFailed = true;
  console.log(`✔ Expected target conflict caught: ${err.message}`);
}
if (!conflictFailed) {
  throw new Error('Expected animationBindTarget(302) to fail with TargetConflict!');
}

// Same transition 301 is modified mid-flight: it smoothly stops and starts new animation from current state (25.0)
console.log('--> Modifying same transition 301 to retarget towards 225.0...');
engine.animationTransitionToScalar(301, 225.0, 2.0, 0.0, 0);
const state301 = engine.animationGetState(301);
const capturedStart = (state301.startValue as any).value;
console.log(`✔ Seamlessly retargeted from current state: ${capturedStart.toFixed(1)}`);
if (Math.abs(capturedStart - 25.0) > 0.1) {
  throw new Error(`Expected new startValue ~25.0, got ${capturedStart}`);
}

// Transition 301 unbinds target, releasing the lock
console.log('--> Transition 301 unbinds target...');
engine.animationUnbindTarget(301);

// Now transition 302 can successfully acquire the target
engine.animationBindTarget(302, targetChannel);
console.log('✔ Transition 302 successfully acquired target after lock release!');

// Cleanup
engine.animationDestroyTransition(301);
engine.animationDestroyTransition(302);

engine.platformShutdown();
console.log('\n✔ Galfus Animation integration test passed successfully!');
