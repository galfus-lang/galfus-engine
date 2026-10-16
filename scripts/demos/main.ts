import { runDemo1 } from './demo1_multiverse.ts';
import { runDemo2 } from './demo2_realm3d.ts';
import { runDemo3 } from './demo3_bones.ts';
import { runDemo4 } from './demo4_ssao_point_shadows.ts';
import { runDemo5 } from './demo5_realm3d_features.ts';
import { runDemo6 } from './demo6_realm2d_shadows.ts';
import { runDemo7 } from './demo7_realm2d_effects.ts';

function printHelp(): void {
  console.log('=== Galfus Engine - TypeScript / Bun Demos ===');
  console.log('Usage:');
  console.log('  bun scripts/demos/main.ts [demo_number]');
  console.log('  bun run demo [demo_number]\n');
  console.log('Available Demos:');
  console.log('  1  - Multiverse split-screen viewports & post-processing filters (Default)');
  console.log('  2  - 3D Realm with Reverse-Z, interactive camera orbit, and dynamic lighting');
  console.log('  3  - 3D Procedural Skeletal Bones (12-Joint Skinning & Realtime Shadows)');
  console.log('  4  - 3D Point Light Omnidirectional Shadows (6 Cube Faces) & SSAO');
  console.log('  5  - 3D Advanced Features: Primitives, Bloom HDR, Gizmos & Compute Light Culling');
  console.log('  6  - 2D Realm with Orthographic Reverse-Z, Point Lights, and Polar Soft Shadows');
  console.log(
    '  7  - 2D Realm Material Custom Shader Effects (Plasma, Hologram, Lava, Caustics)\n'
  );
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  switch (arg) {
    case '1':
    case undefined:
      if (!arg) {
        console.log('No demo number specified. Defaulting to Demo 1 (Multiverse).');
        console.log('Use `bun run demo <1|2|3|4|5|6|7>` to choose a specific demo.\n');
      }
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

    case '5':
      await runDemo5();
      break;

    case '6':
      await runDemo6();
      break;

    case '7':
      await runDemo7();
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
