import type { GalfusBun } from '../../sdk/bun/galfus.ts';

export function updateDemo3d7MirrorMaterial(
  galfus: GalfusBun,
  realmId: number,
  materialId: number,
  isPortalMode: boolean,
  baseColor: [number, number, number, number],
  reflectance: number
): void {
  galfus.realm3dCreateMaterial(realmId, materialId, {
    surfaceType: isPortalMode ? 'portal' : 'mirror',
    baseColor,
    roughness: 0.04,
    metallic: 0.95,
    reflectance,
    emissiveColor: isPortalMode ? [0.15, 0.45, 0.95, 1.0] : [0, 0, 0, 0]
  });
}
