import { spawnSync } from 'child_process';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dir, '..');
const targetDebugDir = resolve(rootDir, 'build/cargo-target/debug');

console.log('=== Galfus Engine - Multi-Language SDK Bindings Test Suite ===\n');

let totalTests = 0;
let passedTests = 0;

function runStep(name: string, fn: () => void) {
  totalTests++;
  process.stdout.write(`==> [${totalTests}] Testing ${name}... `);
  try {
    fn();
    passedTests++;
    console.log('✔ PASSED');
  } catch (err: any) {
    console.log('✖ FAILED');
    console.error(`\nError in ${name}:`, err.message || err);
    process.exit(1);
  }
}

// 1. Bun FFI Test Suite
runStep('Bun FFI SDK (sdk/bun/galfus.ts)', () => {
  const result = spawnSync('bun', [resolve(rootDir, 'scripts/test-ffi.ts')], {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  if (result.status !== 0) {
    throw new Error(
      `test-ffi.ts failed with code ${result.status}:\n${result.stderr || result.stdout}`
    );
  }
});

// 2. Node-API Native Addon Test Suite
runStep('Node-API SDK (sdk/node/galfus.ts)', () => {
  const result = spawnSync('bun', [resolve(rootDir, 'scripts/test-napi.ts')], {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  if (result.status !== 0) {
    throw new Error(
      `test-napi.ts failed with code ${result.status}:\n${result.stderr || result.stdout}`
    );
  }
});

// 3. Python SDK Test Suite
runStep('Python 3 SDK (sdk/python/galfus.py)', () => {
  const pyCode = `
import sys
import ctypes
import json
sys.path.append('sdk/python')
import galfus

# 1. Initialize Headless Platform
galfus.platform_init_headless()

# 2. Query Capabilities
caps = galfus.platform_get_capabilities()
assert caps.get('isHeadless') is True, f"Expected isHeadless True, got {caps}"

# 3. Multiverse Targets
galfus.multiverse_create_target(1, {"kind": {"type": "texture", "width": 640, "height": 480}})
w = ctypes.c_uint32()
h = ctypes.c_uint32()
galfus.multiverse_get_target_size_raw(1, ctypes.byref(w), ctypes.byref(h))
assert (w.value, h.value) == (640, 480), f"Expected (640, 480), got {(w.value, h.value)}"

# 4. Realm Lifecycle
galfus.realm3d_create(10)
galfus.realm2d_create(20)
galfus.realm_destroy(10)
galfus.realm_destroy(20)
galfus.multiverse_destroy_target(1)

# 5. Shutdown
galfus.platform_shutdown()
`;
  const result = spawnSync('python3', ['-c', pyCode], {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  if (result.status !== 0) {
    throw new Error(
      `Python execution failed with code ${result.status}:\n${result.stderr || result.stdout}`
    );
  }
});

// 3. LuaJIT SDK Test Suite
runStep('LuaJIT SDK (sdk/lua/galfus.lua)', () => {
  const luaCode = `
package.path = 'sdk/lua/?.lua;' .. package.path
local galfus = require('galfus')

-- 1. Initialize Headless Platform
galfus.platform_init_headless()

-- 2. Query Capabilities
local caps = galfus.platform_get_capabilities()
assert(caps and string.find(caps, '"isHeadless":true'), "Expected isHeadless true in caps: " .. tostring(caps))

-- 3. Multiverse Targets
galfus.multiverse_create_target(1, '{"kind":{"type":"texture","width":640,"height":480}}')

-- 4. Realm Lifecycle
galfus.realm3d_create(10)
galfus.realm2d_create(20)
galfus.realm_destroy(10)
galfus.realm_destroy(20)
galfus.multiverse_destroy_target(1)

-- 5. Shutdown
galfus.platform_shutdown()
`;
  const result = spawnSync('luajit', ['-e', luaCode], {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  if (result.status !== 0) {
    throw new Error(
      `LuaJIT execution failed with code ${result.status}:\n${result.stderr || result.stdout}`
    );
  }
});

// 4. C Header SDK Test Suite
runStep('C Header SDK (sdk/c/galfus.h)', () => {
  const tmpDir = resolve(rootDir, '.tmp');
  mkdirSync(tmpDir, { recursive: true });

  const cSrcPath = resolve(tmpDir, 'test_c_bind.c');
  const binPath = resolve(tmpDir, 'test_c_bind');

  const cCode = `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "galfus.h"

int main() {
    int res = galfus_platform_init_headless();
    assert(res == 0);

    char* caps = galfus_platform_get_capabilities();
    assert(caps != NULL);
    assert(strstr(caps, "\\"isHeadless\\":true") != NULL);
    galfus_string_free(caps);

    res = galfus_multiverse_create_target(1, "{\\"kind\\":{\\"type\\":\\"texture\\",\\"width\\":640,\\"height\\":480}}");
    assert(res == 0);

    uint32_t w = 0, h = 0;
    res = galfus_multiverse_get_target_size(1, &w, &h);
    assert(res == 0);
    assert(w == 640 && h == 480);

    res = galfus_realm_3d_create(10);
    assert(res == 0);
    res = galfus_realm_destroy(10);
    assert(res == 0);

    res = galfus_multiverse_destroy_target(1);
    assert(res == 0);

    res = galfus_platform_shutdown();
    assert(res == 0);
    return 0;
}
`;
  writeFileSync(cSrcPath, cCode, 'utf-8');

  // Compile with gcc
  const compileRes = spawnSync(
    'gcc',
    [
      cSrcPath,
      `-I${resolve(rootDir, 'sdk/c')}`,
      `-L${targetDebugDir}`,
      '-lgalfus_native',
      `-Wl,-rpath,${targetDebugDir}`,
      '-o',
      binPath
    ],
    { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' }
  );

  if (compileRes.status !== 0) {
    throw new Error(`C compilation failed:\n${compileRes.stderr || compileRes.stdout}`);
  }

  // Execute binary
  const execRes = spawnSync(binPath, [], {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'pipe'
  });

  // Cleanup temporary binaries
  if (existsSync(binPath)) unlinkSync(binPath);
  if (existsSync(cSrcPath)) unlinkSync(cSrcPath);

  if (execRes.status !== 0) {
    throw new Error(
      `C execution failed with code ${execRes.status}:\n${execRes.stderr || execRes.stdout}`
    );
  }
});

// 5. C# SDK File & Environment Verification
runStep('C# SDK (sdk/csharp/Galfus.cs)', () => {
  const csharpFile = resolve(rootDir, 'sdk/csharp/Galfus.cs');
  if (!existsSync(csharpFile)) {
    throw new Error(`sdk/csharp/Galfus.cs not found at ${csharpFile}`);
  }

  const content = Bun.file(csharpFile);
  if (content.size < 1000) {
    throw new Error(`Generated Galfus.cs file is suspiciously small (${content.size} bytes)`);
  }
});

console.log(`\n🎉 All ${passedTests}/${totalTests} SDK bindings tested and verified successfully!`);
