import { autocomplete, cancel, intro, isCancel, log, outro, select } from '@clack/prompts';
import { Command } from 'commander';
import {
  DEMO_CATALOG,
  DEMO_CATEGORIES,
  type DemoDescriptor,
  filterDemosByCategory,
  findDemo,
  fuzzySearchDemos
} from './catalog';
import { parsePositiveIntFlag } from './common/options';

interface CliOptions {
  headless?: boolean;
  frames?: string;
  list?: boolean;
  category?: string;
  font?: string;
}

function formatCatalogTable(categoryFilter?: string): string {
  const lines: string[] = [];
  lines.push('================================================================');
  lines.push('   GALFUS ENGINE - UNIFIED HOST & FEATURE DEMO CATALOG');
  lines.push('================================================================');

  for (const category of DEMO_CATEGORIES) {
    if (
      categoryFilter &&
      categoryFilter.toLowerCase() !== 'all' &&
      !category.toLowerCase().includes(categoryFilter.toLowerCase())
    ) {
      continue;
    }
    const entries = DEMO_CATALOG.filter((d) => d.category === category);
    if (entries.length === 0) continue;

    lines.push(`\n[${category}]`);
    for (const demo of entries) {
      const idCol = demo.id.padEnd(13, ' ');
      lines.push(`  ${idCol} ${demo.title}`);
      lines.push(`                ${demo.description}`);
    }
  }

  lines.push('\nUsage:');
  lines.push('  bun demo                         Launch interactive fuzzy catalog');
  lines.push('  bun demo <id>                    Run a specific demo by ID or alias');
  lines.push('  bun demo <id> --headless -f 60   Run headless smoke validation');
  lines.push(
    `  bun demo --list                  List all ${DEMO_CATALOG.length} demos by category`
  );
  lines.push('================================================================');
  return lines.join('\n');
}

const BACK_OPTION = '__back__';
const EXIT_OPTION = '__exit__';
const FUZZY_OPTION = '__fuzzy__';

async function runDemoInSubprocess(demo: DemoDescriptor, opts: CliOptions): Promise<number> {
  const args = [process.execPath, import.meta.path, demo.id];
  if (opts.headless) args.push('--headless');
  if (opts.frames !== undefined) args.push('--frames', opts.frames);
  if (opts.font !== undefined) args.push('--font', opts.font);

  const onSigInt = () => {
    // Let the child demo process handle Ctrl+C without killing the interactive menu.
  };
  process.on('SIGINT', onSigInt);

  try {
    const proc = Bun.spawn(args, {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      env: { ...process.env, GALFUS_DEMO_CHILD: '1' }
    });
    return await proc.exited;
  } finally {
    process.off('SIGINT', onSigInt);
  }
}

