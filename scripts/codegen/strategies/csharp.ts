import type { CodegenContext, CodegenStrategy } from './strategy.ts';
import {
  type DataType,
  type DescSpec,
  type FieldType,
  isJson,
  isJsonArray,
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

function escapeIdent(name: string): string {
  return CSHARP_KEYWORDS.has(name) ? `@${name}` : name;
}

function toPascalCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toCamelCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function mapNativeType(type: DataType, isParam: boolean): string {
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

function renderFieldType(type: FieldType, optional?: boolean): string {
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
    return type.ref;
  }
  if ('enum' in type) {
    return 'string';
  }
  if ('literal' in type) {
    return typeof type.literal === 'string' ? 'string' : 'double';
  }
  if ('tuple' in type) {
    const inner = type.tuple[0] ? renderFieldType(type.tuple[0]) : 'object';
    return `${inner}[]`;
  }
  if ('array' in type) {
    return `${renderFieldType(type.array)}[]`;
  }
  if ('inline' in type) {
    return 'Dictionary<string, object>';
  }
  return 'object';
}

function renderCSharpDescriptor(desc: DescSpec): string[] {
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
      const propType = renderFieldType(spec.type, spec.optional);
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
          fieldMap.set(fName, renderFieldType(fSpec.type, true));
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

export class CSharpStrategy implements CodegenStrategy {
  readonly id = 'csharp';
  readonly name = 'C# / Mono Wrapper';
  readonly relativeOutputDir = 'sdk/csharp';
  readonly filename = 'Galfus.cs';

  generate(context: CodegenContext): string {
    const lines: string[] = [
      '// <auto-generated>',
      '// Automatically generated by Galfus Engine codegen. Do not edit directly.',
      '// Compatible with MonoDevelop, Mono 5+, .NET Standard 2.0+, and .NET 6/7/8/9.',
      '// </auto-generated>',
      '',
      'using System;',
      'using System.Collections;',
      'using System.Collections.Generic;',
      'using System.Globalization;',
      'using System.Reflection;',
      'using System.Runtime.InteropServices;',
      'using System.Text;',
      '',
      'namespace Galfus',
      '{',
      '    /// <summary>Exception thrown when a Galfus Engine native operation fails.</summary>',
      '    public class GalfusError : Exception',
      '    {',
      '        public GalfusError(string message) : base(message) { }',
      '    }',
      '',
      '    #region Native P/Invoke Declarations',
      '    internal static class Native',
      '    {',
      '        public const string LibName = "galfus_native";',
      '',
      '        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]',
      '        public static extern void galfus_string_free(IntPtr ptr);',
      '',
      '        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]',
      '        public static extern IntPtr galfus_get_last_error();',
      ''
    ];

    for (const fn of context.functions) {
      if (fn.cName === 'galfus_get_last_error') continue;

      const ret = mapNativeType(fn.returnType, false);
      const params = fn.params
        .map((p) => `${mapNativeType(p.type, true)} ${escapeIdent(p.name)}`)
        .join(', ');

      lines.push(`        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]`);
      lines.push(`        public static extern ${ret} ${fn.cName}(${params});`);
      lines.push('');
    }

    lines.push('    }');
    lines.push('    #endregion', '');

    lines.push('    #region Descriptors');
    for (const desc of context.descriptors) {
      lines.push(...renderCSharpDescriptor(desc));
    }
    lines.push('    #endregion', '');

    lines.push('    #region Galfus Engine Client');
    lines.push('    /// <summary>Galfus Engine coordinator and API interface.</summary>');
    lines.push('    public class GalfusEngine');
    lines.push('    {');
    lines.push('        #region String & Marshalling Helpers');
    lines.push('        private static IntPtr Utf8ToNative(string str)');
    lines.push('        {');
    lines.push('            if (str == null) return IntPtr.Zero;');
    lines.push('            byte[] bytes = Encoding.UTF8.GetBytes(str);');
    lines.push('            IntPtr ptr = Marshal.AllocHGlobal(bytes.Length + 1);');
    lines.push('            Marshal.Copy(bytes, 0, ptr, bytes.Length);');
    lines.push('            Marshal.WriteByte(ptr, bytes.Length, 0);');
    lines.push('            return ptr;');
    lines.push('        }');
    lines.push('');
    lines.push('        private static void FreeNative(IntPtr ptr)');
    lines.push('        {');
    lines.push('            if (ptr != IntPtr.Zero) Marshal.FreeHGlobal(ptr);');
    lines.push('        }');
    lines.push('');
    lines.push('        private static string PtrToStringUtf8AndFree(IntPtr ptr)');
    lines.push('        {');
    lines.push('            if (ptr == IntPtr.Zero) return null;');
    lines.push('            try');
    lines.push('            {');
    lines.push('                int len = 0;');
    lines.push('                while (Marshal.ReadByte(ptr, len) != 0) len++;');
    lines.push('                byte[] buffer = new byte[len];');
    lines.push('                Marshal.Copy(ptr, buffer, 0, len);');
    lines.push('                return Encoding.UTF8.GetString(buffer);');
    lines.push('            }');
    lines.push('            finally');
    lines.push('            {');
    lines.push('                Native.galfus_string_free(ptr);');
    lines.push('            }');
    lines.push('        }');
    lines.push('        #endregion', '');

    lines.push('        /// <summary>Retrieves the last recorded error message.</summary>');
    lines.push('        public string GetLastError()');
    lines.push('        {');
    lines.push('            return PtrToStringUtf8AndFree(Native.galfus_get_last_error());');
    lines.push('        }');
    lines.push('');

    // Generate high-level methods
    for (const fn of context.functions) {
      if (fn.cName === 'galfus_get_last_error') continue;

      const methodName = toPascalCase(fn.methodName);
      const hasJsonParam = fn.params.some((p) => isJson(p.type) || isJsonArray(p.type));
      const isReturnI32 = fn.returnType === 'i32';
      const isReturnString =
        fn.returnType === 'string' || isJson(fn.returnType) || isJsonArray(fn.returnType);
      const isReturnBool = fn.returnType === 'bool';

      // Determine C# method return type
      let returnTypeStr = 'void';
      if (isReturnString) returnTypeStr = 'string';
      else if (isReturnBool) returnTypeStr = 'bool';

      // 1. Primitive / Raw JSON string method
      const stringParamSig = fn.params
        .map((p) => {
          if (isJson(p.type) || isJsonArray(p.type) || p.type === 'string') {
            return `string ${escapeIdent(p.name)}`;
          }
          if (p.type === 'bool') return `bool ${escapeIdent(p.name)}`;
          if (p.type === 'i32') return `int ${escapeIdent(p.name)}`;
          if (p.type === 'u32') return `uint ${escapeIdent(p.name)}`;
          if (p.type === 'u64') return `ulong ${escapeIdent(p.name)}`;
          if (p.type === 'f32') return `float ${escapeIdent(p.name)}`;
          if (p.type === 'f64') return `double ${escapeIdent(p.name)}`;
          return `IntPtr ${escapeIdent(p.name)}`;
        })
        .join(', ');

      lines.push(`        /// <summary>${fn.doc}</summary>`);
      lines.push(`        public ${returnTypeStr} ${methodName}(${stringParamSig})`);
      lines.push('        {');

      // Convert any strings to native pointers
      const stringParams = fn.params.filter(
        (p) => isJson(p.type) || isJsonArray(p.type) || p.type === 'string'
      );

      for (const sp of stringParams) {
        lines.push(`            IntPtr p_${sp.name} = Utf8ToNative(${escapeIdent(sp.name)});`);
      }

      lines.push('            try');
      lines.push('            {');

      const nativeArgs = fn.params
        .map((p) => {
          if (isJson(p.type) || isJsonArray(p.type) || p.type === 'string') {
            return `p_${p.name}`;
          }
          return escapeIdent(p.name);
        })
        .join(', ');

      if (isReturnI32) {
        lines.push(`                int res = Native.${fn.cName}(${nativeArgs});`);
        lines.push(
          `                if (res != 0) throw new GalfusError("${fn.methodName} failed: " + GetLastError());`
        );
      } else if (isReturnString) {
        lines.push(`                IntPtr res = Native.${fn.cName}(${nativeArgs});`);
        lines.push(`                return PtrToStringUtf8AndFree(res);`);
      } else if (isReturnBool) {
        lines.push(`                return Native.${fn.cName}(${nativeArgs});`);
      } else {
        lines.push(`                Native.${fn.cName}(${nativeArgs});`);
      }

      lines.push('            }');
      lines.push('            finally');
      lines.push('            {');
      for (const sp of stringParams) {
        lines.push(`                FreeNative(p_${sp.name});`);
      }
      lines.push('            }');
      lines.push('        }');
      lines.push('');

      // 2. Strongly-typed descriptor overload if JSON params exist
      if (hasJsonParam) {
        const typedParamSig = fn.params
          .map((p) => {
            if (isJson(p.type)) return `${p.type.json} ${escapeIdent(p.name)}`;
            if (isJsonArray(p.type)) return `${p.type.jsonArray}[] ${escapeIdent(p.name)}`;
            if (p.type === 'string') return `string ${escapeIdent(p.name)}`;
            if (p.type === 'bool') return `bool ${escapeIdent(p.name)}`;
            if (p.type === 'i32') return `int ${escapeIdent(p.name)}`;
            if (p.type === 'u32') return `uint ${escapeIdent(p.name)}`;
            if (p.type === 'u64') return `ulong ${escapeIdent(p.name)}`;
            if (p.type === 'f32') return `float ${escapeIdent(p.name)}`;
            if (p.type === 'f64') return `double ${escapeIdent(p.name)}`;
            return `IntPtr ${escapeIdent(p.name)}`;
          })
          .join(', ');

        const callArgs = fn.params
          .map((p) => {
            if (isJson(p.type) || isJsonArray(p.type)) {
              return `GalfusJson.Serialize(${escapeIdent(p.name)})`;
            }
            return escapeIdent(p.name);
          })
          .join(', ');

        lines.push(`        /// <summary>${fn.doc} (Typed descriptor overload)</summary>`);
        if (returnTypeStr === 'void') {
          lines.push(
            `        public void ${methodName}(${typedParamSig}) => ${methodName}(${callArgs});`
          );
        } else {
          lines.push(
            `        public ${returnTypeStr} ${methodName}(${typedParamSig}) => ${methodName}(${callArgs});`
          );
        }
        lines.push('');
      }

      // 3. Fast-Path raw float[] overloads for Set transform methods
      if (
        fn.methodName.endsWith('SetModelTransformRaw') ||
        fn.methodName.endsWith('SetCameraTransformRaw') ||
        fn.methodName.endsWith('SetSpriteTransformRaw') ||
        fn.methodName.endsWith('SetSvgTransformRaw')
      ) {
        const idParams = fn.params.filter((p) => p.type === 'u32');
        const sig =
          idParams.map((p) => `uint ${escapeIdent(p.name)}`).join(', ') + ', float[] transform';
        const callArgs =
          idParams.map((p) => escapeIdent(p.name)).join(', ') + ', handle.AddrOfPinnedObject()';

        lines.push(`        /// <summary>${fn.doc} (Direct float[] fast-path overload)</summary>`);
        lines.push(`        public void ${methodName}(${sig})`);
        lines.push('        {');
        lines.push(
          '            if (transform == null) throw new ArgumentNullException(nameof(transform));'
        );
        lines.push('            GCHandle handle = GCHandle.Alloc(transform, GCHandleType.Pinned);');
        lines.push('            try');
        lines.push('            {');
        lines.push(`                ${methodName}(${callArgs});`);
        lines.push('            }');
        lines.push('            finally');
        lines.push('            {');
        lines.push('                handle.Free();');
        lines.push('            }');
        lines.push('        }');
        lines.push('');
      }

      // 4. Fast-Path raw float[] overloads for Get transform methods
      if (
        fn.methodName.endsWith('GetModelTransformRaw') ||
        fn.methodName.endsWith('GetCameraTransformRaw') ||
        fn.methodName.endsWith('GetSpriteTransformRaw') ||
        fn.methodName.endsWith('GetSvgTransformRaw')
      ) {
        const idParams = fn.params.filter((p) => p.type === 'u32');
        const sig =
          idParams.map((p) => `uint ${escapeIdent(p.name)}`).join(', ') + ', float[] outTransform';
        const callArgs =
          idParams.map((p) => escapeIdent(p.name)).join(', ') + ', handle.AddrOfPinnedObject()';

        lines.push(`        /// <summary>${fn.doc} (Direct float[] fast-path overload)</summary>`);
        lines.push(`        public void ${methodName}(${sig})`);
        lines.push('        {');
        lines.push(
          '            if (outTransform == null) throw new ArgumentNullException(nameof(outTransform));'
        );
        lines.push(
          '            GCHandle handle = GCHandle.Alloc(outTransform, GCHandleType.Pinned);'
        );
        lines.push('            try');
        lines.push('            {');
        lines.push(`                ${methodName}(${callArgs});`);
        lines.push('            }');
        lines.push('            finally');
        lines.push('            {');
        lines.push('                handle.Free();');
        lines.push('            }');
        lines.push('        }');
        lines.push('');
      }

      // 5. Out uint overloads for size functions
      if (
        fn.methodName === 'platformGetWindowSizeRaw' ||
        fn.methodName === 'multiverseGetTargetSizeRaw'
      ) {
        const idParam = fn.params.find((p) => p.type === 'u32')!;
        lines.push(`        /// <summary>${fn.doc} (Convenience out uint overload)</summary>`);
        lines.push(
          `        public void ${methodName.replace(/Raw$/, '')}(uint ${escapeIdent(idParam.name)}, out uint width, out uint height)`
        );
        lines.push('        {');
        lines.push('            IntPtr pW = Marshal.AllocHGlobal(4);');
        lines.push('            IntPtr pH = Marshal.AllocHGlobal(4);');
        lines.push('            try');
        lines.push('            {');
        lines.push(`                ${methodName}(${escapeIdent(idParam.name)}, pW, pH);`);
        lines.push('                width = (uint)Marshal.ReadInt32(pW);');
        lines.push('                height = (uint)Marshal.ReadInt32(pH);');
        lines.push('            }');
        lines.push('            finally');
        lines.push('            {');
        lines.push('                Marshal.FreeHGlobal(pW);');
        lines.push('                Marshal.FreeHGlobal(pH);');
        lines.push('            }');
        lines.push('        }');
        lines.push('');
      }
    }

    lines.push('    }');
    lines.push('    #endregion', '');

    lines.push('    #region Zero-Dependency JSON Serializer');
    lines.push(
      '    /// <summary>Pluggable JSON serializer with fallback zero-dependency implementation.</summary>'
    );
    lines.push('    public static class GalfusJson');
    lines.push('    {');
    lines.push(
      '        public static Func<object, string> Serializer { get; set; } = SimpleSerialize;'
    );
    lines.push('');
    lines.push('        public static string Serialize(object obj)');
    lines.push('        {');
    lines.push('            if (obj == null) return "null";');
    lines.push('            if (obj is string s) return s;');
    lines.push('            return Serializer(obj);');
    lines.push('        }');
    lines.push('');
    lines.push('        private static string SimpleSerialize(object obj)');
    lines.push('        {');
    lines.push('            if (obj == null) return "null";');
    lines.push('            if (obj is string s) return "\\"" + EscapeString(s) + "\\"";');
    lines.push('            if (obj is bool b) return b ? "true" : "false";');
    lines.push('            if (obj is byte || obj is sbyte || obj is short || obj is ushort ||');
    lines.push('                obj is int || obj is uint || obj is long || obj is ulong)');
    lines.push('                return obj.ToString();');
    lines.push(
      '            if (obj is float f) return f.ToString("R", CultureInfo.InvariantCulture);'
    );
    lines.push(
      '            if (obj is double d) return d.ToString("R", CultureInfo.InvariantCulture);'
    );
    lines.push(
      '            if (obj is decimal m) return m.ToString(CultureInfo.InvariantCulture);'
    );
    lines.push('');
    lines.push('            if (obj is IDictionary dict)');
    lines.push('            {');
    lines.push('                var entries = new List<string>();');
    lines.push('                foreach (DictionaryEntry de in dict)');
    lines.push('                {');
    lines.push('                    if (de.Value == null) continue;');
    lines.push(
      '                    entries.Add("\\"" + EscapeString(de.Key.ToString()) + "\\":" + SimpleSerialize(de.Value));'
    );
    lines.push('                }');
    lines.push('                return "{" + string.Join(",", entries.ToArray()) + "}";');
    lines.push('            }');
    lines.push('');
    lines.push('            if (obj is IEnumerable en)');
    lines.push('            {');
    lines.push('                var items = new List<string>();');
    lines.push('                foreach (var item in en) items.Add(SimpleSerialize(item));');
    lines.push('                return "[" + string.Join(",", items.ToArray()) + "]";');
    lines.push('            }');
    lines.push('');
    lines.push('            // Object properties via reflection');
    lines.push(
      '            var props = obj.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance);'
    );
    lines.push('            var propEntries = new List<string>();');
    lines.push('            foreach (var prop in props)');
    lines.push('            {');
    lines.push('                if (!prop.CanRead) continue;');
    lines.push('                object val = prop.GetValue(obj, null);');
    lines.push('                if (val == null) continue;');
    lines.push(
      '                string jsonName = prop.Name.StartsWith("@") ? prop.Name.Substring(1) : prop.Name;'
    );
    lines.push(
      '                propEntries.Add("\\"" + EscapeString(jsonName) + "\\":" + SimpleSerialize(val));'
    );
    lines.push('            }');
    lines.push('            return "{" + string.Join(",", propEntries.ToArray()) + "}";');
    lines.push('        }');
    lines.push('');
    lines.push('        private static string EscapeString(string s)');
    lines.push('        {');
    lines.push('            return s.Replace("\\\\", "\\\\\\\\")');
    lines.push('                    .Replace("\\"", "\\\\\\"")');
    lines.push('                    .Replace("\\n", "\\\\n")');
    lines.push('                    .Replace("\\r", "\\\\r")');
    lines.push('                    .Replace("\\t", "\\\\t");');
    lines.push('        }');
    lines.push('    }');
    lines.push('    #endregion');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }
}
