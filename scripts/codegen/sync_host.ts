import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Synchronizes generated TypeScript, Bun, Node, and Browser SDK glue-code
 * into host transport packages under `host/transport-*\/src/sdk/`.
 */
export async function syncHostSdk(rootDir: string): Promise<void> {
  // 1. Sync canonical descriptors to host/transport-types/src/sdk/galfus.ts
  const typesSdkDir = resolve(rootDir, 'host/transport-types/src/sdk');
  await mkdir(typesSdkDir, { recursive: true });
  const tsSdkSource = await readFile(resolve(rootDir, 'sdk/typescript/galfus.ts'), 'utf-8');
  await writeFile(resolve(typesSdkDir, 'galfus.ts'), tsSdkSource, 'utf-8');

  // 2. Sync Bun FFI SDK
  const bunSdkDir = resolve(rootDir, 'host/transport-bun/src/sdk');
  await mkdir(bunSdkDir, { recursive: true });
  let bunCode = await readFile(resolve(rootDir, 'sdk/bun/galfus.ts'), 'utf-8');
  bunCode = bunCode.replaceAll('../typescript/galfus.ts', '@galfus/transport-types');
  bunCode = bunCode.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]path['"];/,
    "import { dirname, resolve } from 'path';\nimport { getArtifactFileName, resolveNativePlatform } from '@galfus/transport-types';"
  );

  const bunLocateCustom = `
function locateLibrary(): string {
  const platform = resolveNativePlatform();
  const filename = getArtifactFileName('ffi', platform);

  // 1. Check adjacent to standalone compiled executable
  if (typeof process.execPath === 'string') {
    const execAdjacent = resolve(dirname(process.execPath), filename);
    if (existsSync(execAdjacent)) {
      return execAdjacent;
    }
  }

  // 2. Check current working directory
  const cwdAdjacent = resolve(process.cwd(), filename);
  if (existsSync(cwdAdjacent)) {
    return cwdAdjacent;
  }

  // 3. Fallback to package dist directory (monorepo / local dev)
  const baseDir = typeof import.meta.dir === 'string' ? import.meta.dir : process.cwd();
  const localDistPath = resolve(baseDir, '../../dist', platform, filename);
  if (existsSync(localDistPath)) {
    return localDistPath;
  }
  throw new Error(
    \`[GalfusBun] Native binary not found for platform "\${platform}" at: \${localDistPath}. Please run "bun run host:sync" to build it.\`
  );
}
`;
  bunCode = bunCode.replace(
    /function locateLibrary\(\): string \{[\s\S]*?\n\}/,
    bunLocateCustom.trim()
  );
  await writeFile(resolve(bunSdkDir, 'galfus.ts'), bunCode, 'utf-8');

  // 3. Sync Node-API SDK
  const nodeSdkDir = resolve(rootDir, 'host/transport-node/src/sdk');
  await mkdir(nodeSdkDir, { recursive: true });
  let nodeCode = await readFile(resolve(rootDir, 'sdk/node/galfus.ts'), 'utf-8');
  nodeCode = nodeCode.replaceAll('../typescript/galfus.ts', '@galfus/transport-types');
  nodeCode = nodeCode.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]path['"];/,
    "import { dirname, resolve } from 'path';\nimport { getArtifactFileName, resolveNativePlatform } from '@galfus/transport-types';"
  );

  const nodeLocateCustom = `
function locateAddon(): string {
  const platform = resolveNativePlatform();
  const filename = getArtifactFileName('napi', platform);

  // 1. Check adjacent to standalone compiled executable
  if (typeof process.execPath === 'string') {
    const execAdjacent = resolve(dirname(process.execPath), filename);
    if (existsSync(execAdjacent)) {
      return execAdjacent;
    }
  }

  // 2. Check current working directory
  const cwdAdjacent = resolve(process.cwd(), filename);
  if (existsSync(cwdAdjacent)) {
    return cwdAdjacent;
  }

  // 3. Fallback to package dist directory (monorepo / local dev)
  const baseDir = typeof import.meta.dir === 'string' ? import.meta.dir : dirname(fileURLToPath(import.meta.url));
  const localDistPath = resolve(baseDir, '../../dist', platform, filename);
  if (existsSync(localDistPath)) {
    return localDistPath;
  }
  throw new Error(
    \`[GalfusNode] Node-API addon not found for platform "\${platform}" at: \${localDistPath}. Please run "bun run host:sync" to build it.\`
  );
}
`;
  nodeCode = nodeCode.replace(
    /function locateAddon\(\): string \{[\s\S]*?\n\}/,
    nodeLocateCustom.trim()
  );
  await writeFile(resolve(nodeSdkDir, 'galfus.ts'), nodeCode, 'utf-8');

  // 4. Sync Browser WASM SDK
  const browserSdkDir = resolve(rootDir, 'host/transport-browser/src/sdk');
  await mkdir(browserSdkDir, { recursive: true });
  let browserCode = await readFile(resolve(rootDir, 'sdk/browser/galfus.ts'), 'utf-8');
  browserCode = browserCode.replaceAll('../typescript/galfus.ts', '@galfus/transport-types');
  browserCode = browserCode.replaceAll('./audio.ts', './audio');
  await writeFile(resolve(browserSdkDir, 'galfus.ts'), browserCode, 'utf-8');

  let audioCode = await readFile(resolve(rootDir, 'sdk/browser/audio.ts'), 'utf-8');
  audioCode = audioCode.replaceAll('../typescript/galfus.ts', '@galfus/transport-types');
  await writeFile(resolve(browserSdkDir, 'audio.ts'), audioCode, 'utf-8');

  console.log(`✔ [host_sdk  ] Synchronized host transport SDKs -> host/transport-*/src/sdk`);
}
