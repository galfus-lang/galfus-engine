import { runDemo0 } from './demo0_platform.ts';
import { runDemo1 } from './demo1_multiverse.ts';
import { runDemo2 } from './demo2_realm3d.ts';
import { runDemo3 } from './demo3_bones.ts';
import { runDemo4 } from './demo4_ssao_point_shadows.ts';

function printHelp(): void {
  console.log('=== Galfus Engine - TypeScript / Bun Demos ===');
  console.log('Usage:');
  console.log('  bun scripts/demos/main.ts [demo_number]');
  console.log('  bun run demo [demo_number]');
  console.log('  bun run demo:0');
  console.log('  bun run demo:1');
  console.log('  bun run demo:2');
  console.log('  bun run demo:3');
  console.log('  bun run demo:4\n');
  console.log('Available Demos:');
  console.log('  0  - Platform, windowing, pointer, and keyboard event loop (Default)');
  console.log('  1  - Multiverse split-screen viewports & post-processing filters');
  console.log('  2  - 3D Realm with Reverse-Z, interactive camera orbit, and dynamic lighting');
  console.log('  3  - 3D Procedural Skeletal Bones (12-Joint Skinning & Realtime Shadows)');
  console.log('  4  - 3D Point Light Omnidirectional Shadows (6 Cube Faces) & SSAO\n');
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  switch (arg) {
    case '0':
    case undefined:
      if (!arg) {
        console.log('No demo number specified. Defaulting to Demo 0 (Platform).');
        console.log('Use `bun run demo <0|1|2|3|4>` to choose a specific demo.\n');
      }
      await runDemo0();
      break;

    case '1':
      await runDemo1();
      break;

    case '2':
      await runDemo2();
      break;

    case '3':
      await runDemo3();
      break;

    case '4':
      await runDemo4();
      break;

    case '--help':
    case '-h':
    case 'help':
      printHelp();
      break;

    default:
      console.error(`Unknown demo number or argument: '${arg}'\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Demo execution error:', err);
  process.exit(1);
});
