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
  lines.push('  bun demo --list                  List all 27 demos by category');
  lines.push('================================================================');
  return lines.join('\n');
}

async function runInteractiveBrowser(initialCategory?: string): Promise<DemoDescriptor | null> {
  intro('Galfus Engine - Interactive Demo Catalog');

  let selectedCategory = initialCategory;
  if (!selectedCategory) {
    const modeChoice = await select({
      message: 'How would you like to browse the 27 Galfus Engine demos?',
      options: [
        {
          value: '__fuzzy__',
          label: 'Fuzzy Search All Demos',
          hint: 'Type keywords, IDs, or tags (e.g. particles, physics, ui, portal)'
        },
        ...DEMO_CATEGORIES.map((cat) => ({
          value: cat,
          label: cat,
          hint: `${DEMO_CATALOG.filter((d) => d.category === cat).length} demos`
        }))
      ]
    });

    if (isCancel(modeChoice)) {
      cancel('Demo selection cancelled.');
      return null;
    }

    if (modeChoice !== '__fuzzy__') {
      selectedCategory = modeChoice as string;
    }
  }

  const candidatePool = filterDemosByCategory(selectedCategory);
  if (candidatePool.length === 0) {
    cancel(`No demos matched category "${selectedCategory}".`);
    return null;
  }

  const chosenId = await autocomplete({
    message: selectedCategory
      ? `Select a demo in [${selectedCategory}] (type to filter):`
      : 'Search demo by ID, title, or tag (type to fuzzy-filter):',
    options: candidatePool.map((d) => ({
      value: d.id,
      label: `[${d.id}] ${d.title}`,
      hint: `${d.category} — ${d.tags.join(', ')}`
    })),
    placeholder: 'Type e.g. 3d5, phys3d, particles, shadows, tutorial...',
    maxItems: 10
  });

  if (isCancel(chosenId)) {
    cancel('Demo selection cancelled.');
    return null;
  }

  return findDemo(String(chosenId)) ?? null;
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
    .option('--font <path>', 'Custom TTF/OTF font path (used by text-input demo)')
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
    targetDemo = await runInteractiveBrowser(opts.category);
    if (!targetDemo) return;
  } else {
    console.log(formatCatalogTable(opts.category));
    return;
  }

  if (!targetDemo) {
    process.exit(1);
  }

  if (process.stdin.isTTY && !opts.headless) {
    log.step(`Launching [${targetDemo.id}] ${targetDemo.title}...`);
  }

  await targetDemo.run({
    headless: Boolean(opts.headless),
    maxFrames,
    fontPath: opts.font,
    title: `Galfus Demo [${targetDemo.id}]: ${targetDemo.title}`
  });

  if (process.stdin.isTTY && !opts.headless) {
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
