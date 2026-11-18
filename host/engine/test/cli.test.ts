import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPackageJson } from '../src/cli/templates';

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
    expect(existsSync(resolve(projectRoot, 'AGENTS.md'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.agents/AGENTS.md'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.agents/skills/galfus-core/SKILL.md'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.agents/skills/galfus-realm-3d/SKILL.md'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.agents/skills/galfus-realm-2d/SKILL.md'))).toBe(true);
    expect(
      existsSync(resolve(projectRoot, '.agents/skills/galfus-realm-3d-helpers/SKILL.md'))
    ).toBe(true);
    expect(
      existsSync(resolve(projectRoot, '.agents/skills/galfus-realm-2d-helpers/SKILL.md'))
    ).toBe(true);
    expect(existsSync(resolve(projectRoot, '.agents/skills/galfus-animation/SKILL.md'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.agents/skills/galfus-physics-3d/SKILL.md'))).toBe(
      true
    );
    expect(existsSync(resolve(projectRoot, '.agents/skills/galfus-physics-2d/SKILL.md'))).toBe(
      true
    );

    const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@galfus/engine']).not.toBe('^0.0.0');
    expect(pkg.dependencies['@galfus/transport-bun']).not.toBe('^0.0.0');
  });

  it('scaffolds a Vite browser game project with skills and agent guidelines', () => {
    const initProc = spawnSync(
      'bun',
      [cliBin, 'init', 'starter-browser', '-t', '2d-scene', '--transport', 'browser', '-d', tmpDir],
      { encoding: 'utf-8' }
    );
    expect(initProc.status).toBe(0);

    const projectRoot = resolve(tmpDir, 'starter-browser');
    expect(existsSync(resolve(projectRoot, 'package.json'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'tsconfig.json'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'index.html'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'vite.config.ts'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'src/main.ts'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'AGENTS.md'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.agents/AGENTS.md'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.agents/skills/galfus-core/SKILL.md'))).toBe(true);

    const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.dependencies['@galfus/transport-browser']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();

    const mainTs = readFileSync(resolve(projectRoot, 'src/main.ts'), 'utf-8');
    expect(mainTs).toContain("import { createBrowserTransport } from '@galfus/transport-browser';");
    expect(mainTs).toContain('await createBrowserTransport()');
    expect(mainTs).toContain("canvasId: 'galfus-canvas'");
  });

  it('generates package.json with custom or dynamically resolved versions', async () => {
    const pkgJson = await createPackageJson(
      {
        name: 'custom-physics',
        template: 'physics',
        transport: 'node'
      },
      {
        '@galfus/engine': '^1.0.0',
        '@galfus/transport-node': '^1.0.0',
        '@types/bun': '^1.0.0',
        typescript: '^5.0.0'
      }
    );

    const parsed = JSON.parse(pkgJson);
    expect(parsed.dependencies['@galfus/engine']).toBe('^1.0.0');
    expect(parsed.dependencies['@galfus/transport-node']).toBe('^1.0.0');
    expect(parsed.devDependencies['typescript']).toBe('^5.0.0');
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

  it('searches API docs with free text in Portuguese and English via api-search command', () => {
    const gltfSearch = spawnSync('bun', [cliBin, 'api-search', 'como carregar gltf', '--json'], {
      encoding: 'utf-8'
    });
    expect(gltfSearch.status).toBe(0);
    const gltfResults = JSON.parse(gltfSearch.stdout);
    expect(Array.isArray(gltfResults)).toBe(true);
    expect(gltfResults.length).toBeGreaterThan(0);
    expect(gltfResults[0].entry.module).toBe('@galfus/gltf-loader');
    expect(gltfResults[0].entry.snippet).toContain('loadGltfAsset');

    const ecsSearch = spawnSync(
      'bun',
      [cliBin, 'api-search', 'como criar sistema no ecs', '--json'],
      { encoding: 'utf-8' }
    );
    expect(ecsSearch.status).toBe(0);
    const ecsResults = JSON.parse(ecsSearch.stdout);
    expect(ecsResults.length).toBeGreaterThan(0);
    expect(ecsResults[0].entry.skill).toBe('galfus-core');
    expect(ecsResults[0].entry.snippet).toContain('addSystem');
  });
});
