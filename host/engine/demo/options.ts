/** Shared command-line options for host demos. */
export interface HostDemoOptions {
  headless?: boolean;
  maxFrames?: number;
}

export function resolveDemoOptions(options: HostDemoOptions): {
  headless: boolean;
  maxFrames: number | undefined;
} {
  const headless =
    options.headless ?? (process.argv.includes('--headless') || !process.env.DISPLAY);
  const index = process.argv.indexOf('--frames');
  const frameArgument = index >= 0 ? Number(process.argv[index + 1]) : undefined;
  const maxFrames = options.maxFrames ?? frameArgument ?? (headless ? 120 : undefined);
  if (maxFrames !== undefined && (!Number.isInteger(maxFrames) || maxFrames <= 0))
    throw new Error('--frames must be a positive integer.');
  return { headless, maxFrames };
}
