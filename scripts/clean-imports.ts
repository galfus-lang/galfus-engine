import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';

const isCheck = process.argv.includes('--check');

interface ParsedImport {
  fullMatch: string;
  startIndex: number;
  endIndex: number;
  isTypeOnly: boolean;
  defaultImport?: string;
  namespaceImport?: string;
  namedImports: Array<{ name: string; alias?: string; isType: boolean }>;
  from: string;
  isSideEffect: boolean;
}

function parseImports(source: string): ParsedImport[] {
  const importRegex =
    /(?:^|\n)(import\s+(?:type\s+)?(?:(?:\s*\{[^}]*\}|\s*\*\s*as\s+[\w$]+|\s*[\w$]+)(?:\s*,\s*(?:\{[^}]*\}|\*\s*as\s+[\w$]+|[\w$]+))*)?\s*from\s*['"][^'"]+['"]\s*;?|import\s+['"][^'"]+['"]\s*;?)/g;

  const list: ParsedImport[] = [];
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(source)) !== null) {
    const raw = match[1]!;
    const startIndex = match.index + (match[0].startsWith('\n') ? 1 : 0);
    const endIndex = startIndex + raw.length;
    const clean = raw.replace(/;$/, '').trim();

    if (!clean.startsWith('import')) continue;

    const sideEffectMatch = /^import\s+['"]([^'"]+)['"]$/.exec(clean);
    if (sideEffectMatch) {
      list.push({
        fullMatch: raw,
        startIndex,
        endIndex,
        isTypeOnly: false,
        namedImports: [],
        from: sideEffectMatch[1]!,
        isSideEffect: true
      });
      continue;
    }

    const fromMatch = /^import\s+(type\s+)?([\s\S]+?)\s+from\s+['"]([^'"]+)['"]$/.exec(clean);
    if (!fromMatch) continue;

    const isTypeOnly = Boolean(fromMatch[1]);
    const clause = fromMatch[2]!.trim();
    const from = fromMatch[3]!;

    let defaultImport: string | undefined;
    let namespaceImport: string | undefined;
    const namedImports: Array<{ name: string; alias?: string; isType: boolean }> = [];

    let rest = clause;

    if (!rest.startsWith('{') && !rest.startsWith('*')) {
      const commaIdx = rest.indexOf(',');
      if (commaIdx !== -1) {
        defaultImport = rest.slice(0, commaIdx).trim();
        rest = rest.slice(commaIdx + 1).trim();
      } else {
        defaultImport = rest.trim();
        rest = '';
      }
    }

    if (rest.startsWith('*')) {
      const nsMatch = /^\*\s+as\s+([\w$]+)/.exec(rest);
      if (nsMatch) {
        namespaceImport = nsMatch[1];
        rest = '';
      }
    }

    if (rest.startsWith('{')) {
      const open = rest.indexOf('{');
      const close = rest.lastIndexOf('}');
      if (open !== -1 && close !== -1) {
        const inside = rest.slice(open + 1, close);
        const items = inside
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const item of items) {
          const itemMatch = /^(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(item);
          if (itemMatch) {
            namedImports.push({
              isType: Boolean(itemMatch[1]),
              name: itemMatch[2]!,
              alias: itemMatch[3]
            });
          }
        }
      }
    }

    list.push({
      fullMatch: raw,
      startIndex,
      endIndex,
      isTypeOnly,
      defaultImport,
      namespaceImport,
      namedImports,
      from,
      isSideEffect: false
    });
  }

  return list;
}

