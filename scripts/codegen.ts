import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { generateCHeader } from './codegen/c_header.ts';
import { generatePython } from './codegen/python.ts';
import { generateLua } from './codegen/lua.ts';
import { generateTypeScript } from './codegen/typescript.ts';
import { generateBunFFI } from './codegen/bun_ffi.ts';

const rootDir = resolve(import.meta.dir, '..');

interface OutputTarget {
  name: string;
  dir: string;
  filename: string;
  content: string;
}

const targets: OutputTarget[] = [
  {
    name: 'C / C++ Header',
    dir: resolve(rootDir, 'sdk/c'),
    filename: 'galfus.h',
    content: generateCHeader()
  },
  {
    name: 'Python Wrapper',
    dir: resolve(rootDir, 'sdk/python'),
    filename: 'galfus.py',
    content: generatePython()
  },
  {
    name: 'LuaJIT Wrapper',
    dir: resolve(rootDir, 'sdk/lua'),
    filename: 'galfus.lua',
    content: generateLua()
  },
  {
    name: 'TypeScript Definitions',
    dir: resolve(rootDir, 'sdk/typescript'),
    filename: 'galfus.ts',
    content: generateTypeScript()
  },
  {
    name: 'Bun FFI Wrapper',
    dir: resolve(rootDir, 'sdk/bun'),
    filename: 'galfus.ts',
    content: generateBunFFI()
  }
];

async function main() {
  console.log('=== Galfus Engine - Multi-Language SDK Codegen ===\n');

  for (const target of targets) {
    await mkdir(target.dir, { recursive: true });
    const filePath = resolve(target.dir, target.filename);
    await writeFile(filePath, target.content, 'utf-8');
    console.log(`✔ Generated ${target.name.padEnd(25)} -> ${filePath}`);
  }

  console.log('\n🎉 All SDK glue-code files generated successfully!');
}

main().catch((err) => {
  console.error('Codegen failed:', err);
  process.exit(1);
});
