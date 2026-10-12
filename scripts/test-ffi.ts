import { dlopen, FFIType, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../build/cargo-target/debug/libgalfus_native.so');

console.log(`==> Loading Galfus dynamic library from: ${libPath}`);

const lib = dlopen(libPath, {
  galfus_platform_init_headless: {
    args: [],
    returns: FFIType.i32
  },
  galfus_platform_shutdown: {
    args: [],
    returns: FFIType.i32
  },
  galfus_platform_get_capabilities: {
    args: [],
    returns: FFIType.ptr
  },
  galfus_platform_pump_events: {
    args: [],
    returns: FFIType.ptr
  },
  galfus_string_free: {
    args: [FFIType.ptr],
    returns: FFIType.void
  },
  galfus_get_last_error: {
    args: [],
    returns: FFIType.ptr
  }
});

console.log('==> Testing galfus_platform_init_headless()...');
const initRes = lib.symbols.galfus_platform_init_headless();
if (initRes !== 0) {
  const errPtr = lib.symbols.galfus_get_last_error();
  const errMsg = errPtr ? new CString(errPtr) : 'Unknown error';
  throw new Error(`galfus_platform_init_headless failed: ${errMsg}`);
}
console.log('✔ Context initialized successfully');

console.log('==> Testing galfus_platform_get_capabilities()...');
const capsPtr = lib.symbols.galfus_platform_get_capabilities();
if (!capsPtr) {
  throw new Error('galfus_platform_get_capabilities returned null');
}
const capsJson = new CString(capsPtr).toString();
lib.symbols.galfus_string_free(capsPtr);

const capabilities = JSON.parse(capsJson);
console.log('✔ Capabilities received (camelCase verified):', capabilities);

if (capabilities.isHeadless !== true) {
  throw new Error(`Expected isHeadless: true, received: ${capabilities.isHeadless}`);
}

console.log('==> Testing galfus_platform_pump_events()...');
const eventsPtr = lib.symbols.galfus_platform_pump_events();
if (!eventsPtr) {
  throw new Error('galfus_platform_pump_events returned null');
}
const eventsJson = new CString(eventsPtr).toString();
lib.symbols.galfus_string_free(eventsPtr);

const events = JSON.parse(eventsJson);
console.log(`✔ Pump events received: ${events.length} events`);

console.log('==> Testing galfus_platform_shutdown()...');
const shutdownRes = lib.symbols.galfus_platform_shutdown();
if (shutdownRes !== 0) {
  throw new Error('galfus_platform_shutdown failed');
}
console.log('✔ Context shut down cleanly');

console.log('\n🎉 All Galfus Native C-ABI / FFI validations passed successfully!');
