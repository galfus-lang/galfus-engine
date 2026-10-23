import { readFile } from 'node:fs/promises';

type Exception = { path: string; reason: string };
type Config = { maxLines: number; exceptions: Exception[] };

const SOURCE_EXTENSIONS = new Set(['rs', 'ts', 'wgsl']);
const CONFIG_PATH = '.agents/file-length-exceptions.json';

function lineCount(source: string): number {
  if (source.length === 0) return 0;
  return source.endsWith('\n') ? source.split('\n').length - 1 : source.split('\n').length;
}

async function trackedFiles(): Promise<string[]> {
  const gitProcess = Bun.spawn({
    cmd: ['git', 'ls-files', '--cached', '--others', '--exclude-standard'],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'inherit'
  });
  if ((await gitProcess.exited) !== 0) throw new Error('Unable to enumerate tracked files.');
  const paths = await new Response(gitProcess.stdout).text();
  return paths
    .split('\n')
    .filter(Boolean)
    .filter((path) => SOURCE_EXTENSIONS.has(path.split('.').pop() ?? ''));
}

async function main(): Promise<void> {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as Config;
  const exceptions = new Map(config.exceptions.map((entry) => [entry.path, entry]));
  const files = await trackedFiles();
  const failures: string[] = [];

  for (const path of files) {
    const lines = lineCount(await readFile(path, 'utf8'));
    const exception = exceptions.get(path);
    if (lines > config.maxLines && !exception) {
      failures.push(`${path}: ${lines} lines (maximum is ${config.maxLines})`);
    }
    if (lines <= config.maxLines && exception) {
      failures.push(`${path}: stale exception; file now has ${lines} lines`);
    }
  }

  for (const exception of config.exceptions) {
    if (!files.includes(exception.path))
      failures.push(`${exception.path}: exception path is not tracked`);
    if (!exception.reason.trim()) failures.push(`${exception.path}: exception requires a reason`);
  }

  if (failures.length > 0) {
    throw new Error(`File-length policy violations:\n${failures.join('\n')}`);
  }
  console.log(
    `✔ File-length policy passed (${files.length} source files, max ${config.maxLines} lines)`
  );
}

main().catch((error: Error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
