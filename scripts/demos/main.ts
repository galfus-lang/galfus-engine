import { runDemoMv1 } from './demo_mv1_multiverse.ts';
import { runDemoMv2 } from './demo_mv2_split_texture_reuse.ts';
import { runDemoMv3 } from './demo_mv3_cycle_multiverse.ts';
import { runDemo3d1 } from './demo_3d1_orbit.ts';
import { runDemo3d2 } from './demo_3d2_bones.ts';
import { runDemo3d3 } from './demo_3d3_ssao_shadows.ts';
import { runDemo3d4 } from './demo_3d4_features.ts';
import { runDemo3d5 } from './demo_3d5_particles.ts';
import { runDemo3d6 } from './demo_3d6_refraction.ts';
import { runDemo3d7 } from './demo_3d7_portal_mirror.ts';
import { runDemo2d1 } from './demo_2d1_shadows.ts';
import { runDemo2d2 } from './demo_2d2_effects_particles.ts';

function printHelp(): void {
  console.log('=== Galfus Engine - TypeScript / Bun Demos ===');
  console.log('Usage:');
  console.log('  bun demo <demo_id>');
  console.log('  bun scripts/demos/main.ts [demo_id]\n');
  console.log('Available Demos:\n');
  console.log('  [Multiverse]');
  console.log('    mv1   - Split-screen viewports & post-processing filters (Default)');
  console.log('    mv2   - Fullscreen 3D + 2D corner minimap & RTT texture reuse on 3D cube');
  console.log('    mv3   - Multiverse Realm Cyclic Dependencies & Soft-Cut Feedback Loop');
  console.log('\n  [Realm 3D]');
  console.log('    3d1   - Reverse-Z, interactive camera orbit, and dynamic lighting');
  console.log('    3d2   - Procedural Skeletal Bones (12-Joint Skinning & Shadows)');
  console.log('    3d3   - Point Light Omnidirectional Shadows (6 Cube Faces) & SSAO');
  console.log('    3d4   - Advanced: Primitives, Bloom HDR, Gizmos & Compute Light Culling');
  console.log('    3d5   - GPU Particles (Sparks Fountain, Mystic Vortex, Bursts & Reverse-Z)');
  console.log("    3d6   - Screen-Space Optical Refraction (Glass, Crystals, Gems & Snell's Law)");
  console.log('    3d7   - Planar Reflections & Optical Portals (Virtual Cameras, Offscreen RTT)');
  console.log('\n  [Realm 2D]');
  console.log('    2d1   - Orthographic Reverse-Z, Point Lights, and Polar Soft Shadows');
  console.log('    2d2   - Material Custom Shader Effects & 2D Particle Emitters\n');
}

async function main(): Promise<void> {
  const rawArg = process.argv[2];
  const arg = rawArg ? rawArg.toLowerCase().replace(/[-_]/g, '') : undefined;

  switch (arg) {
    case 'mv1':
    case undefined:
      if (!arg) {
        console.log('No demo specified. Defaulting to Demo MV1 (Multiverse).');
        console.log('Use `bun demo <id>` to choose a specific demo (e.g. 3d1, 2d1, mv1, mv2).\n');
      }
      await runDemoMv1();
      break;

    case 'mv2':
      await runDemoMv2();
      break;

    case 'mv3':
      await runDemoMv3();
      break;

    case '3d1':
      await runDemo3d1();
      break;

    case '3d2':
      await runDemo3d2();
      break;

    case '3d3':
      await runDemo3d3();
      break;

    case '3d4':
      await runDemo3d4();
      break;

    case '3d5':
      await runDemo3d5();
      break;

    case '3d6':
    case '6':
      await runDemo3d6();
      break;

    case '3d7':
    case '7':
      await runDemo3d7();
      break;

    case '2d1':
      await runDemo2d1();
      break;

    case '2d2':
      await runDemo2d2();
      break;

    case 'help':
    case 'h':
      printHelp();
      break;

    default:
      console.error(`Unknown demo identifier or argument: '${rawArg}'\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Demo execution error:', err);
  process.exit(1);
});
