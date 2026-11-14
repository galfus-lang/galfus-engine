import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
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

# Decode an overflowed native IME record, including embedded NUL and UTF-16 selection.
original_lib = galfus._lib
long_text = 'é' * 45 + chr(0) + '漢😀'
buffers = [ctypes.create_string_buffer(long_text.encode('utf-8')), ctypes.create_string_buffer(b''), ctypes.create_string_buffer(b'')]
class MockEventLibrary:
    def galfus_platform_event_text(self, field, length):
        ctypes.cast(length, ctypes.POINTER(ctypes.c_uint32))[0] = len(long_text.encode('utf-8')) if field == 0 else 0
        return ctypes.addressof(buffers[field])
galfus._lib = MockEventLibrary()
event = galfus.GalfusPlatformEvent(kind=3, event_type=4, flags=513, window_id=9, subject_id=40, id=48)
assert galfus._decode_platform_events(event) == [{"kind": "keyboard", "type": "imePreedit", "windowId": 9, "text": long_text, "selection": [40, 48]}]
galfus._lib = original_lib

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
galfus.realm3d_create_camera(10, 1, {"fovY": 60, "near": 0.1, "far": 1000}, {"position": [0, 0, 0]})
galfus.realm3d_set_camera_transform(10, 1, {"position": [4, 5, 6], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]})
transform = galfus.realm3d_get_camera_transform(10, 1)
assert transform["position"] == [4.0, 5.0, 6.0], f"Unexpected native transform: {transform}"
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
local ffi = require('ffi')
local decode
for i = 1, 30 do
    local name, value = debug.getupvalue(galfus.platform_pump_events, i)
    if not name then break end
    if name == 'decode_platform_events' then decode = value break end
end
assert(decode, 'event decoder not found')
local text = string.rep('é', 45) .. string.char(0) .. '漢😀'
local buffer = ffi.new('uint8_t[?]', #text + 1)
ffi.copy(buffer, text, #text)
local original, clib_index
for i = 1, 30 do
    local name, value = debug.getupvalue(decode, i)
    if not name then break end
    if name == 'clib' then original, clib_index = value, i break end
end
assert(clib_index, 'event library not found')
local empty = ffi.new('uint8_t[1]')
debug.setupvalue(decode, clib_index, { galfus_platform_event_text = function(field, length)
    length[0] = field == 0 and #text or 0
    return field == 0 and buffer or empty
end })
local event = ffi.new('GalfusPlatformEvent', { kind = 3, event_type = 4, flags = 513, window_id = 9, subject_id = 40, id = 48 })
local decoded = decode(event)
assert(decoded[1].text == text and decoded[1].selection[1] == 40 and decoded[1].selection[2] == 48, 'IME event was truncated')
debug.setupvalue(decode, clib_index, original)

-- 1. Initialize Headless Platform
galfus.platform_init_headless()

-- 2. Query Capabilities
local caps = galfus.platform_get_capabilities()
assert(caps and string.find(caps, '"isHeadless":true'), "Expected isHeadless true in caps: " .. tostring(caps))

-- 3. Multiverse Targets
galfus.multiverse_create_target(1, '{"kind":{"type":"texture","width":640,"height":480}}')

-- 4. Realm Lifecycle
galfus.realm3d_create(10)
galfus.realm3d_create_camera(10, 1, '{"fovY":60,"near":0.1,"far":1000}', '{"position":[0,0,0]}')
galfus.realm3d_set_camera_transform(10, 1, { position = {4, 5, 6}, rotation = {0, 0, 0, 1}, scale = {1, 1, 1} })
local transform = galfus.realm3d_get_camera_transform(10, 1)
assert(transform.position[1] == 4 and transform.position[2] == 5 and transform.position[3] == 6, "Unexpected native transform")
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

    uint32_t text_len = 1;
    assert(GALFUS_PLATFORM_EVENT_TEXT_OVERFLOW == 512);
    assert(galfus_platform_event_text(0, &text_len) == NULL && text_len == 0);

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
    res = galfus_realm_3d_create_camera(10, 1, "{\\"fovY\\":60,\\"near\\":0.1,\\"far\\":1000}", "{\\"position\\":[0,0,0]}");
    assert(res == 0);
    GalfusTransform3D transform = {4, 5, 6, 0, 0, 0, 1, 1, 1, 1};
    res = galfus_realm_3d_set_camera_transform(10, 1, &transform);
    assert(res == 0);
    GalfusTransform3D readback = {0};
    res = galfus_realm_3d_get_camera_transform(10, 1, &readback);
    assert(res == 0 && readback.position_x == 4 && readback.position_y == 5 && readback.position_z == 6);
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
  const text = spawnSync('grep', ['-q', 'struct GalfusTransform3D', csharpFile], {
    encoding: 'utf-8'
  });
  if (text.status !== 0) {
    throw new Error('C# SDK is missing fixed-layout transform structs');
  }
});

