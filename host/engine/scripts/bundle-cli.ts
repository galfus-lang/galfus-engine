import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dir, '..');
const srcCli = resolve(rootDir, 'src/cli/index.ts');
const binDir = resolve(rootDir, 'bin');
const outBin = resolve(binDir, 'galfus-engine.js');

mkdirSync(binDir, { recursive: true });

console.log('[bundle-cli] Bundling CLI from', srcCli);
const proc = Bun.spawnSync(['bun', 'build', srcCli, '--target=bun', '--outfile', outBin]);

if (proc.exitCode !== 0) {
  console.error(proc.stderr.toString());
  process.exit(1);
}

// Ensure shebang is at the very top
let content = readFileSync(outBin, 'utf-8');
if (!content.startsWith('#!/usr/bin/env')) {
  content = `#!/usr/bin/env bun\n${content}`;
  writeFileSync(outBin, content, 'utf-8');
}

chmodSync(outBin, 0o755);
console.log('[bundle-cli] ✔ CLI successfully bundled to', outBin);
