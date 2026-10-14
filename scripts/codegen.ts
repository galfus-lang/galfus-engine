import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { API_DESCRIPTORS, API_FUNCTIONS } from './codegen/spec.ts';
import type { CodegenStrategy } from './codegen/strategies/strategy.ts';
import { CHeaderStrategy } from './codegen/strategies/c_header.ts';
import { PythonStrategy } from './codegen/strategies/python.ts';
import { LuaStrategy } from './codegen/strategies/lua.ts';
import { TypeScriptStrategy } from './codegen/strategies/typescript.ts';
import { BunFfiStrategy } from './codegen/strategies/bun_ffi.ts';

const rootDir = resolve(import.meta.dir, '..');

const STRATEGIES: CodegenStrategy[] = [
  new CHeaderStrategy(),
  new PythonStrategy(),
  new LuaStrategy(),
  new TypeScriptStrategy(),
  new BunFfiStrategy()
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

  console.log('\n🎉 All SDK glue-code files generated successfully via Codegen Strategies!');
}

main().catch((err) => {
  console.error('Codegen failed:', err);
  process.exit(1);
});
