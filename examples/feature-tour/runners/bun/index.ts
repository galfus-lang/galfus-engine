import { runFeatureTour } from '../../tour_runner.ts';

runFeatureTour().catch((err) => {
  console.error('Fatal tour error:', err);
  process.exit(1);
});
