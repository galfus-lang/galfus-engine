import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { resolve } from 'node:path';
import { buildIndexFromSkillsMap } from '../src/cli/search';

const rootDir = resolve(import.meta.dir, '..');
const repoRoot = resolve(rootDir, '../..');
const skillsRoot = resolve(repoRoot, '.agents/skills');
const docsIndexOutPath = resolve(repoRoot, 'docs/api-search-index.json');
const srcCliDir = resolve(rootDir, 'src/cli');
const skillsBundlePath = resolve(srcCliDir, 'skills-bundle.json');
const srcCli = resolve(srcCliDir, 'index.ts');
const binDir = resolve(rootDir, 'bin');
const outBin = resolve(binDir, 'galfus-engine.js');

// 1. Sync Galfus skills from .agents/skills/galfus-* into src/cli/skills-bundle.json
if (existsSync(skillsRoot)) {
  const skillsMap: Record<string, string> = {};
  const entries = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('galfus-'))
    .map((d) => d.name)
    .sort();

  for (const skillName of entries) {
    const skillMdPath = resolve(skillsRoot, skillName, 'SKILL.md');
    if (existsSync(skillMdPath)) {
      skillsMap[skillName] = readFileSync(skillMdPath, 'utf-8');
    }
  }

  writeFileSync(skillsBundlePath, JSON.stringify(skillsMap, null, 2) + '\n', 'utf-8');
  console.log(`[bundle-cli] Synced ${Object.keys(skillsMap).length} skills to ${skillsBundlePath}`);

  // 2. Generate docs/api-search-index.json for remote/cloud search
  const searchEntries = buildIndexFromSkillsMap(skillsMap);
  mkdirSync(resolve(repoRoot, 'docs'), { recursive: true });
  writeFileSync(docsIndexOutPath, JSON.stringify(searchEntries, null, 2) + '\n', 'utf-8');
  console.log(
    `[bundle-cli] Generated ${searchEntries.length} search entries in ${docsIndexOutPath}`
  );
}

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
