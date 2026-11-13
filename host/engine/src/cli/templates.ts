export type ProjectTemplate = '3d-scene' | '2d-scene' | 'physics';
export type ProjectTransport = 'bun' | 'node';

export interface ProjectConfig {
  name: string;
  template: ProjectTemplate;
  transport: ProjectTransport;
}

export async function fetchLatestPackageVersion(
  packageName: string,
  fallback = 'latest'
): Promise<string> {
  try {
    const registryBase = (
      process.env.NPM_CONFIG_REGISTRY ||
      process.env.npm_config_registry ||
      'https://registry.npmjs.org'
    ).replace(/\/+$/, '');

    const res = await fetch(`${registryBase}/${packageName}/latest`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000)
    });

    if (res.ok) {
      const data = (await res.json()) as { version?: string };
      if (data && typeof data.version === 'string' && data.version.trim()) {
        return `^${data.version.trim()}`;
      }
    }
  } catch {
    // Offline or request failure; gracefully use fallback
  }

  return fallback;
}

export async function resolveProjectVersions(
  config: ProjectConfig,
  customVersions?: Record<string, string>
): Promise<Record<string, string>> {
  const pkgs = [
    '@galfus/engine',
    config.transport === 'bun' ? '@galfus/transport-bun' : '@galfus/transport-node',
    '@types/bun',
    'typescript'
  ];

  const results: Record<string, string> = { ...customVersions };
  const toFetch = pkgs.filter((pkg) => !results[pkg]);

  if (toFetch.length > 0) {
    const fetched = await Promise.all(
      toFetch.map(async (pkg) => ({
        pkg,
        version: await fetchLatestPackageVersion(pkg)
      }))
    );

    for (const item of fetched) {
      results[item.pkg] = item.version;
    }
  }

  return results;
}

