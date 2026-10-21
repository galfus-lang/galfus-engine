import type { CodegenContext } from './strategy.ts';
import { type DataType, isBuffer, isJson, isJsonArray, isNativeStruct } from '../spec.ts';

export function mapParamTsType(type: DataType): string {
  if (isNativeStruct(type)) {
    if (type.nativeStruct === 'EventBatch') return 'never';
    return type.nativeStruct === 'SpatialAudio' ? 'SpatialAudio' : type.nativeStruct;
  }
  if (isBuffer(type)) {
    return type.buffer === 'u8'
      ? 'Uint8Array'
      : type.buffer === 'u32'
        ? 'Uint32Array'
        : 'Float32Array';
  }
  if (isJson(type)) {
    return `${type.json} | string`;
  }
  if (isJsonArray(type)) {
    return `${type.jsonArray}[] | string`;
  }
  switch (type) {
    case 'bool':
      return 'boolean';
    case 'i32':
    case 'u32':
    case 'u64':
    case 'f32':
    case 'f64':
      return 'number';
    case 'string':
      return 'string';
    case 'void':
      return 'void';
    case 'ptr':
      return 'any';
    default:
      return 'any';
  }
}

export function mapReturnTsType(fnReturnType: DataType, hasParamFieldReturn: boolean): string {
  if (hasParamFieldReturn) {
    return 'number';
  }
  if (isJson(fnReturnType)) {
    return fnReturnType.json;
  }
  if (isJsonArray(fnReturnType)) {
    return `${fnReturnType.jsonArray}[]`;
  }
  switch (fnReturnType) {
    case 'bool':
      return 'boolean';
    case 'i32':
      return 'void';
    case 'u32':
    case 'u64':
    case 'f32':
    case 'f64':
      return 'number';
    case 'string':
      return 'string';
    case 'void':
      return 'void';
    default:
      return 'void';
  }
}

/** Collects the schema types referenced by the generated engine methods. */
export function collectEngineTypes(context: CodegenContext): Set<string> {
  const BUILTIN_TS_TYPES = new Set(['number', 'string', 'boolean', 'any', 'void']);
  const importedTypes = new Set<string>(['GalfusEngine']);
  const addType = (t: string) => {
    const clean = t.replace(/\[\]$/, '').trim();
    if (!BUILTIN_TS_TYPES.has(clean)) {
      importedTypes.add(clean);
    }
  };
  for (const fn of context.functions) {
    if (isJson(fn.returnType)) addType(fn.returnType.json);
    if (isJsonArray(fn.returnType)) addType(fn.returnType.jsonArray);
    for (const p of fn.params) {
      if (isJson(p.type)) addType(p.type.json);
      if (isJsonArray(p.type)) addType(p.type.jsonArray);
      if (isNativeStruct(p.type) && p.type.nativeStruct !== 'EventBatch')
        addType(p.type.nativeStruct === 'SpatialAudio' ? 'SpatialAudio' : p.type.nativeStruct);
      if (p.out && isNativeStruct(p.type) && p.type.nativeStruct === 'EventBatch')
        addType('PlatformEvent');
      if (p.out && isNativeStruct(p.type) && p.type.nativeStruct === 'CameraLookAt3D')
        addType('CameraLookAt3DStateDesc');
    }
  }

  return importedTypes;
}

/**
 * Emits the typed wrapper methods shared by every JavaScript runtime binding.
 * `runtimeLabel` names the runtime in the "not implemented" error message, and `asyncMethods`
 * lists methods whose native implementation returns a Promise.
 */
export function engineMethodLines(
  context: CodegenContext,
  runtimeLabel: string,
  asyncMethods: ReadonlySet<string> = new Set(),
  excludedMethods: ReadonlySet<string> = new Set()
): string[] {
  const lines: string[] = [];
  for (const fn of context.functions) {
    if (fn.methodName === 'getLastError' || excludedMethods.has(fn.methodName)) continue;

    const outParam = fn.params.find((p) => p.out && isNativeStruct(p.type));
    const outStruct =
      outParam && isNativeStruct(outParam.type) ? outParam.type.nativeStruct : undefined;
    const params = fn.params
      .filter((p) => !p.out)
      .map((p) => `${p.name}${p.optional ? '?' : ''}: ${mapParamTsType(p.type)}`)
      .join(', ');
    const retType = outStruct
      ? outStruct === 'EventBatch'
        ? 'PlatformEvent[]'
        : outStruct === 'CameraLookAt3D'
          ? 'CameraLookAt3DStateDesc'
          : outStruct
      : mapReturnTsType(fn.returnType, !!fn.returnsParamField);

    lines.push('');
    lines.push(`  /** ${fn.doc} */`);
    const isAsync = asyncMethods.has(fn.methodName);
    const tsRetType = isAsync ? `Promise<${retType}>` : retType;
    lines.push(`  ${isAsync ? 'async ' : ''}${fn.methodName}(${params}): ${tsRetType} {`);
    lines.push(`    if (typeof this._addon.${fn.methodName} !== 'function') {`);
    lines.push(
      `      throw new GalfusError("${runtimeLabel} method not implemented: ${fn.methodName}");`
    );
    lines.push(`    }`);

    // Prepare call args, parsing JSON strings to objects if passed as string
    const callArgs = fn.params
      .filter((p) => !p.out)
      .map((p) => {
        if (isJson(p.type) || isJsonArray(p.type)) {
          return `typeof ${p.name} === 'string' ? JSON.parse(${p.name}) : ${p.name}`;
        }
        return p.name;
      })
      .join(', ');

    if (isAsync) {
      lines.push(
        `    ${retType === 'void' ? '' : 'return '}await this._addon.${fn.methodName}(${callArgs});`
      );
    } else if (retType === 'void') {
      lines.push(`    this._addon.${fn.methodName}(${callArgs});`);
    } else {
      lines.push(`    return this._addon.${fn.methodName}(${callArgs});`);
    }
    lines.push('  }');
  }

  return lines;
}