function cleanFileImports(source: string): string {
  const imports = parseImports(source);
  if (imports.length === 0) return source;

  // Build a string without any imports to collect body tokens
  let nonImportCode = '';
  let prevEnd = 0;
  for (const imp of imports) {
    nonImportCode += source.slice(prevEnd, imp.startIndex);
    prevEnd = imp.endIndex;
  }
  nonImportCode += source.slice(prevEnd);

  const bodyTokens = new Set(nonImportCode.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) ?? []);

  // Process imports in reverse order to apply text replacements cleanly
  const sortedImports = [...imports].sort((a, b) => b.startIndex - a.startIndex);
  let updated = source;

  for (const imp of sortedImports) {
    if (imp.isSideEffect) continue;

    let defaultImport = imp.defaultImport;
    if (defaultImport && !bodyTokens.has(defaultImport)) {
      defaultImport = undefined;
    }

    let namespaceImport = imp.namespaceImport;
    if (namespaceImport && !bodyTokens.has(namespaceImport)) {
      namespaceImport = undefined;
    }

    const namedImports = imp.namedImports.filter((item) => {
      const localName = item.alias ?? item.name;
      return bodyTokens.has(localName);
    });

    namedImports.sort((a, b) => (a.alias ?? a.name).localeCompare(b.alias ?? b.name));

    if (!defaultImport && !namespaceImport && namedImports.length === 0) {
      // Remove unused import statement completely
      updated = updated.slice(0, imp.startIndex) + updated.slice(imp.endIndex);
      continue;
    }

    const typePrefix = imp.isTypeOnly ? 'type ' : '';
    const parts: string[] = [];
    if (defaultImport) parts.push(defaultImport);
    if (namespaceImport) parts.push(`* as ${namespaceImport}`);
    if (namedImports.length > 0) {
      const namedStr = namedImports
        .map((item) => {
          const t = item.isType ? 'type ' : '';
          const as = item.alias ? ` as ${item.alias}` : '';
          return `${t}${item.name}${as}`;
        })
        .join(', ');
      parts.push(`{ ${namedStr} }`);
    }

    const newStatement = `import ${typePrefix}${parts.join(', ')} from '${imp.from}';`;
    updated = updated.slice(0, imp.startIndex) + newStatement + updated.slice(imp.endIndex);
  }

  return updated;
}

async function run(): Promise<void> {
  const rootDir = process.cwd();
  const prettierRcPath = path.resolve(rootDir, '.prettierrc');
  const prettierConfig = fs.existsSync(prettierRcPath)
    ? JSON.parse(fs.readFileSync(prettierRcPath, 'utf8'))
    : {};

  const globs = ['host/**/*.{ts,tsx}', 'sdk/**/*.{ts,tsx}', 'scripts/**/*.{ts,tsx}'];
  const targetFiles: string[] = [];

  for (const pattern of globs) {
    for await (const file of new Bun.Glob(pattern).scan({ cwd: rootDir })) {
      if (!file.endsWith('.d.ts') && !file.includes('node_modules')) {
        targetFiles.push(path.resolve(rootDir, file));
      }
    }
  }

  const changedFiles: string[] = [];

  for (const fileName of targetFiles) {
    const original = fs.readFileSync(fileName, 'utf8');
    const cleaned = cleanFileImports(original);

    if (cleaned !== original) {
      const formatted = await prettier.format(cleaned, {
        ...prettierConfig,
        filepath: fileName
      });

      if (formatted !== original) {
        changedFiles.push(fileName);
        if (!isCheck) {
          fs.writeFileSync(fileName, formatted, 'utf8');
        }
      }
    }
  }

  if (changedFiles.length > 0) {
    if (isCheck) {
      console.error(
        `\x1b[33m[clean-imports]\x1b[0m ${changedFiles.length} file(s) have unorganized or unused imports:`
      );
      for (const file of changedFiles) {
        console.error(`  - ${path.relative(rootDir, file)}`);
      }
      console.error('Run `bun run format` to clean and organize imports automatically.');
      process.exit(1);
    } else {
      console.log(
        `\x1b[32m[clean-imports]\x1b[0m Cleaned imports in ${changedFiles.length} file(s).`
      );
    }
  } else {
    console.log(
      `\x1b[32m[clean-imports]\x1b[0m All TypeScript files have clean and organized imports.`
    );
  }
}

run().catch((err: Error) => {
  console.error('\x1b[31m✖ clean-imports failed:\x1b[0m', err.message);
  process.exit(1);
});
