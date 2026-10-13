import type { FunctionSpec } from '../spec.ts';

export interface CodegenContext {
  functions: FunctionSpec[];
}

export interface CodegenStrategy {
  /** Unique strategy identifier */
  readonly id: string;
  /** Human-readable strategy name */
  readonly name: string;
  /** Output directory relative to workspace root */
  readonly relativeOutputDir: string;
  /** Target generated file name */
  readonly filename: string;
  /** Generates the complete source file content */
  generate(context: CodegenContext): string;
}
