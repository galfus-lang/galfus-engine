import { mkdir, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { API_DESCRIPTORS, API_FUNCTIONS } from './codegen/spec.ts';
import type { CodegenStrategy } from './codegen/strategies/strategy.ts';
import { CHeaderStrategy } from './codegen/strategies/c_header.ts';
import { PythonStrategy } from './codegen/strategies/python.ts';
import { LuaStrategy } from './codegen/strategies/lua.ts';
import { TypeScriptStrategy } from './codegen/strategies/typescript.ts';
import { BunFfiStrategy } from './codegen/strategies/bun_ffi.ts';
import { NodeApiStrategy } from './codegen/strategies/node_api.ts';
import { CSharpStrategy } from './codegen/strategies/csharp.ts';
import { BrowserWasmStrategy } from './codegen/strategies/browser_wasm.ts';

const rootDir = resolve(import.meta.dir, '..');
const browserAudioTemplate = resolve(import.meta.dir, 'codegen/templates/browser_audio.ts');

const STRATEGIES: CodegenStrategy[] = [
  new CHeaderStrategy(),
  new PythonStrategy(),
  new LuaStrategy(),
  new TypeScriptStrategy(),
  new BunFfiStrategy(),
  new NodeApiStrategy(),
  new CSharpStrategy(),
  new BrowserWasmStrategy()
];

async function main() {
  console.log('=== Galfus Engine - Multi-Language SDK Codegen (Strategy Pattern) ===\n');

  const context = {
    functions: API_FUNCTIONS,
    descriptors: API_DESCRIPTORS
  };

  for (const strategy of STRATEGIES) {
    const targetDir = resolve(rootDir, strategy.relativeOutputDir);
    await mkdir(targetDir, { recursive: true });
    const filePath = resolve(targetDir, strategy.filename);
    const content = strategy.generate(context);
    await writeFile(filePath, content, 'utf-8');
    console.log(
      `✔ [${strategy.id.padEnd(10)}] Generated ${strategy.name.padEnd(25)} -> ${filePath}`
    );
  }

  await import('./gen-wasm-bind.ts');
  await writeFile(
    resolve(rootDir, 'sdk/browser/audio.ts'),
    await readFile(browserAudioTemplate, 'utf-8'),
    'utf-8'
  );
  console.log(`✔ [browser_wasm] Generated Browser Web Audio adapter -> sdk/browser/audio.ts`);

  // The WASM binding generator transforms Rust source and must leave its output
  // formatted so `bun validate` succeeds immediately after `bun codegen`.
  const formatResult = Bun.spawnSync({
    cmd: ['cargo', 'fmt', '--package', 'galfus-native'],
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit'
  });
  if (formatResult.exitCode !== 0) {
    throw new Error('Failed to format generated WASM bindings.');
  }

  console.log('\n🎉 All SDK glue-code files generated successfully via Codegen Strategies!');
}

main().catch((err) => {
  console.error('Codegen failed:', err);
  process.exit(1);
});
