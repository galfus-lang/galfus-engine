type Command = {
  label: string;
  args: string[];
  category: 'core' | 'rust-native' | 'rust-wasm';
};

const skipRust = Bun.argv.includes('--no-rust');

const COMMANDS: Command[] = [
  {
    label: 'file-length policy',
    args: ['bun', 'scripts/check-file-lengths.ts'],
    category: 'core'
  },
  {
    label: 'bun --check',
    args: ['bun', '--check'],
    category: 'core'
  },
  {
    label: 'cargo clippy',
    args: ['cargo', 'clippy', '--workspace', '--all-targets', '--', '-D', 'warnings'],
    category: 'rust-native'
  },
  {
    label: 'cargo clippy (browser WASM)',
    args: [
      'cargo',
      'clippy',
      '--locked',
      '--package',
      'galfus-browser',
      '--target',
      'wasm32-unknown-unknown',
      '--',
      '-D',
      'warnings'
    ],
    category: 'rust-wasm'
  }
];

async function runCommand(cmd: Command): Promise<void> {
  console.log(`\x1b[36m==> [check]\x1b[0m ${cmd.label}`);
  const proc = Bun.spawn({
    cmd: cmd.args,
    cwd: process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit'
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${cmd.label}`);
  }
}

async function main(): Promise<void> {
  const activeCommands = skipRust ? COMMANDS.filter((cmd) => cmd.category === 'core') : COMMANDS;
  for (const cmd of activeCommands) {
    await runCommand(cmd);
  }
  console.log('\x1b[32m✔ Checks passed successfully\x1b[0m');
}

main().catch((err: Error) => {
  console.error('\x1b[31m✖ Checks failed:\x1b[0m', err.message);
  process.exit(1);
});
