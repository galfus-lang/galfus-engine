import { appendFile, readdir, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

const CHANNELS = new Set(['stable', 'alpha', 'beta', 'next', 'latest']);
const RELEASE_BRANCH_PATTERN = /^(?<channel>[^/]+)\/v(?<version>\d+\.\d+\.\d+)$/;
const WORKSPACE_VERSION_PATTERN = /(\[workspace\.package\][\s\S]*?^version\s*=\s*")[^"]+("$)/m;

type ReleaseVersion = {
  channel: string;
  version: string;
  packageVersion: string;
};

function fail(message: string): never {
  throw new Error(message);
}

async function getPublishedVersions(): Promise<Set<string>> {
  const packages = ['engine', 'transport-types'];
  const versions = new Set<string>();

  await Promise.all(
    packages.map(async (pkg) => {
      try {
        const res = await fetch(`https://registry.npmjs.org/@galfus/${pkg}`, {
          signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return;
        const data = (await res.json()) as { versions?: Record<string, unknown> };
        if (data.versions) {
          for (const v of Object.keys(data.versions)) {
            versions.add(v);
          }
        }
      } catch {
        // Fall back gracefully if offline or network fails
      }
    })
  );

  return versions;
}

async function resolveReleaseVersion(): Promise<ReleaseVersion> {
  const ref = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (!ref) {
    fail('GITHUB_HEAD_REF or GITHUB_REF_NAME is required');
  }

  const match = RELEASE_BRANCH_PATTERN.exec(ref);
  if (!match?.groups) {
    fail(`Invalid release branch "${ref}"; expected stable|alpha|beta|next|latest/vX.Y.Z.`);
  }

  const { channel, version } = match.groups;
  if (!channel || !version || !CHANNELS.has(channel)) {
    fail(`Invalid release branch "${ref}"; expected stable|alpha|beta|next|latest/vX.Y.Z.`);
  }

  const basePackageVersion = channel === 'stable' ? version : `${version}-${channel}`;
  let finalPackageVersion = basePackageVersion;

  const published = await getPublishedVersions();
  if (published.has(basePackageVersion)) {
    let iteration = 1;
    let candidate = `${basePackageVersion}.${iteration}`;
    while (published.has(candidate)) {
      iteration++;
      candidate = `${basePackageVersion}.${iteration}`;
    }
    finalPackageVersion = candidate;
    console.log(
      `[set-version] Version "${basePackageVersion}" already exists on npm registry. Auto-incremented to "${finalPackageVersion}".`
    );
  }

  return {
    channel,
    version,
    packageVersion: finalPackageVersion
  };
}

async function updateCargoVersion(root: string, version: string): Promise<void> {
  const path = resolve(root, 'Cargo.toml');
  const manifest = await readFile(path, 'utf8');
  if (!WORKSPACE_VERSION_PATTERN.test(manifest)) {
    fail('Unable to update [workspace.package] version in Cargo.toml');
  }

  const updated = manifest.replace(WORKSPACE_VERSION_PATTERN, `$1${version}$2`);
  if (updated !== manifest) {
    await writeFile(path, updated);
  }
}

async function updatePackageVersion(root: string, version: string): Promise<void> {
  const path = resolve(root, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  manifest.version = version;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function updateHostPackageVersions(root: string, version: string): Promise<void> {
  const hostDir = resolve(root, 'host');
  const entries = await readdir(hostDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = resolve(hostDir, entry.name, 'package.json');
    try {
      const content = await readFile(pkgJsonPath, 'utf8');
      const manifest = JSON.parse(content) as Record<string, any>;
      manifest.version = version;
      if (manifest.dependencies) {
        for (const [dep, ver] of Object.entries(manifest.dependencies)) {
          if (dep.startsWith('@galfus/') && ver === 'workspace:*') {
            manifest.dependencies[dep] = `^${version}`;
          }
        }
      }
      if (manifest.devDependencies) {
        for (const [dep, ver] of Object.entries(manifest.devDependencies)) {
          if (dep.startsWith('@galfus/') && ver === 'workspace:*') {
            manifest.devDependencies[dep] = `^${version}`;
          }
        }
      }
      await writeFile(pkgJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
    } catch {
      // ignore non-package directories
    }
  }

  const rootPkgPath = resolve(root, 'package.json');
  const rootManifest = JSON.parse(await readFile(rootPkgPath, 'utf8')) as Record<string, any>;
  if (rootManifest.devDependencies) {
    for (const [dep, ver] of Object.entries(rootManifest.devDependencies)) {
      if (dep.startsWith('@galfus/') && ver === 'workspace:*') {
        rootManifest.devDependencies[dep] = `^${version}`;
      }
    }
    await writeFile(rootPkgPath, `${JSON.stringify(rootManifest, null, 2)}\n`);
  }
}

async function exportVersion(version: ReleaseVersion): Promise<void> {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) {
    console.log(
      JSON.stringify({
        tag: version.channel,
        version: version.version,
        packageVersion: version.packageVersion
      })
    );
    return;
  }

  await appendFile(
    output,
    `tag=${version.channel}\nversion=${version.version}\npackageVersion=${version.packageVersion}\n`
  );
}

async function main(): Promise<void> {
  const version = await resolveReleaseVersion();
  const root = resolve(import.meta.dir, '../..');

  await updateCargoVersion(root, version.packageVersion);
  await updatePackageVersion(root, version.packageVersion);
  await updateHostPackageVersions(root, version.packageVersion);
  await exportVersion(version);
}

main().catch((error: unknown) => {
  console.error('[set-version] Failed:', error);
  process.exitCode = 1;
});
