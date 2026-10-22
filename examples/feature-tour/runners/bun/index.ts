import { GalfusBun } from '../../../../sdk/bun/galfus.ts';
import { runFeatureTour } from '../../tour_runner.ts';

runFeatureTour({ engine: new GalfusBun() }).catch((err) => {
  console.error('Fatal tour error:', err);
  process.exit(1);
});
