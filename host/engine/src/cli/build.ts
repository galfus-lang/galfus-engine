import {
  getArtifactFileName,
  type NativePlatform,
  resolveNativePlatform
} from '@galfus/transport-types';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

export interface BuildOptions {
  entry?: string;
  target?: string;
  out?: string;
  name?: string;
  transport?: 'bun' | 'node';
  cwd?: string;
}

export function detectProjectTransport(projectRoot: string): 'bun' | 'node' {
  const pkgPath = resolve(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['@galfus/transport-bun']) return 'bun';
      if (deps['@galfus/transport-node']) return 'node';
    } catch {
      // Fall through to runtime check
    }
  }
  return typeof (process as any).isBun !== 'undefined' || process.versions.bun ? 'bun' : 'node';
}

export function resolveProjectEntry(projectRoot: string, explicitEntry?: string): string {
  if (explicitEntry) {
    const p = resolve(projectRoot, explicitEntry);
    if (!existsSync(p)) {
      throw new Error(`Specified entry file does not exist: "${p}"`);
    }
    return p;
  }

  const candidates = ['src/main.ts', 'src/index.ts', 'main.ts', 'index.ts'];
  for (const c of candidates) {
    const p = resolve(projectRoot, c);
    if (existsSync(p)) return p;
  }

  const pkgPath = resolve(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (typeof pkg.main === 'string') {
        const p = resolve(projectRoot, pkg.main);
        if (existsSync(p)) return p;
      }
    } catch {
      // Ignore
    }
  }

  throw new Error(
    `Could not locate game entry file in "${projectRoot}". Specify with --entry <file> (e.g. src/main.ts).`
  );
}

export function resolveProjectName(
  projectRoot: string,
  explicitName?: string,
  entryPath?: string
): string {
  if (explicitName) return explicitName;
  const pkgPath = resolve(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (typeof pkg.name === 'string' && pkg.name.trim().length > 0) {
        return pkg.name.replace(/^@.+\//, '').trim();
      }
    } catch {
      // Ignore
    }
  }
  if (entryPath) {
    const base = basename(entryPath, extname(entryPath));
    if (base !== 'main' && base !== 'index') return base;
  }
  return 'galfus-game';
}

export function locateNativeBinary(
  projectRoot: string,
  transport: 'bun' | 'node',
  target: NativePlatform
): string {
  const kind = transport === 'bun' ? 'ffi' : 'napi';
  const filename = getArtifactFileName(kind, target);

  let currentDir = resolve(projectRoot);
  const searched: string[] = [];

  while (true) {
    const candidates = [
      resolve(currentDir, `node_modules/@galfus/transport-${transport}/dist/${target}/${filename}`),
      resolve(currentDir, `host/transport-${transport}/dist/${target}/${filename}`),
      resolve(currentDir, `dist/${target}/${filename}`),
      resolve(currentDir, `build/cargo-target/release/${filename}`),
      resolve(currentDir, `build/cargo-target/debug/${filename}`)
    ];

    for (const c of candidates) {
      searched.push(c);
      if (existsSync(c)) {
        return c;
      }
    }

    const parent = dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  throw new Error(
    `Native library "${filename}" for target "${target}" not found. Searched paths:\n  - ${searched.slice(0, 8).join('\n  - ')}`
  );
}

export async function runBuildCommand(options: BuildOptions = {}): Promise<void> {
  const projectRoot = resolve(options.cwd ?? process.cwd());
  const transport = options.transport ?? detectProjectTransport(projectRoot);
  const target = (options.target ?? resolveNativePlatform()) as NativePlatform;
  const entry = resolveProjectEntry(projectRoot, options.entry);
  const baseName = resolveProjectName(projectRoot, options.name, entry);
  const outDir = resolve(projectRoot, options.out ?? 'dist');

  console.log(
    `[galfus-engine build] Compiling "${baseName}" for ${target} (${transport} transport)...`
  );
  mkdirSync(outDir, { recursive: true });

  const isWindows = target.startsWith('windows');
  const binName = isWindows ? `${baseName}.exe` : baseName;
  const outBinaryPath = join(outDir, binName);

  // 1. Compile game executable
  if (transport === 'bun') {
    const bunTargetFlag = `--target=bun-${target}`;
    const compileArgs = ['build', '--compile', bunTargetFlag, entry, '--outfile', outBinaryPath];

    console.log(`[galfus-engine build] Running: bun ${compileArgs.join(' ')}`);
    const proc = spawnSync('bun', compileArgs, { stdio: 'inherit', cwd: projectRoot });
    if (proc.status !== 0) {
      throw new Error(`bun build --compile failed with exit code ${proc.status}`);
    }
  } else {
    // Node transport bundling
    const bundlePath = join(outDir, `${baseName}.cjs`);
    console.log(`[galfus-engine build] Bundling Node.js script: ${bundlePath}`);
    const proc = spawnSync('bun', ['build', entry, '--target=node', '--outfile', bundlePath], {
      stdio: 'inherit',
      cwd: projectRoot
    });
    if (proc.status !== 0) {
      throw new Error(`Node bundle build failed with exit code ${proc.status}`);
    }
  }

  // 2. Locate and copy side-by-side native library
  const sourceLibPath = locateNativeBinary(projectRoot, transport, target);
  const libFilename = basename(sourceLibPath);
  const outLibPath = join(outDir, libFilename);

  console.log(`[galfus-engine build] Copying native library: ${libFilename}`);
  copyFileSync(sourceLibPath, outLibPath);

  // Ensure executable permissions on Unix
  if (!isWindows && existsSync(outBinaryPath)) {
    try {
      chmodSync(outBinaryPath, 0o755);
    } catch {
      // Ignore permission warnings
    }
  }

  console.log(`\n✔ Build completed successfully!`);
  console.log(`Output directory: ${outDir}`);
  console.log(`  - Executable:     ${outBinaryPath}`);
  console.log(`  - Native library: ${outLibPath}`);
  console.log(`Both files are side-by-side ready for standalone distribution.\n`);
}
