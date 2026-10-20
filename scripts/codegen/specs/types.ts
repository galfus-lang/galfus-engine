export type PrimitiveType =
  'void' | 'bool' | 'i32' | 'u32' | 'u64' | 'f32' | 'f64' | 'string' | 'ptr';

export type BufferElementType = 'u8' | 'u32' | 'f32';

/** Fixed C-layout values passed by pointer for hot-path APIs. */
export type NativeStructName =
  'Transform2D' | 'Transform3D' | 'CameraLookAt3D' | 'SpatialAudio' | 'EventBatch';

export type DataType =
  | PrimitiveType
  | { json: string }
  | { jsonArray: string }
  | { buffer: BufferElementType }
  | { nativeStruct: NativeStructName };

export interface ParamSpec {
  name: string;
  type: DataType;
  doc: string;
  optional?: boolean;
  /** The native callee writes this caller-owned struct. */
  out?: boolean;
}

export interface FunctionSpec {
  cName: string;
  methodName: string;
  doc: string;
  params: ParamSpec[];
  returnType: DataType;
  /** Optional extraction of a return value from an input param on success (e.g. config.id) */
  returnsParamField?: { paramName: string; fieldName: string };
}

export function isPrimitive(type: DataType): type is PrimitiveType {
  return typeof type === 'string';
}

export function isJson(type: DataType): type is { json: string } {
  return typeof type === 'object' && 'json' in type;
}

export function isJsonArray(type: DataType): type is { jsonArray: string } {
  return typeof type === 'object' && 'jsonArray' in type;
}

/** A contiguous native-endian typed buffer passed without JSON serialization. */
export function isBuffer(type: DataType): type is { buffer: BufferElementType } {
  return typeof type === 'object' && 'buffer' in type;
}

/** A fixed-layout C value passed through a pointer, never serialized as JSON. */
export function isNativeStruct(type: DataType): type is { nativeStruct: NativeStructName } {
  return typeof type === 'object' && 'nativeStruct' in type;
}

/** Field type representation for schema descriptors. */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | { ref: string }
  | { enum: string[] }
  | { array: FieldType }
  | { tuple: FieldType[] }
  | { literal: string | number }
  | { inline: Record<string, FieldSpec> };

/** Field metadata in an object descriptor. */
export interface FieldSpec {
  type: FieldType;
  optional?: boolean;
  doc?: string;
}

/** Domain schema descriptor for code generation (interfaces, enums, unions). */
export type DescSpec =
  | {
      kind: 'object';
      name: string;
      doc?: string;
      fields: Record<string, FieldSpec>;
    }
  | {
      kind: 'enum';
      name: string;
      doc?: string;
      values: string[];
    }
  | {
      kind: 'union';
      name: string;
      doc?: string;
      variants: FieldType[];
    };
