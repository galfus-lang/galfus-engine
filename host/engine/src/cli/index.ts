#!/usr/bin/env bun
import { Command } from 'commander';
import { runBuildCommand } from './build';
import { runInitCommand } from './init';

export function createCli(): Command {
  const program = new Command();

  program
    .name('galfus-engine')
    .description('Official CLI for Galfus Engine (Build & Scaffold)')
    .version('0.1.0');

  program
    .command('init [project-name]')
    .description('Initialize a new Galfus Engine game project')
    .option('-t, --template <template>', 'Starter template (3d-scene, 2d-scene, physics)')
    .option('--transport <transport>', 'Runtime transport (bun or node)')
    .option('-d, --directory <dir>', 'Target directory to create the project in')
    .action(async (name, opts) => {
      try {
        await runInitCommand(name, opts);
      } catch (err) {
        console.error(`Error during init:`, err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command('build')
    .description('Compile game into a standalone binary with side-by-side native library')
    .option('-e, --entry <path>', 'Entry script file (e.g. src/main.ts)')
    .option(
      '-t, --target <target>',
      'Target platform (linux-x64, windows-x64, darwin-arm64, darwin-x64)'
    )
    .option('-o, --out <dir>', 'Output destination directory', 'dist')
    .option('-n, --name <name>', 'Output binary name')
    .option('--transport <transport>', 'Force transport type (bun or node)')
    .action(async (opts) => {
      try {
        await runBuildCommand(opts);
      } catch (err) {
        console.error(`Build failed:`, err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return program;
}

createCli().parse(process.argv);
