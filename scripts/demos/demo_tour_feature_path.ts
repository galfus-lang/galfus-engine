import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { runFeatureTour } from '../../examples/feature-tour/tour_runner.ts';

export async function runDemoTour(): Promise<void> {
  await runFeatureTour({ engine: new GalfusBun() });
}
