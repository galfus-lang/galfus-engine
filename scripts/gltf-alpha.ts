import type { GlTFMaterial } from '@galfus/gltf-loader';
import { PNG } from 'pngjs';

const smoothAlphaCache = new WeakMap<Uint8Array, boolean | null>();

/** Returns null when the source cannot be inspected. */
function hasSmoothAlpha(image?: Uint8Array): boolean | null {
  if (!image) return null;
  const cached = smoothAlphaCache.get(image);
  if (cached !== undefined) return cached;
  try {
    const png = PNG.sync.read(Buffer.from(image));
    let intermediate = 0;
    let count = 0;
    for (let i = 3; i < png.data.length; i += 4) {
      const alpha = png.data[i]!;
      if (alpha >= 32 && alpha < 224) intermediate++;
      count++;
    }
    const result = count > 0 && intermediate / count >= 0.1;
    smoothAlphaCache.set(image, result);
    return result;
  } catch {
    smoothAlphaCache.set(image, null);
    return null;
  }
}

/** Restores the viewer's original alpha policy for mostly opaque assets. */
export function resolveViewerAlphaMode(
  material: GlTFMaterial,
  _index: number,
  baseColorImage?: Uint8Array
): GlTFMaterial['alphaMode'] {
  if (material.alphaMode !== 'BLEND') return material.alphaMode;
  const alpha =
    material.pbrMetallicRoughness?.baseColorFactor?.[3] ??
    material.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseFactor?.[3] ??
    1;
  const name = (material.name ?? '').toLowerCase();
  const transparent =
    alpha < 0.99 ||
    ['glass', 'water', 'window', 'transpar', 'ocean', 'sea', 'ice'].some((word) =>
      name.includes(word)
    );
  if (transparent) return 'BLEND';
  return hasSmoothAlpha(baseColorImage) === false ? 'MASK' : 'BLEND';
}