async function runInteractiveLoop(opts: CliOptions): Promise<void> {
  intro('Galfus Engine - Interactive Demo Catalog');

  let selectedCategory: string | undefined = opts.category;
  let browseMode: 'menu' | 'list' = selectedCategory ? 'list' : 'menu';

  while (true) {
    if (browseMode === 'menu') {
      const modeChoice = await select({
        message: `How would you like to browse the ${DEMO_CATALOG.length} Galfus Engine demos?`,
        options: [
          {
            value: FUZZY_OPTION,
            label: 'Fuzzy Search All Demos',
            hint: 'Type keywords, IDs, or tags (e.g. particles, physics, ui, portal)'
          },
          ...DEMO_CATEGORIES.map((cat) => ({
            value: cat,
            label: cat,
            hint: `${DEMO_CATALOG.filter((d) => d.category === cat).length} demos`
          })),
          {
            value: EXIT_OPTION,
            label: 'Exit',
            hint: 'Close the demo catalog'
          }
        ]
      });

      if (isCancel(modeChoice) || modeChoice === EXIT_OPTION) {
        outro('Demo catalog closed.');
        return;
      }

      selectedCategory = modeChoice === FUZZY_OPTION ? undefined : String(modeChoice);
      browseMode = 'list';
    }

    const candidatePool = filterDemosByCategory(selectedCategory);
    if (candidatePool.length === 0) {
      log.warn(`No demos matched category "${selectedCategory}".`);
      selectedCategory = undefined;
      browseMode = 'menu';
      continue;
    }

    const chosenId = await autocomplete({
      message: selectedCategory
        ? `Select a demo in [${selectedCategory}] (type to filter):`
        : 'Search demo by ID, title, or tag (type to fuzzy-filter):',
      options: [
        {
          value: BACK_OPTION,
          label: '← Back to categories',
          hint: 'Return to category selection'
        },
        ...candidatePool.map((d) => ({
          value: d.id,
          label: `[${d.id}] ${d.title}`,
          hint: `${d.category} — ${d.tags.join(', ')}`
        }))
      ],
      placeholder: 'Type e.g. 3d5, phys3d, particles, shadows, tutorial...',
      maxItems: 10
    });

    if (isCancel(chosenId) || chosenId === BACK_OPTION) {
      selectedCategory = undefined;
      browseMode = 'menu';
      continue;
    }

    const targetDemo = findDemo(String(chosenId));
    if (!targetDemo) {
      log.warn(`Demo "${String(chosenId)}" not found.`);
      continue;
    }

    log.step(`Launching [${targetDemo.id}] ${targetDemo.title}...`);
    const exitCode = await runDemoInSubprocess(targetDemo, opts);
    if (exitCode === 0 || exitCode === 130) {
      log.info(`Closed [${targetDemo.id}] ${targetDemo.title} — returning to catalog.`);
    } else {
      log.error(`Demo [${targetDemo.id}] exited with code ${exitCode} — returning to catalog.`);
    }
  }
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program
    .name('bun demo')
    .description('Galfus Engine Unified Demo Catalog & Interactive Runner')
    .argument('[demo...]', 'Demo ID, alias, or search query (or "help" to list all demos)')
    .option('--headless', 'Run without creating a native window')
    .option('-f, --frames <count>', 'Stop automatically after rendering <count> frames')
    .option('-l, --list', 'Print the full demo catalog grouped by category')
    .option('-c, --category <category>', 'Filter catalog by category')
    .option('--font <path>', 'Custom TTF/OTF font path')
    .helpOption('-h, --help', 'Display help for command')
    .addHelpText('after', `\n${formatCatalogTable()}`);

  program.parse(argv);

  const rawArgs = program.args;
  let demoArg: string | undefined;
  if (rawArgs.length > 0) {
    if (rawArgs[0] === 'run' && rawArgs.length > 1) {
      demoArg = rawArgs.slice(1).join(' ');
    } else {
      demoArg = rawArgs.join(' ');
    }
  }
  const opts = program.opts<CliOptions>();

  if (demoArg?.toLowerCase() === 'help' || opts.list) {
    console.log(formatCatalogTable(opts.category));
    return;
  }

  let maxFrames: number | undefined;
  if (opts.frames !== undefined) {
    maxFrames = parsePositiveIntFlag(opts.frames, '--frames');
  }

  let targetDemo: DemoDescriptor | null | undefined;

  if (demoArg) {
    targetDemo = findDemo(demoArg);
    if (!targetDemo) {
      const suggestions = fuzzySearchDemos(demoArg, opts.category).slice(0, 5);
      if (!process.stdin.isTTY || opts.headless) {
        console.error(`Unknown host demo: "${demoArg}".`);
        if (suggestions.length > 0) {
          console.error(
            `Did you mean: ${suggestions.map((s) => `${s.id} (${s.title})`).join(', ')}?`
          );
        }
        console.error(formatCatalogTable());
        process.exit(1);
      }

      intro(`No exact demo named "${demoArg}" — showing closest fuzzy matches`);
      const fallbackChoice = await select({
        message: `Select a matching demo for "${demoArg}":`,
        options: (suggestions.length > 0 ? suggestions : DEMO_CATALOG).map((d) => ({
          value: d.id,
          label: `[${d.id}] ${d.title}`,
          hint: d.description
        }))
      });
      if (isCancel(fallbackChoice)) {
        cancel('Demo launch cancelled.');
        return;
      }
      targetDemo = findDemo(String(fallbackChoice));
    }
  } else if (process.stdin.isTTY && !opts.headless) {
    await runInteractiveLoop(opts);
    return;
  } else {
    console.log(formatCatalogTable(opts.category));
    return;
  }

  if (!targetDemo) {
    process.exit(1);
  }

  const isInteractiveSingle =
    process.stdin.isTTY && !opts.headless && process.env.GALFUS_DEMO_CHILD !== '1';

  if (isInteractiveSingle) {
    log.step(`Launching [${targetDemo.id}] ${targetDemo.title}...`);
  }

  await targetDemo.run({
    headless: Boolean(opts.headless),
    maxFrames,
    fontPath: opts.font,
    title: `Galfus Demo [${targetDemo.id}]: ${targetDemo.title}`
  });

  if (isInteractiveSingle) {
    outro(`Completed [${targetDemo.id}] ${targetDemo.title}`);
  }
}

if (import.meta.main) {
  try {
    await runCli(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
