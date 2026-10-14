export type PrimitiveType = 'void' | 'bool' | 'i32' | 'u32' | 'u64' | 'f32' | 'f64' | 'string';

export type DataType = PrimitiveType | { json: string } | { jsonArray: string };

export interface ParamSpec {
  name: string;
  type: DataType;
  doc: string;
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
