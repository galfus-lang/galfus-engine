import { describe, expect, it } from 'bun:test';

async function runCli(...args: string[]) {
  const process = Bun.spawn(['bun', 'host:demo', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text()
  ]);
  return { code, stdout, stderr };
}

describe('host demo command', () => {
  it('lists the available demos and reports an unknown name', async () => {
    const help = await runCli('help');
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('interaction');
    expect(help.stdout).toContain('tutorial');
    const unknown = await runCli('does-not-exist');
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('Unknown host demo');
  });

  it('forwards headless and frame options to the interaction demo', async () => {
    const result = await runCli('interaction', '--headless', '--frames', '1');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Running headless smoke test');
  }, 15000);

  it('forwards headless and frame options to the tutorial', async () => {
    const result = await runCli('tutorial', '--headless', '--frames', '1');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Reached target frame count of 1');
  }, 15000);

  it('rejects invalid frame counts before starting the tutorial', async () => {
    const result = await runCli('tutorial', '--headless', '--frames', 'invalid');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--frames must be a positive integer');
  });
});
