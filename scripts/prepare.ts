type Command = {
  label: string;
  args: string[];
};

function requireCommand(command: string, installation: string): void {
  if (Bun.which(command)) {
    return;
  }

  throw new Error(`${command} is required. ${installation}`);
}

async function runCommand(command: Command): Promise<void> {
  console.log(`\x1b[36m==> [prepare]\x1b[0m ${command.label}`);
  const proc = Bun.spawn({
    cmd: command.args,
    cwd: process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit'
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${command.label}`);
  }
}

async function main(): Promise<void> {
  requireCommand('rustup', 'Install Rust through https://rustup.rs/.');
  requireCommand(
    'uv',
    'Install uv through https://docs.astral.sh/uv/getting-started/installation/.'
  );
  requireCommand(
    'clang-format',
    'Install the LLVM/Clang package provided by your operating system.'
  );
  requireCommand('dotnet', 'Install the .NET 10 SDK from https://dotnet.microsoft.com/download.');
  requireCommand('stylua', 'Run bun install to install the local StyLua devDependency.');

  const commands: Command[] = [];
  if (!Bun.which('rustfmt')) {
    commands.push({
      label: 'install rustfmt',
      args: ['rustup', 'component', 'add', 'rustfmt']
    });
  }
  commands.push({
    label: 'install ruff',
    args: ['uv', 'tool', 'install', 'ruff']
  });

  for (const command of commands) {
    await runCommand(command);
  }

  console.log('\x1b[32m✔ Formatting tools are ready\x1b[0m');
}

main().catch((error: unknown) => {
  console.error(
    '\x1b[31m✖ Tool preparation failed:\x1b[0m',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
