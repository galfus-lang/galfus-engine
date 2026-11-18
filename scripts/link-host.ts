import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dir, '..');
const hostDir = resolve(rootDir, 'host');

const ORDERED_HOST_DIRS = [
  'transport-types',
  'model-loader-types',
  'transport-bun',
  'transport-node',
  'transport-browser',
  'engine',
  'ui',
  'gltf-loader',
  'demos'
];

interface HostPackage {
  dirName: string;
  dirPath: string;
  pkgName: string;
}

function logStep(step: string, message: string): void {
  console.log(`\x1b[36m==>\x1b[0m \x1b[1m[link-host:${step}]\x1b[0m ${message}`);
}

function runCommand(cmd: string[], cwd = rootDir): void {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: 'inherit',
    stderr: 'inherit'
  });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${cmd.join(' ')}`);
  }
}

function discoverHostPackages(): HostPackage[] {
  const entries = readdirSync(hostDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const ordered = [
    ...ORDERED_HOST_DIRS.filter((name) => entries.includes(name)),
    ...entries.filter((name) => !ORDERED_HOST_DIRS.includes(name)).sort()
  ];

  const packages: HostPackage[] = [];
  for (const dirName of ordered) {
    const dirPath = resolve(hostDir, dirName);
    const pkgJsonPath = resolve(dirPath, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;

    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { name?: string };
    if (pkg.name) {
      packages.push({
        dirName,
        dirPath,
        pkgName: pkg.name
      });
    }
  }

  return packages;
}

function main(): void {
  const args = Bun.argv.slice(2);
  const withSync = args.includes('--sync');
  const linkAllToTarget = args.includes('--all');
  const targetDirArg = args.find((arg) => !arg.startsWith('-'));

  if (withSync) {
    logStep('sync', 'Synchronizing native and WASM artifacts before linking...');
    runCommand(['bun', 'scripts/host-sync.ts'], rootDir);
  }

  logStep('cli', 'Bundling @galfus/engine CLI and skills...');
  runCommand(['bun', 'host/engine/scripts/bundle-cli.ts'], rootDir);

  const hostPackages = discoverHostPackages();
  logStep('register', `Registering ${hostPackages.length} host packages via 'bun link'...`);

  for (const pkg of hostPackages) {
    logStep('register', `Linking ${pkg.pkgName} (${pkg.dirName})`);
    runCommand(['bun', 'link'], pkg.dirPath);
  }

  if (targetDirArg) {
    const targetProjectDir = resolve(process.cwd(), targetDirArg);
    if (!existsSync(targetProjectDir)) {
      throw new Error(`Target project directory does not exist: "${targetProjectDir}"`);
    }

    const targetPkgPath = resolve(targetProjectDir, 'package.json');
    let packagesToLink = hostPackages.map((p) => p.pkgName);

    if (existsSync(targetPkgPath)) {
      const targetPkg = JSON.parse(readFileSync(targetPkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      if (!linkAllToTarget) {
        const declaredDeps = new Set([
          ...Object.keys(targetPkg.dependencies ?? {}),
          ...Object.keys(targetPkg.devDependencies ?? {})
        ]);
        // Always include @galfus/transport-types when linking @galfus/engine or transports
        declaredDeps.add('@galfus/transport-types');
        if (declaredDeps.has('@galfus/gltf-loader')) {
          declaredDeps.add('@galfus/model-loader-types');
        }
        const matched = packagesToLink.filter((name) => declaredDeps.has(name));
        if (matched.length > 0) {
          packagesToLink = matched;
        }
      }

      targetPkg.dependencies = targetPkg.dependencies ?? {};
      for (const pkgName of packagesToLink) {
        if (targetPkg.devDependencies?.[pkgName]) {
          targetPkg.devDependencies[pkgName] = `link:${pkgName}`;
        } else {
          targetPkg.dependencies[pkgName] = `link:${pkgName}`;
        }
      }
      writeFileSync(targetPkgPath, JSON.stringify(targetPkg, null, 2) + '\n', 'utf-8');
    }

    logStep(
      'target',
      `Linking ${packagesToLink.length} @galfus packages into ${targetProjectDir}...`
    );
    runCommand(['bun', 'link', ...packagesToLink], targetProjectDir);
    logStep('done', `✔ Linked packages into ${targetProjectDir}`);
    return;
  }

  const allNames = hostPackages.map((p) => p.pkgName).join(' ');
  console.log('\n\x1b[32m✔ All host packages are now registered locally in Bun!\x1b[0m\n');
  console.log('To link used @galfus packages into an external project automatically:');
  console.log('  \x1b[36mbun run host:link /path/to/your-project\x1b[0m\n');
  console.log('Or run manually inside your external project:');
  console.log(`  \x1b[36mbun link ${allNames}\x1b[0m\n`);
}

main();
