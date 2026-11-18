#!/usr/bin/env bun
import { Command } from 'commander';
import { runBuildCommand } from './build';
import { runInitCommand } from './init';
import { runApiSearchCommand } from './search';

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
    .option('--transport <transport>', 'Runtime transport (bun, node, or browser)')
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

  program
    .command('api-search <query...>')
    .description('Search Galfus Engine API documentation and code snippets')
    .option('-l, --limit <number>', 'Maximum number of results to display', '3')
    .option('-u, --update', 'Refresh local search index from remote documentation')
    .option('--json', 'Output search results as JSON')
    .action(async (queryParts: string[], opts) => {
      try {
        await runApiSearchCommand(queryParts, {
          limit: Number(opts.limit ?? 3),
          update: Boolean(opts.update),
          json: Boolean(opts.json)
        });
      } catch (err) {
        console.error(`API search failed:`, err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return program;
}

createCli().parse(process.argv);
