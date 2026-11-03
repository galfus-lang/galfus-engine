/**
 * In-memory ZIP archive unpacking and URI resolver for multi-file glTF assets.
 */

import { unzipSync } from 'fflate';

/**
 * Checks if the binary buffer starts with the standard PKZIP magic bytes (PK\x03\x04).
 *
 * @param buffer Raw binary buffer to check.
 * @returns True if the buffer is a valid PKZIP container.
 */
export function isZipContainer(buffer: Uint8Array): boolean {
  if (buffer.byteLength < 4) return false;
  return (
    buffer[0] === 0x50 && // 'P'
    buffer[1] === 0x4b && // 'K'
    ((buffer[2] === 0x03 && buffer[3] === 0x04) || // Standard local file header
      (buffer[2] === 0x05 && buffer[3] === 0x06) || // Empty archive end of central dir
      (buffer[2] === 0x07 && buffer[3] === 0x08)) // Spanned archive marker
  );
}

/**
 * Unpacks a ZIP archive into a normalized in-memory file dictionary.
 *
 * Directory entries are discarded; forward slashes are standardized.
 *
 * @param buffer The raw ZIP bytes.
 * @returns Map of normalized file paths to their decompressed bytes.
 */
export function unpackZipArchive(buffer: Uint8Array): Map<string, Uint8Array> {
  const unzipped = unzipSync(buffer);
  const fileMap = new Map<string, Uint8Array>();

  for (const rawPath of Object.keys(unzipped)) {
    const data = unzipped[rawPath];
    if (!data || data.byteLength === 0) {
      // Could be an empty directory entry or empty file
      if (rawPath.endsWith('/') || rawPath.endsWith('\\')) {
        continue;
      }
    }

    // Normalize Windows backslashes to forward slashes and strip leading slashes
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.length > 0 && !normalized.endsWith('/')) {
      fileMap.set(normalized, data!);
    }
  }

  return fileMap;
}

/**
 * Locates the primary .gltf or .glb file inside an unpacked archive.
 *
 * Prioritizes standard names like `scene.gltf` or `model.gltf`, or the shallowest glTF file.
 *
 * @param fileMap The unpacked files map.
 * @returns The path of the primary glTF file, or null if none found.
 */
export function findPrimaryGltfPath(fileMap: Map<string, Uint8Array>): string | null {
  const gltfCandidates: string[] = [];

  for (const path of fileMap.keys()) {
    const lower = path.toLowerCase();
    if (lower.endsWith('.gltf') || lower.endsWith('.glb')) {
      gltfCandidates.push(path);
    }
  }

  if (gltfCandidates.length === 0) {
    return null;
  }

  // Check for canonical model names first
  const preferred = gltfCandidates.find((p) => {
    const base = p.split('/').pop()?.toLowerCase();
    return (
      base === 'scene.gltf' || base === 'model.gltf' || base === 'scene.glb' || base === 'model.glb'
    );
  });
  if (preferred) return preferred;

  // Otherwise sort by directory depth (shallowest first) and then by name
  gltfCandidates.sort((a, b) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });

  return gltfCandidates[0]!;
}

/**
 * Resolves a relative path given a base directory.
 */
function resolveRelativePath(baseDir: string, relativePath: string): string {
  // Strip leading ./
  let cleanRel = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');

  if (!baseDir || baseDir === '.') {
    return cleanRel;
  }

  const parts = (baseDir + '/' + cleanRel).split('/');
  const resolvedParts: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }

  return resolvedParts.join('/');
}

/**
 * Creates an external resolver callback backed by an in-memory ZIP archive file map.
 *
 * @param fileMap The unpacked files map.
 * @param gltfPath The path to the primary glTF file used as reference for relative paths.
 * @returns An async resolver function matching the glTF loader resolver interface.
 */
export function createZipResolver(
  fileMap: Map<string, Uint8Array>,
  gltfPath: string
): (uri: string) => Promise<Uint8Array> {
  const lastSlash = gltfPath.lastIndexOf('/');
  const baseDir = lastSlash >= 0 ? gltfPath.substring(0, lastSlash) : '';

  return async (uri: string): Promise<Uint8Array> => {
    // 1. Decode URL encoded characters (e.g. %20 -> space)
    const decodedUri = decodeURIComponent(uri.trim());

    // 2. Resolve relative to baseDir
    const resolvedPath = resolveRelativePath(baseDir, decodedUri);

    // 3. Exact match lookup
    let match = fileMap.get(resolvedPath);
    if (match) return match;

    // 4. Fallback: try raw decodedUri directly without baseDir
    match = fileMap.get(decodedUri);
    if (match) return match;

    // 5. Fallback: case-insensitive search or filename-only match
    const lowerResolved = resolvedPath.toLowerCase();
    const fileName = decodedUri.split('/').pop()?.toLowerCase();

    for (const [key, data] of fileMap.entries()) {
      const keyLower = key.toLowerCase();
      if (keyLower === lowerResolved) {
        return data;
      }
      if (fileName && keyLower.endsWith('/' + fileName)) {
        return data;
      }
      if (fileName && keyLower === fileName) {
        return data;
      }
    }

    throw new Error(
      `[GltfZipResolver] File not found in ZIP archive: "${uri}" (resolved: "${resolvedPath}")`
    );
  };
}
