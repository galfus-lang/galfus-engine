type Command = {
  label: string;
  args: string[];
};

const COMMANDS: Command[] = [
  {
    label: 'cargo fmt',
    args: ['cargo', 'fmt', '--all']
  },
  {
    label: 'prettier',
    args: ['bunx', 'prettier', '--write', '.']
  }
];

async function runCommand(cmd: Command): Promise<void> {
  console.log(`\x1b[36m==> [format]\x1b[0m ${cmd.label}`);
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
  for (const cmd of COMMANDS) {
    await runCommand(cmd);
  }
  console.log('\x1b[32m✔ Formatting completed successfully\x1b[0m');
}

main().catch((err: Error) => {
  console.error('\x1b[31m✖ Formatting failed:\x1b[0m', err.message);
  process.exit(1);
});