runStep('C# SDK overflow event decoding', () => {
  const tmpDir = resolve(rootDir, '.tmp/csharp-event-overflow');
  mkdirSync(tmpDir, { recursive: true });
  const expected = `${'é'.repeat(45)}\0漢😀`;
  const bytes = [...new TextEncoder().encode(expected)];
  const source = `#include <stdint.h>
static const uint8_t text[] = {${bytes.join(',')}};
static const uint8_t empty[] = {0};
const uint8_t* galfus_platform_event_text(uint32_t field, uint32_t* length) {
  *length = field == 0 ? sizeof(text) : 0;
  return field == 0 ? text : empty;
}`;
  writeFileSync(resolve(tmpDir, 'stub.c'), source);
  const compiler = spawnSync('gcc', ['-shared', '-fPIC', 'stub.c', '-o', 'libevent_test.so'], {
    cwd: tmpDir,
    encoding: 'utf-8'
  });
  if (compiler.status !== 0) throw new Error(compiler.stderr || compiler.stdout);
  const project = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>disable</Nullable></PropertyGroup><ItemGroup><Compile Include="${resolve(rootDir, 'sdk/csharp/Galfus.cs')}" Link="Galfus.cs" /></ItemGroup></Project>`;
  writeFileSync(resolve(tmpDir, 'Test.csproj'), project);
  const code = `using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using Galfus;
class Program {
  static void Main() {
    NativeLibrary.SetDllImportResolver(typeof(GalfusEngine).Assembly, (name, assembly, path) => NativeLibrary.Load(Environment.GetEnvironmentVariable("GALFUS_EVENT_TEST_LIBRARY")));
    var item = new GalfusPlatformEvent { kind = 3, event_type = 4, flags = 513, window_id = 9, subject_id = 40, id = 48, text_bytes = new byte[80] };
    var method = typeof(GalfusEngine).GetMethod("DecodePlatformEvents", BindingFlags.Instance | BindingFlags.NonPublic);
    var result = (List<Dictionary<string, object>>)method.Invoke(new GalfusEngine(), new object[] { item });
    string expected = new string('é', 45) + '\\0' + "漢😀";
    var selection = (ulong[])result[0]["selection"];
    if ((string)result[0]["text"] != expected || selection[0] != 40 || selection[1] != 48) throw new Exception("Overflow IME event was truncated");
  }
}`;
  writeFileSync(resolve(tmpDir, 'Program.cs'), code);
  const run = spawnSync('dotnet', ['run', '--project', 'Test.csproj'], {
    cwd: tmpDir,
    encoding: 'utf-8',
    env: { ...process.env, GALFUS_EVENT_TEST_LIBRARY: resolve(tmpDir, 'libevent_test.so') }
  });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout);
});

// 7. Galfus Animation System Test Suite
runStep('Galfus Animation System (scripts/test-animation.ts)', () => {
  const result = spawnSync('bun', [resolve(rootDir, 'scripts/test-animation.ts')], {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  if (result.status !== 0) {
    throw new Error(
      `test-animation.ts failed with code ${result.status}:\n${result.stderr || result.stdout}`
    );
  }
});

console.log(`\n🎉 All ${passedTests}/${totalTests} SDK bindings tested and verified successfully!`);
