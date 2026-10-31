import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import ts from 'typescript';

const isCheck = process.argv.includes('--check');

function applyTextChanges(text: string, textChanges: readonly ts.TextChange[]): string {
  const sorted = [...textChanges].sort((a, b) => b.span.start - a.span.start);
  let result = text;
  for (const change of sorted) {
    result =
      result.slice(0, change.span.start) +
      change.newText +
      result.slice(change.span.start + change.span.length);
  }
  return result;
}

async function run(): Promise<void> {
  const rootDir = process.cwd();
  const prettierRcPath = path.resolve(rootDir, '.prettierrc');
  const prettierConfig = fs.existsSync(prettierRcPath)
    ? JSON.parse(fs.readFileSync(prettierRcPath, 'utf8'))
    : {};

  const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    throw new Error('Could not find tsconfig.json in project root');
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);

  const targetFiles = parsed.fileNames.filter(
    (f) =>
      (f.endsWith('.ts') || f.endsWith('.tsx')) &&
      !f.endsWith('.d.ts') &&
      !f.includes('node_modules')
  );

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => targetFiles,
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      if (fs.existsSync(fileName)) {
        return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
      }
      return undefined;
    },
    getCurrentDirectory: () => rootDir,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const changedFiles: string[] = [];

  for (const fileName of targetFiles) {
    const changes = service.organizeImports({ type: 'file', fileName }, {}, {});

    if (changes.length > 0 && changes.some((c) => c.textChanges.length > 0)) {
      const original = fs.readFileSync(fileName, 'utf8');
      let updated = original;
      for (const change of changes) {
        updated = applyTextChanges(updated, change.textChanges);
      }

      if (updated !== original) {
        const formatted = await prettier.format(updated, {
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
