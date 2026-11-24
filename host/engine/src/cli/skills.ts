import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import skillsBundle from './skills-bundle.json';
import type { ProjectConfig } from './templates';

export const GALFUS_SKILLS: Readonly<Record<string, string>> = skillsBundle;

export function createRootAgentsMd(): string {
  return `# Agent Guidelines

All agent rules, project configuration, and Galfus Engine skills are defined in [.agents/AGENTS.md](.agents/AGENTS.md) and [.agents/skills/](.agents/skills/).

> [!IMPORTANT]
> Refer to [.agents/AGENTS.md](.agents/AGENTS.md) and the modular skills in [.agents/skills/](.agents/skills/) before modifying or writing Galfus Engine code.
`;
}

export function createProjectAgentsMd(config: ProjectConfig): string {
  const transportPkg =
    config.transport === 'bun'
      ? '@galfus/transport-bun'
      : config.transport === 'node'
        ? '@galfus/transport-node'
        : '@galfus/transport-browser';

  const devCmd =
    config.transport === 'bun'
      ? 'bun run dev'
      : config.transport === 'node'
        ? 'npm run dev'
        : 'npm run dev (Vite dev server)';

  const buildCmd =
    config.transport === 'browser' ? 'npm run build (Vite web bundle)' : 'galfus-engine build';

  return `# ${config.name} - AI Agent Instructions

## Project Configuration

- **Engine**: Galfus Engine (\`@galfus/engine\`)
- **Transport**: \`${config.transport}\` (\`${transportPkg}\`)
- **Starter Template**: \`${config.template}\`
- **Entry Point**: \`src/main.ts\`
- **Run Dev**: \`${devCmd}\`
- **Build**: \`${buildCmd}\`

## Galfus Engine Skills Reference

Before implementing game features, consult the specialized skills in \`.agents/skills/\`:

- **[galfus-core](skills/galfus-core/SKILL.md)**: Runtime lifecycle, Multiverse presentation graph, ECS (entities, custom components, queries, 4-stage systems), input events, and spatial audio.
- **[galfus-realm-3d](skills/galfus-realm-3d/SKILL.md)**: 3D scenes, cameras, PBR materials, lights/shadows, layer masks, core IK & skinning, Forward PBR decals/occluded projectors, and UV-space tattoo baking.
- **[galfus-realm-2d](skills/galfus-realm-2d/SKILL.md)**: 2D orthographic cameras, sprites, 2D dynamic lights, materials, sprite sheets, and layer masks.
- **[galfus-realm-3d-helpers](skills/galfus-realm-3d-helpers/SKILL.md)**: Loading and instantiating \`.gltf\`, \`.glb\`, and \`.zip\` 3D models with \`@galfus/gltf-loader\`.
- **[galfus-realm-2d-helpers](skills/galfus-realm-2d-helpers/SKILL.md)**: Building HUDs, buttons, panels, dialogs, and anchored layouts with \`@galfus/ui\`.
- **[galfus-animation](skills/galfus-animation/SKILL.md)**: Skeletal/keyframe animations (\`AnimationClip\`, \`AnimationPlayer3D\`) and native property transitions (models, lights, projectors/decals, IK targets).
- **[galfus-physics-3d](skills/galfus-physics-3d/SKILL.md)**: 3D Rapier physics via \`attachPhysics3D\`, rigid bodies, colliders (including \`triMesh\` and \`heightfield\`), impulses, raycasting, and spherecasting.
- **[galfus-physics-2d](skills/galfus-physics-2d/SKILL.md)**: 2D Rapier physics via \`attachPhysics2D\`, 2D colliders, sensors, and point queries.
`;
}

export async function scaffoldAgentFiles(projectDir: string, config: ProjectConfig): Promise<void> {
  const agentsDir = resolve(projectDir, '.agents');
  const skillsDir = resolve(agentsDir, 'skills');

  await mkdir(skillsDir, { recursive: true });
  await writeFile(resolve(projectDir, 'AGENTS.md'), createRootAgentsMd(), 'utf-8');
  await writeFile(resolve(agentsDir, 'AGENTS.md'), createProjectAgentsMd(config), 'utf-8');

  for (const [skillName, content] of Object.entries(GALFUS_SKILLS)) {
    const skillFolder = resolve(skillsDir, skillName);
    await mkdir(skillFolder, { recursive: true });
    await writeFile(resolve(skillFolder, 'SKILL.md'), content, 'utf-8');
  }
}
