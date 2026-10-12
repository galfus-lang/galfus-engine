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
}

const addonModule: { exports: Partial<GalfusNativeAddon> } = { exports: {} };
process.dlopen(addonModule, libPath);
const galfus = addonModule.exports as GalfusNativeAddon;

console.log('==> Exported Node-API symbols:', Object.keys(galfus));

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

// 5. Shutdown
console.log('==> Testing platformShutdown()...');
galfus.platformShutdown();
console.log('✔ Platform cleanly shut down via Node-API');

console.log('\n🎉 All Galfus Node-API validations passed successfully!');
