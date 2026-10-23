export interface Demo3d4BloomSettings {
  bloomEnabled: boolean;
  bloomIntensity: number;
  bloomThreshold: number;
}

export function createDemo3d4Environment(settings: Demo3d4BloomSettings): EnvironmentRealm3DDesc {
  return {
    ambientColor: [0.06, 0.07, 0.09, 1.0],
    clearColor: [0.015, 0.015, 0.025, 1.0],
    exposure: 1.0,
    skybox: {
      mode: 'procedural',
      skyColor: [0.15, 0.25, 0.55, 1.0],
      horizonColor: [0.45, 0.55, 0.7, 1.0],
      groundColor: [0.04, 0.05, 0.07, 1.0],
      sunDirection: [0.5, 0.75, 0.4, 0.0],
      sunColor: [1.0, 0.96, 0.88, 2.0],
      intensity: 0.9,
      sunSize: 0.03
    },
    outline: { enabled: true, width: 1.2, threshold: 0.2, strength: 0.6 },
    ssao: { enabled: true, radius: 0.45, bias: 0.025, power: 1.0, intensity: 0.5, blurRadius: 2 },
    bloom: {
      enabled: settings.bloomEnabled,
      threshold: settings.bloomThreshold,
      knee: 0.5,
      intensity: settings.bloomIntensity,
      scatter: 0.7
    }
  };
}
import type { EnvironmentRealm3DDesc } from '../../sdk/bun/galfus.ts';
