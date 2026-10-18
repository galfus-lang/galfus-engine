export type PrimitiveType =
  'void' | 'bool' | 'i32' | 'u32' | 'u64' | 'f32' | 'f64' | 'string' | 'ptr';

export type DataType = PrimitiveType | { json: string } | { jsonArray: string };

export interface ParamSpec {
  name: string;
  type: DataType;
  doc: string;
  optional?: boolean;
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
