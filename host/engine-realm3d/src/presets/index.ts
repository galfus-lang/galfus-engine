import type { Camera3DDesc, Light3DDesc, Material3DDesc } from '@galfus/transport-types';

/** Ready-to-use 3D presets. */

export function createPerspectiveCamera3D(
  fovY = Math.PI / 4,
  near = 0.1,
  far = 1000.0
): Camera3DDesc {
  return {
    kind: 'perspective',
    fovY,
    near,
    far
  };
}

export function createSunLight3D(
  color = [1.0, 0.98, 0.9] as [number, number, number],
  intensity = 3.0
): Light3DDesc {
  return {
    kind: 'directional',
    color,
    intensity,
    castShadow: true
  };
}

export function createDefaultPbrMaterial(
  baseColor = [0.8, 0.8, 0.8, 1.0] as [number, number, number, number]
): Material3DDesc {
  return {
    surfaceType: 'opaque',
    baseColor,
    metallic: 0.1,
    roughness: 0.8
  };
}
