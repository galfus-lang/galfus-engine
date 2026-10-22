import { existsSync } from 'fs';
import { resolve } from 'path';
import { GalfusNode } from '../../../../sdk/node/galfus.ts';
import { runFeatureTour } from '../../tour_runner.ts';

const rootDir = resolve(import.meta.dir, '../../../..');
const nodeAddonPath = resolve(rootDir, 'build/cargo-target/debug/galfus.node');
const soPath = resolve(rootDir, 'build/cargo-target/debug/libgalfus_native.so');
const libPath = existsSync(nodeAddonPath) ? nodeAddonPath : soPath;

const galfus = new GalfusNode(libPath);

const maxFrames = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;

runFeatureTour({
  engine: galfus,
  activeBinding: 'Node-API / galfus.node',
  maxFrames
}).catch((err) => {
  console.error('Fatal tour error in Node runner:', err);
  process.exit(1);
});
