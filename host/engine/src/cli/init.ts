import { cancel, intro, isCancel, log, outro, select, text } from '@clack/prompts';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createGitIgnore,
  createMainScript,
  createPackageJson,
  createReadme,
  createTsConfig,
  type ProjectConfig,
  type ProjectTemplate,
  type ProjectTransport
} from './templates';

export interface InitOptions {
  name?: string;
  template?: string;
  transport?: string;
  directory?: string;
}

export async function runInitCommand(
  projectNameArg?: string,
  options: InitOptions = {}
): Promise<void> {
  const isInteractive = process.stdin.isTTY && !options.template;

  let name = projectNameArg ?? options.name;
  let template = options.template as ProjectTemplate | undefined;
  let transport = options.transport as ProjectTransport | undefined;

  if (isInteractive) {
    intro('Galfus Engine - Initialize Game Project');

    if (!name) {
      const nameInput = await text({
        message: 'What is your game project name?',
        placeholder: 'my-galfus-game',
        initialValue: 'my-galfus-game',
        validate(val) {
          if (!val || val.trim().length === 0) return 'Project name is required';
          if (!/^[a-zA-Z0-9_-]+$/.test(val.trim()))
            return 'Use only letters, numbers, hyphens, and underscores';
          return undefined;
        }
      });
      if (isCancel(nameInput)) {
        cancel('Project initialization cancelled.');
        process.exit(0);
      }
      name = String(nameInput).trim();
    }

    if (!transport) {
      const transportChoice = await select({
        message: 'Which runtime transport do you want to use?',
        options: [
          {
            value: 'bun',
            label: 'Bun (@galfus/transport-bun)',
            hint: 'Fastest FFI, instant start, standalone compilation'
          },
          {
            value: 'node',
            label: 'Node.js (@galfus/transport-node)',
            hint: 'Node-API native addon'
          }
        ]
      });
      if (isCancel(transportChoice)) {
        cancel('Project initialization cancelled.');
        process.exit(0);
      }
      transport = transportChoice as ProjectTransport;
    }

    if (!template) {
      const templateChoice = await select({
        message: 'Select a starter template:',
        options: [
          {
            value: '3d-scene',
            label: '3D Scene Starter',
            hint: 'Lighting, PBR materials, spinning cube and camera'
          },
          {
            value: 'physics',
            label: '3D Physics Sandbox',
            hint: 'Rapier 3D rigid bodies, ground and collision dynamics'
          },
          {
            value: '2d-scene',
            label: '2D Scene Starter',
            hint: '2D sprites, dynamic lights and smooth frame loop'
          }
        ]
      });
      if (isCancel(templateChoice)) {
        cancel('Project initialization cancelled.');
        process.exit(0);
      }
      template = templateChoice as ProjectTemplate;
    }
  } else {
    name = name || 'galfus-game';
    template = (template || '3d-scene') as ProjectTemplate;
    transport = (transport || 'bun') as ProjectTransport;
  }

  const validTemplates: ProjectTemplate[] = ['3d-scene', '2d-scene', 'physics'];
  if (!validTemplates.includes(template!)) {
    console.error(`Invalid template: "${template}". Available: ${validTemplates.join(', ')}`);
    process.exit(1);
  }

  const validTransports: ProjectTransport[] = ['bun', 'node'];
  if (!validTransports.includes(transport!)) {
    console.error(`Invalid transport: "${transport}". Available: ${validTransports.join(', ')}`);
    process.exit(1);
  }

  const projectDir = resolve(options.directory ?? process.cwd(), name);
  if (existsSync(projectDir)) {
    console.error(`Directory already exists: "${projectDir}"`);
    process.exit(1);
  }

  const config: ProjectConfig = {
    name,
    template: template!,
    transport: transport!
  };

  await mkdir(resolve(projectDir, 'src'), { recursive: true });
  await writeFile(resolve(projectDir, 'package.json'), createPackageJson(config), 'utf-8');
  await writeFile(resolve(projectDir, 'tsconfig.json'), createTsConfig(), 'utf-8');
  await writeFile(resolve(projectDir, '.gitignore'), createGitIgnore(), 'utf-8');
  await writeFile(resolve(projectDir, 'README.md'), createReadme(config), 'utf-8');
  await writeFile(resolve(projectDir, 'src/main.ts'), createMainScript(config), 'utf-8');

  if (isInteractive) {
    log.success(`Created project "${name}" in ${projectDir}`);
    outro(`Next steps:\n  cd ${name}\n  bun install\n  bun run dev\n  bun run build`);
  } else {
    console.log(`[galfus-engine init] Project created at: ${projectDir}`);
  }
}
