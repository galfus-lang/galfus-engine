import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const engineRoot = resolve(import.meta.dir, '..');
const cliBin = resolve(engineRoot, 'bin/galfus-engine.js');
const tmpDir = resolve(engineRoot, '../../.tmp/cli-test');

describe('@galfus/engine CLI (galfus-engine init & build)', () => {
  beforeAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints version and help documentation', () => {
    const helpProc = spawnSync('bun', [cliBin, '--help'], { encoding: 'utf-8' });
    expect(helpProc.status).toBe(0);
    expect(helpProc.stdout).toContain('Official CLI for Galfus Engine');
    expect(helpProc.stdout).toContain('init');
    expect(helpProc.stdout).toContain('build');

    const versionProc = spawnSync('bun', [cliBin, '--version'], { encoding: 'utf-8' });
    expect(versionProc.status).toBe(0);
    expect(versionProc.stdout.trim()).toBe('0.1.0');
  });

  it('scaffolds a functional 3D game project with init command', () => {
    const initProc = spawnSync(
      'bun',
      [cliBin, 'init', 'starter-3d', '-t', '3d-scene', '--transport', 'bun', '-d', tmpDir],
      { encoding: 'utf-8' }
    );
    expect(initProc.status).toBe(0);

    const projectRoot = resolve(tmpDir, 'starter-3d');
    expect(existsSync(resolve(projectRoot, 'package.json'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'tsconfig.json'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'src/main.ts'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'README.md'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.gitignore'))).toBe(true);
  });

  it('compiles standalone game executable and pairs native library side-by-side with build command', () => {
    const projectRoot = resolve(tmpDir, 'starter-3d');
    const outDir = resolve(projectRoot, 'dist');

    const buildProc = spawnSync(
      'bun',
      [
        cliBin,
        'build',
        '-e',
        resolve(projectRoot, 'src/main.ts'),
        '-o',
        outDir,
        '-n',
        'my-game',
        '--transport',
        'bun'
      ],
      { encoding: 'utf-8', cwd: projectRoot }
    );

    if (buildProc.status !== 0) {
      console.error('BUILD PROC ERROR:', buildProc.stderr || buildProc.stdout);
    }
    expect(buildProc.status).toBe(0);
    expect(buildProc.stdout).toContain('Build completed successfully');

    // Executable and native library exist side-by-side
    const execPath = resolve(outDir, 'my-game');
    const libPath = resolve(outDir, 'libgalfus_native.so');

    expect(existsSync(execPath)).toBe(true);
    expect(existsSync(libPath)).toBe(true);
  });
});
