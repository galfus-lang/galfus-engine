import { appendFile, readFile, writeFile } from 'fs/promises';
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

function resolveReleaseVersion(): ReleaseVersion {
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

  return {
    channel,
    version,
    packageVersion: channel === 'stable' ? version : `${version}-${channel}`
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
  const version = resolveReleaseVersion();
  const root = resolve(import.meta.dir, '../..');

  await updateCargoVersion(root, version.packageVersion);
  await updatePackageVersion(root, version.packageVersion);
  await exportVersion(version);
}

main().catch((error: unknown) => {
  console.error('[set-version] Failed:', error);
  process.exitCode = 1;
});
