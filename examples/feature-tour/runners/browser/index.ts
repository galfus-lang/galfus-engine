import { startBrowserTourServer } from './server.ts';

function readPort(): number {
  const portFlag = Bun.argv.indexOf('--port');
  if (portFlag === -1) {
    return 3000;
  }

  const value = Number(Bun.argv[portFlag + 1]);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error('The --port option requires an integer from 0 through 65535.');
  }
  return value;
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];

  try {
    Bun.spawn({ cmd: command, stdout: 'ignore', stderr: 'ignore' });
  } catch (error) {
    console.warn(`Unable to open a browser automatically: ${String(error)}`);
  }
}

async function main(): Promise<void> {
  const server = await startBrowserTourServer(readPort());
  console.log(`✔ Browser feature tour available at ${server.url}`);

  if (!Bun.argv.includes('--no-open')) {
    openBrowser(server.url);
  }

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      server.stop();
      resolve();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

main().catch((error: unknown) => {
  console.error('✖ Browser feature tour failed:', error);
  process.exit(1);
});
