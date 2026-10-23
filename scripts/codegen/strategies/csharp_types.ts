import {
  type DataType,
  type DescSpec,
  type FieldType,
  isJson,
  isJsonArray,
  isNativeStruct,
  type ParamSpec
} from '../spec.ts';

const CSHARP_KEYWORDS = new Set([
  'abstract',
  'as',
  'base',
  'bool',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'checked',
  'class',
  'const',
  'continue',
  'decimal',
  'default',
  'delegate',
  'do',
  'double',
  'else',
  'enum',
  'event',
  'explicit',
  'extern',
  'false',
  'finally',
  'fixed',
  'float',
  'for',
  'foreach',
  'goto',
  'if',
  'implicit',
  'in',
  'int',
  'interface',
  'internal',
  'is',
  'lock',
  'long',
  'namespace',
  'new',
  'null',
  'object',
  'operator',
  'out',
  'override',
  'params',
  'private',
  'protected',
  'public',
  'readonly',
  'ref',
  'return',
  'sbyte',
  'sealed',
  'short',
  'sizeof',
  'stackalloc',
  'static',
  'string',
  'struct',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'uint',
  'ulong',
  'unchecked',
  'unsafe',
  'ushort',
  'using',
  'virtual',
  'void',
  'volatile',
  'while'
]);

export function escapeIdent(name: string): string {
  return CSHARP_KEYWORDS.has(name) ? `@${name}` : name;
}

export function toPascalCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toCamelCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function mapNativeType(type: DataType, isParam: boolean): string {
  if (isNativeStruct(type)) {
    return `Galfus${type.nativeStruct}`;
  }
  if (typeof type === 'object') {
    return 'IntPtr';
  }
  switch (type) {
    case 'void':
      return 'void';
    case 'bool':
      return isParam
        ? '[MarshalAs(UnmanagedType.I1)] bool'
        : '[return: MarshalAs(UnmanagedType.I1)] bool';
    case 'i32':
      return 'int';
    case 'u32':
      return 'uint';
    case 'u64':
      return 'ulong';
    case 'f32':
      return 'float';
    case 'f64':
      return 'double';
    case 'string':
    case 'ptr':
      return 'IntPtr';
    default:
      return 'IntPtr';
  }
}

export function renderFieldType(
  type: FieldType,
  optional?: boolean,
  enumNames?: Set<string>
): string {
  if (typeof type === 'string') {
    switch (type) {
      case 'string':
        return 'string';
      case 'number':
        return optional ? 'double?' : 'double';
      case 'boolean':
        return optional ? 'bool?' : 'bool';
      default:
        return 'object';
    }
  }
  if ('ref' in type) {
    if (enumNames && enumNames.has(type.ref)) {
      return 'string';
    }
    return type.ref;
  }
  if ('enum' in type) {
    return 'string';
  }
  if ('literal' in type) {
    return typeof type.literal === 'string' ? 'string' : 'double';
  }
  if ('tuple' in type) {
    const inner = type.tuple[0] ? renderFieldType(type.tuple[0], false, enumNames) : 'object';
    return `${inner}[]`;
  }
  if ('array' in type) {
    return `${renderFieldType(type.array, false, enumNames)}[]`;
  }
  if ('inline' in type) {
    return 'Dictionary<string, object>';
  }
  return 'object';
}

export function renderCSharpDescriptor(desc: DescSpec, enumNames?: Set<string>): string[] {
  const lines: string[] = [];
  if (desc.doc) {
    lines.push(`    /// <summary>${desc.doc}</summary>`);
  }

  if (desc.kind === 'enum') {
    lines.push(`    public static class ${desc.name}`);
    lines.push('    {');
    for (const val of desc.values) {
      const constName = toPascalCase(val);
      lines.push(`        public const string ${constName} = "${val}";`);
    }
    lines.push('    }');
    lines.push('');
    return lines;
  }

  if (desc.kind === 'object') {
    lines.push(`    public class ${desc.name}`);
    lines.push('    {');
    for (const [name, spec] of Object.entries(desc.fields)) {
      if (spec.doc) {
        lines.push(`        /// <summary>${spec.doc}</summary>`);
      }
      const propType = renderFieldType(spec.type, spec.optional, enumNames);
      const propName = escapeIdent(name);
      lines.push(`        public ${propType} ${propName} { get; set; }`);
    }
    lines.push('    }');
    lines.push('');
    return lines;
  }

  if (desc.kind === 'union') {
    lines.push(`    public class ${desc.name}`);
    lines.push('    {');
    // Collect all fields from inline variants
    const fieldMap = new Map<string, string>();
    for (const variant of desc.variants) {
      if (typeof variant === 'object' && 'inline' in variant) {
        for (const [fName, fSpec] of Object.entries(variant.inline)) {
          fieldMap.set(fName, renderFieldType(fSpec.type, true, enumNames));
        }
      }
    }
    if (fieldMap.size > 0) {
      for (const [fName, fType] of fieldMap.entries()) {
        lines.push(`        public ${fType} ${escapeIdent(fName)} { get; set; }`);
      }
    } else {
      lines.push('        public object value { get; set; }');
    }
    lines.push('    }');
    lines.push('');
    return lines;
  }

  return lines;
}
