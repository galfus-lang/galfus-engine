/**
 * Realm 2D presets for quick entity and camera setup.
 */
import type { Camera2DDesc, Light2DDesc } from '@galfus/transport-types';

export function createOrthoCamera2DPreset(
  options: {
    orthoScale?: number;
    near?: number;
    far?: number;
  } = {}
): Camera2DDesc {
  return {
    orthoScale: options.orthoScale ?? 1.0,
    near: options.near ?? 0.0,
    far: options.far ?? 1000.0,
    active: true
  };
}

export function createPointLight2DPreset(
  options: {
    color?: [number, number, number];
    intensity?: number;
    range?: number;
  } = {}
): Light2DDesc {
  return {
    color: options.color ?? [1.0, 1.0, 1.0],
    intensity: options.intensity ?? 1.0,
    range: options.range ?? 200.0
  };
}
