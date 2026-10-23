import type { EnvironmentRealm3DDesc } from '../../sdk/bun/galfus.ts';

export function createDemo3d7Environment(bloomEnabled: boolean): EnvironmentRealm3DDesc {
  return {
    ambientColor: [0.06, 0.07, 0.1, 1.0],
    clearColor: [0.02, 0.025, 0.04, 1.0],
    fogMode: 'exponential',
    fogDensity: 0.012,
    fogColor: [0.03, 0.035, 0.055, 1.0],
    exposure: 1.15,
    bloom: {
      enabled: bloomEnabled,
      threshold: 0.65,
      knee: 0.35,
      intensity: 1.1,
      scatter: 0.75
    }
  };
}
