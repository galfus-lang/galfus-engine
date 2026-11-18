/** A realm-local family with ordered font group names and default variation axes. */
export interface FontFamilyConfig {
  name: string;
  groups: readonly string[];
  axes?: Readonly<Record<string, number>>;
}

/** Packs files for the native font group API as little-endian lengths and raw bytes. */
export function packFontGroup(files: readonly Uint8Array[]): Uint8Array {
  if (files.length === 0 || files.length > 0xffffffff)
    throw new Error('A font group needs at least one file.');
  let size = 4 + files.length * 4;
  for (const file of files) {
    if (file.byteLength === 0 || file.byteLength > 0xffffffff)
      throw new Error('Invalid font file length.');
    size += file.byteLength;
    if (!Number.isSafeInteger(size) || size > 0xffffffff)
      throw new Error('Font package is too large.');
  }
  const result = new Uint8Array(size);
  const header = new DataView(result.buffer);
  header.setUint32(0, files.length, true);
  let offset = 4 + files.length * 4;
  files.forEach((file, index) => {
    header.setUint32(4 + index * 4, file.byteLength, true);
    result.set(file, offset);
    offset += file.byteLength;
  });
  return result;
}
