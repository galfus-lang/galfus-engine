/**
 * Realm 3D presets for camera and lighting configurations.
 */
import type { Camera3DDesc, Light3DDesc, Material3DDesc } from '@galfus/transport-types';

export function createPerspectiveCamera3DPreset(
  options: {
    fovY?: number;
    near?: number;
    far?: number;
    cameraSlot?: number;
  } = {}
): Camera3DDesc {
  return {
    kind: 'perspective',
    fovY: options.fovY ?? 60.0,
    near: options.near ?? 0.1,
    far: options.far ?? 1000.0,
    cameraSlot: options.cameraSlot ?? 0
  };
}

export function createPointLight3DPreset(
  options: {
    color?: [number, number, number];
    intensity?: number;
    range?: number;
  } = {}
): Light3DDesc {
  return {
    kind: 'point',
    range: options.range ?? 20.0,
    color: options.color ?? [1.0, 1.0, 1.0],
    intensity: options.intensity ?? 3.0
  };
}

export function createPbrMaterialPreset(
  options: {
    baseColor?: [number, number, number, number];
    roughness?: number;
    metallic?: number;
  } = {}
): Material3DDesc {
  return {
    surfaceType: 'opaque',
    baseColor: options.baseColor ?? [1.0, 1.0, 1.0, 1.0],
    roughness: options.roughness ?? 0.5,
    metallic: options.metallic ?? 0.0
  };
}
