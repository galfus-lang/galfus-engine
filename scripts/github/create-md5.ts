import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  const [path] = process.argv.slice(2);
  if (!path) {
    fail('Usage: bun scripts/github/create-md5.ts <artifact-path>');
  }

  const artifactPath = resolve(path);
  const contents = await readFile(artifactPath);
  const checksum = createHash('md5').update(contents).digest('hex');
  const checksumPath = `${artifactPath}.md5`;

  await writeFile(checksumPath, `${checksum}  ${basename(artifactPath)}\n`);
  console.log(`Created ${basename(checksumPath)}`);
}

main().catch((error: unknown) => {
  console.error('[create-md5] Failed:', error);
  process.exitCode = 1;
});
