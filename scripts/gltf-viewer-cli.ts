import { homedir } from 'node:os';
import { resolve } from 'node:path';

interface ViewerArgs {
  filePath?: string;
  isHeadless: boolean;
  maxFrames?: number;
  scale?: number;
  help: boolean;
  alphaMode: 'viewer' | 'gltf';
}

export function parseArgs(): ViewerArgs {
  const args = process.argv.slice(2);
  let filePath: string | undefined;
  let isHeadless = false;
  let maxFrames: number | undefined;
  let scale: number | undefined;
  let help = false;
  let alphaMode: 'viewer' | 'gltf' = 'viewer';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--headless') {
      isHeadless = true;
    } else if (arg === '--frames' && i + 1 < args.length) {
      maxFrames = parseInt(args[++i]!, 10);
    } else if (arg === '--scale' && i + 1 < args.length) {
      scale = parseFloat(args[++i]!);
    } else if (arg === '--alpha-mode' && i + 1 < args.length) {
      const value = args[++i];
      if (value !== 'viewer' && value !== 'gltf')
        throw new Error('Invalid --alpha-mode: use viewer or gltf');
      alphaMode = value;
    } else if (!arg.startsWith('-') && !filePath) {
      filePath = arg;
    }
  }

  // Headless environment auto-detection
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && process.platform === 'linux') {
    isHeadless = true;
  }

  return { filePath, isHeadless, maxFrames, scale, help, alphaMode };
}

export function printUsage(): void {
  console.log(`
=============================================================
             Galfus Engine - 3D glTF Model Viewer            
=============================================================

Usage:
  bun gltf <path-to-file> [options]
  bun scripts/gltf-viewer.ts <path-to-file> [options]

Supported Input Formats:
  • .glb  - Monolithic glTF 2.0 binary container
  • .gltf - glTF JSON file (with embedded data URIs or sibling .bin)
  • .zip  - Compressed multi-file archive (.gltf + .bin + textures)

Options:
  --headless       Run in offscreen headless mode (for CI / automated testing)
  --frames <N>     Automatically exit after rendering N frames
  --scale <N>      Apply custom uniform scaling multiplier
  --alpha-mode <viewer|gltf>  Viewer alpha cutouts (default) or the original glTF alpha modes
  -h, --help       Show this help message and exit

Controls:
  • Left Mouse Drag / [A][D] / [Arrow Left][Right] : Orbit horizontally
  • [W][S] / [Arrow Up][Down]                      : Orbit vertically (pitch)
  • Mouse Wheel / [E][Z] / [+][-] / [PgUp][PgDn]   : Smooth zoom in / zoom out
  • [Shift] (Hold)                                 : Boost navigation speed (2.5x)
  • [Space]                                        : Play/pause animation (or toggle turntable)
  • [N]                                            : Play next animation clip
  • [T]                                            : Toggle turntable auto-rotation
  • [G]                                            : Toggle ground floor plane
  • [R]                                            : Reset camera to initial framing
  • [Esc]                                          : Gracefully exit viewer
`);
}

export function resolveFilePath(inputPath: string): string {
  let expanded = inputPath.trim();
  if (expanded.startsWith('~')) {
    expanded = homedir() + expanded.slice(1);
  }
  if (expanded.startsWith('$HOME')) {
    expanded = homedir() + expanded.slice(5);
  }
  return resolve(process.cwd(), expanded);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
