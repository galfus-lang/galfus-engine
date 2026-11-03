/** Command-line entry point for host demos. */
function printHelp(): void {
  console.log('Usage: bun host:demo <name> [--headless] [--frames N]');
  console.log('');
  console.log('Available host demos:');
  console.log('  interaction  Pointer interactions with 2D, SVG, and 3D targets');
  console.log('  text-input   SVG text input, focus, and keyboard navigation');
  console.log('  trans-realm  Multi-realm event traversal, depth limits, and focus isolation');
  console.log('  tutorial     Host runtime tutorial with a 3D scene and 2D HUD');
}

async function main(): Promise<void> {
  const name = process.argv[2];
  switch (name) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    case 'interaction': {
      const { runInteractionDemo } = await import('./interaction');
      await runInteractionDemo();
      break;
    }
    case 'text-input': {
      const { runTextInputDemo } = await import('./text-input');
      await runTextInputDemo();
      break;
    }
    case 'trans-realm': {
      const { runTransRealmDemo } = await import('./trans-realm');
      await runTransRealmDemo();
      break;
    }
    case 'tutorial': {
      const { runTutorialDemo } = await import('./tutorial');
      await runTutorialDemo();
      break;
    }
    default:
      console.error(`Unknown host demo: ${name}\n`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Host demo failed:', error);
  process.exitCode = 1;
});
