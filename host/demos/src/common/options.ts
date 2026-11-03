import {
  createRuntime,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';

/** Shared command-line options for Galfus demos. */
export interface HostDemoOptions {
  headless?: boolean;
  maxFrames?: number;
  fontPath?: string;
  title?: string;
}

export function getScrollY(delta: import('@galfus/transport-types').ScrollDelta): number {
  return 'lines' in delta ? delta.lines[1] : delta.pixels[1];
}

export type DemoRunOptions = HostDemoOptions;

export function parsePositiveIntFlag(value: string, flagName = '--frames'): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

export function resolveDemoOptions(options: HostDemoOptions = {}): {
  headless: boolean;
  maxFrames: number | undefined;
} {
  const headless =
    options.headless ?? (process.argv.includes('--headless') || !process.env.DISPLAY);
  const index = process.argv.indexOf('--frames');
  const frameArgument = index >= 0 ? Number(process.argv[index + 1]) : undefined;
  const maxFrames = options.maxFrames ?? frameArgument ?? (headless ? 120 : undefined);
  if (maxFrames !== undefined && (!Number.isInteger(maxFrames) || maxFrames <= 0))
    throw new Error('--frames must be a positive integer.');
  return { headless, maxFrames };
}

export interface DemoSession {
  runtime: MultiverseRuntime;
  targetId: TargetId;
  windowId: WindowId | undefined;
  headless: boolean;
  maxFrames: number | undefined;
  size: readonly [number, number];
}

/** Creates a MultiverseRuntime and either an OS desktop window or an offscreen headless texture target. */
export function createDemoSession(
  title: string,
  options: HostDemoOptions = {},
  defaultSize: [number, number] = [1280, 720]
): DemoSession {
  const { headless, maxFrames } = resolveDemoOptions(options);
  const runtime = createRuntime(createBunTransport({ headless }));
  const windowId = headless
    ? undefined
    : runtime.platform.window.create({
        title,
        size: defaultSize,
        resizable: true,
        decorations: true
      });
  const targetId = runtime.multiverse.createTarget(
    windowId === undefined
      ? { kind: { type: 'texture', width: defaultSize[0], height: defaultSize[1] } }
      : { kind: { type: 'window', windowId } }
  );
  const size = windowId === undefined ? defaultSize : runtime.platform.window.getSize(windowId);
  return { runtime, targetId, windowId, headless, maxFrames, size };
}
