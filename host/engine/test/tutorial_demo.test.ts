import { describe, expect, it } from 'bun:test';
import { runTutorialDemo } from '../demo/tutorial';

describe('@galfus/engine > Tutorial Demo Integration', () => {
  it('executes full host-tutorial demo workflow without errors in headless mode', async () => {
    let succeeded = false;
    try {
      await runTutorialDemo({ headless: true, maxFrames: 10 });
      succeeded = true;
    } catch (err) {
      console.error('Tutorial demo execution error:', err);
      succeeded = false;
    }
    expect(succeeded).toBe(true);
  });
});