export async function createPackageJson(
  config: ProjectConfig,
  resolvedVersions?: Record<string, string>
): Promise<string> {
  const versions = resolvedVersions ?? (await resolveProjectVersions(config));

  const transportName =
    config.transport === 'bun' ? '@galfus/transport-bun' : '@galfus/transport-node';

  const transportDep = {
    [transportName]: versions[transportName] ?? 'latest'
  };

  const pkg = {
    name: config.name,
    version: '0.1.0',
    description: `Game built with Galfus Engine (${config.template})`,
    type: 'module',
    main: 'src/main.ts',
    scripts: {
      dev: config.transport === 'bun' ? 'bun src/main.ts' : 'node src/main.ts',
      build: 'galfus-engine build'
    },
    dependencies: {
      '@galfus/engine': versions['@galfus/engine'] ?? 'latest',
      ...transportDep
    },
    devDependencies: {
      '@types/bun': versions['@types/bun'] ?? 'latest',
      typescript: versions['typescript'] ?? 'latest'
    }
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

export function createTsConfig(): string {
  const tsconfig = {
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      types: ['bun-types']
    },
    include: ['src/**/*']
  };

  return JSON.stringify(tsconfig, null, 2) + '\n';
}

export function createGitIgnore(): string {
  return ['node_modules/', 'dist/', '.DS_Store', '*.log', '.tmp/', ''].join('\n');
}

export function createReadme(config: ProjectConfig): string {
  return `# ${config.name}

A high-performance standalone game built with **Galfus Engine**.

## Getting Started

### 1. Run Development Mode
\`\`\`bash
${config.transport === 'bun' ? 'bun run dev' : 'npm run dev'}
\`\`\`

### 2. Build Standalone Executable
Compile your game and pair it side-by-side with the pre-built native Galfus engine library:
\`\`\`bash
galfus-engine build
\`\`\`

Target specific platforms:
\`\`\`bash
galfus-engine build --target windows-x64 --out dist
\`\`\`

Output in \`dist/\`:
- Executable binary (\`${config.name}\` or \`${config.name}.exe\`)
- Native engine dynamic library (\`libgalfus_native.so\`, \`galfus_native.dll\`, or \`galfus.node\`)
`;
}

export function createMainScript(config: ProjectConfig): string {
  const transportImport =
    config.transport === 'bun'
      ? `import { createBunTransport } from '@galfus/transport-bun';`
      : `import { createNodeTransport } from '@galfus/transport-node';`;

  const transportInstantiation =
    config.transport === 'bun' ? `createBunTransport()` : `createNodeTransport()`;

  if (config.template === '3d-scene') {
    return `${transportImport}
import { createRuntime, type Model3DComponent, utils3D } from '@galfus/engine';

async function main() {
  const transport = ${transportInstantiation};
  const runtime = createRuntime(transport);
  const realm3d = runtime.createRealm3D();

  // Create presentation window and target
  const windowId = runtime.platform.window.create({
    title: '${config.name}',
    size: [1280, 720],
    resizable: true
  });
  const targetId = runtime.multiverse.createTarget({
    kind: { type: 'window', windowId }
  });

  // Setup camera
  const camPos: [number, number, number] = [0, 3, 6];
  const camTarget: [number, number, number] = [0, 0, 0];
  const camera = realm3d.createCamera(
    { fovY: 60, near: 0.1, far: 100, cameraSlot: 1 },
    { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
  );

  // Sunlight
  realm3d.createLight(
    { kind: 'directional', color: [1, 0.95, 0.85], intensity: 2.5, castShadow: true },
    { position: [5, 10, 5], rotation: utils3D.quatFromLookAt([5, 10, 5], [0, 0, 0]) }
  );

  // Ground and Spinning Cube
  const floorMat = realm3d.createMaterial({ baseColor: [0.15, 0.18, 0.25, 1] }).materialId;
  const cubeMat = realm3d.createMaterial({ baseColor: [0.2, 0.7, 0.9, 1], metallic: 0.4, roughness: 0.3 }).materialId;

  realm3d.createCube(1, floorMat, { position: [0, -0.5, 0], scale: [12, 1, 12] });
  const cube = realm3d.createCube(1, cubeMat, { position: [0, 1, 0], scale: [1.5, 1.5, 1.5] });

  runtime.multiverse.createInvocation({
    realmId: realm3d.realmId,
    targetId,
    cameraSlot: 1,
    clearColor: [0.05, 0.07, 0.12, 1]
  });

  const cubeModel = realm3d.world.getComponent<Model3DComponent>(cube.entityId, 'Model3D');
  let angle = 0;
  runtime.on('tick', ({ dt }) => {
    angle += dt * 1.5;
    cubeModel?.setRotation(0, Math.sin(angle * 0.5), 0, Math.cos(angle * 0.5));
  });

  runtime.on('keyboard', (ev) => {
    if (ev.type === 'input' && ev.state === 'pressed' && (ev.logicalKey === 'Escape' || ev.physicalKey === 'KeyQ')) {
      runtime.stop();
    }
  });

  console.log('${config.name} running. Press [Esc] to exit.');
  runtime.start();
}

main().catch(console.error);
`;
  }

  if (config.template === '2d-scene') {
    return `${transportImport}
import { createRuntime, type Model2DComponent } from '@galfus/engine';

async function main() {
  const transport = ${transportInstantiation};
  const runtime = createRuntime(transport);
  const realm2d = runtime.createRealm2D();

  const windowId = runtime.platform.window.create({
    title: '${config.name}',
    size: [1280, 720],
    resizable: true
  });
  const targetId = runtime.multiverse.createTarget({
    kind: { type: 'window', windowId }
  });

  // 2D Camera
  realm2d.createCamera({ cameraSlot: 1, zoom: 1.0 }, { position: [0, 0] });

  // 2D Sprite and Light
  const mat = realm2d.createMaterial({ baseColor: [0.2, 0.8, 0.6, 1] }).materialId;
  const sprite = realm2d.createSprite({ dimensions: [2.0, 2.0], materialId: mat }, { position: [0, 0] });

  realm2d.createLight({
    color: [1, 0.9, 0.7],
    intensity: 2.0,
    range: 15.0,
    lightRadius: 0.5,
    castShadow: false,
    active: true
  }, { position: [0, 2] });

  runtime.multiverse.createInvocation({
    realmId: realm2d.realmId,
    targetId,
    cameraSlot: 1,
    clearColor: [0.08, 0.1, 0.14, 1]
  });

  const spriteModel = realm2d.world.getComponent<Model2DComponent>(sprite.entityId, 'Model2D');
  let time = 0;
  runtime.on('tick', ({ dt }) => {
    time += dt;
    spriteModel?.setPosition(Math.sin(time * 2) * 2, Math.cos(time * 3) * 0.5);
  });

  runtime.on('keyboard', (ev) => {
    if (ev.type === 'input' && ev.state === 'pressed' && (ev.logicalKey === 'Escape' || ev.physicalKey === 'KeyQ')) {
      runtime.stop();
    }
  });

  console.log('${config.name} running. Press [Esc] to exit.');
  runtime.start();
}

main().catch(console.error);
`;
  }

  // Physics template
  return `${transportImport}
import { attachPhysics3D, createRuntime, utils3D } from '@galfus/engine';

async function main() {
  const transport = ${transportInstantiation};
  const runtime = createRuntime(transport);
  const realm3d = runtime.createRealm3D();
  const physics = await attachPhysics3D(runtime, realm3d, { gravity: [0, -9.81, 0] });

  const windowId = runtime.platform.window.create({
    title: '${config.name}',
    size: [1280, 720],
    resizable: true
  });
  const targetId = runtime.multiverse.createTarget({
    kind: { type: 'window', windowId }
  });

  const camPos: [number, number, number] = [0, 5, 10];
  const camTarget: [number, number, number] = [0, 1.5, 0];
  realm3d.createCamera(
    { fovY: 55, near: 0.1, far: 100, cameraSlot: 1 },
    { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
  );

  realm3d.createLight(
    { kind: 'directional', color: [1, 0.95, 0.85], intensity: 2.5, castShadow: true },
    { position: [8, 14, 8], rotation: utils3D.quatFromLookAt([8, 14, 8], [0, 0, 0]) }
  );

  const floorMat = realm3d.createMaterial({ baseColor: [0.18, 0.2, 0.28, 1] }).materialId;
  const crateMat = realm3d.createMaterial({ baseColor: [0.95, 0.5, 0.2, 1], metallic: 0.3, roughness: 0.4 }).materialId;

  // Static floor
  const floor = realm3d.createCube(1, floorMat, { position: [0, -0.5, 0], scale: [16, 1, 16] }).entityId;
  realm3d.addCollider(floor, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
  physics.addRigidBody(floor, { type: 'fixed', friction: 0.7 });

  // Dynamic physics crate
  const crate = realm3d.createCube(1, crateMat, { position: [0, 5, 0], scale: [1.5, 1.5, 1.5] }).entityId;
  realm3d.addCollider(crate, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
  physics.addRigidBody(crate, { type: 'dynamic', mass: 2.0, restitution: 0.4, friction: 0.6 });

  runtime.multiverse.createInvocation({
    realmId: realm3d.realmId,
    targetId,
    cameraSlot: 1,
    clearColor: [0.06, 0.08, 0.12, 1]
  });

  runtime.on('keyboard', (ev) => {
    if (ev.type === 'input' && ev.state === 'pressed') {
      if (ev.logicalKey === 'Escape' || ev.physicalKey === 'KeyQ') {
        runtime.stop();
      } else if (ev.logicalKey === ' ' || ev.physicalKey === 'Space') {
        // Apply upward impulse
        physics.applyImpulse(crate, [0, 14, 0]);
      }
    }
  });

  console.log('${config.name} physics ready. [Space]: bounce crate | [Esc]: exit.');
  runtime.start();
}

main().catch(console.error);
`;
}
