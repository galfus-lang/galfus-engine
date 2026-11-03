import { runFeatureTour } from '../../examples/feature-tour/tour_runner.ts';
import { GalfusBun } from '../../sdk/bun/galfus.ts';

export async function runDemoTour(): Promise<void> {
  await runFeatureTour({ engine: new GalfusBun() });
}
