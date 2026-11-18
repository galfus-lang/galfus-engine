type Command = {
  label: string;
  args: string[];
  requiredBinary?: string;
  resolveArgs?: () => string[] | null;
};

const isCheck = Bun.argv.includes('--check');
const isCI = Boolean(process.env.CI);

const COMMANDS: Command[] = [
  {
    label: 'cargo fmt',
    args: ['cargo', 'fmt', '--all', ...(isCheck ? ['--check'] : [])],
    requiredBinary: 'cargo'
  },
  {
    label: 'clean imports (ts)',
    args: ['bun', 'scripts/clean-imports.ts', ...(isCheck ? ['--check'] : [])]
  },
  {
    label: 'prettier',
    args: ['bunx', 'prettier', isCheck ? '--check' : '--write', '.']
  },
  {
    label: 'clang-format',
    args: [
      'clang-format',
      ...(isCheck ? ['--dry-run', '--Werror'] : ['-i']),
      'examples/feature-tour/runners/c/main.c'
    ],
    requiredBinary: 'clang-format'
  },
  {
    label: 'ruff',
    args: [],
    resolveArgs: () => {
      if (Bun.which('uv')) {
        return [
          'uv',
          'tool',
          'run',
          'ruff',
          'format',
          ...(isCheck ? ['--check'] : []),
          'examples/feature-tour/runners/python'
        ];
      }
      if (Bun.which('ruff')) {
        return [
          'ruff',
          'format',
          ...(isCheck ? ['--check'] : []),
          'examples/feature-tour/runners/python'
        ];
      }
      return null;
    }
  },
  {
    label: 'stylua',
    args: [],
    resolveArgs: () => {
      if (Bun.which('stylua')) {
        return ['stylua', ...(isCheck ? ['--check'] : []), 'examples/feature-tour/runners/lua'];
      }
      return [
        'bunx',
        'stylua',
        ...(isCheck ? ['--check'] : []),
        'examples/feature-tour/runners/lua'
      ];
    }
  },
  {
    label: 'dotnet format',
    args: [
      'dotnet',
      'format',
      'examples/feature-tour/runners/csharp/FeatureTour.csproj',
      ...(isCheck ? ['--verify-no-changes'] : [])
    ],
    requiredBinary: 'dotnet'
  }
];

async function runCommand(cmd: Command): Promise<void> {
  const args = cmd.resolveArgs ? cmd.resolveArgs() : cmd.args;
  if (!args) {
    if (isCI) {
      throw new Error(`Required tool for '${cmd.label}' not found in PATH on CI.`);
    }
    console.log(`\x1b[33m==> [format]\x1b[0m ${cmd.label} (skipped: tool not found in $PATH)`);
    return;
  }

  const binary = cmd.requiredBinary ?? args[0]!;
  if (!Bun.which(binary)) {
    if (isCI) {
      throw new Error(`Executable '${binary}' required for '${cmd.label}' not found in PATH.`);
    }
    console.log(`\x1b[33m==> [format]\x1b[0m ${cmd.label} (skipped: ${binary} not found in $PATH)`);
    return;
  }

  console.log(`\x1b[36m==> [format]\x1b[0m ${cmd.label}`);
  const proc = Bun.spawn({
    cmd: args,
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
  console.log(
    `\x1b[32m✔ Formatting ${isCheck ? 'checks passed' : 'completed'} successfully\x1b[0m`
  );
}

main().catch((err: Error) => {
  console.error('\x1b[31m✖ Formatting failed:\x1b[0m', err.message);
  process.exit(1);
});
