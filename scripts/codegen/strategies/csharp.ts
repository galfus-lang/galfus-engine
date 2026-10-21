import type { CodegenContext, CodegenStrategy } from './strategy.ts';
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

function renderFieldType(type: FieldType, optional?: boolean, enumNames?: Set<string>): string {
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

function renderCSharpDescriptor(desc: DescSpec, enumNames?: Set<string>): string[] {
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
      '    #region Native Value Types',
      '    [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct GalfusTransform3D { public float position_x, position_y, position_z, rotation_x, rotation_y, rotation_z, rotation_w, scale_x, scale_y, scale_z; }',
      '    [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct GalfusTransform2D { public float position_x, position_y, rotation, scale_x, scale_y; public int z_layer, draw_order; }',
      '    [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct GalfusCameraLookAt3D { public uint enabled; public float target_x, target_y, target_z, up_x, up_y, up_z; }',
      '    [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct GalfusSpatialAudio { public float emitter_x, emitter_y, emitter_z, emitter_rotation_x, emitter_rotation_y, emitter_rotation_z, emitter_rotation_w, listener_x, listener_y, listener_z, listener_rotation_x, listener_rotation_y, listener_rotation_z, listener_rotation_w, volume, min_distance, max_distance, rolloff, speed; public uint looping; }',
      '    [StructLayout(LayoutKind.Sequential)] public struct GalfusPlatformEvent { public ushort kind, event_type; public uint flags, window_id, subject_id; public ulong id; public float value0, value1, value2, value3, value4; public uint text0_offset, text0_length, text1_offset, text1_length, text2_offset, text2_length; }',
      '    [StructLayout(LayoutKind.Sequential)] public struct GalfusEventBatch { public ulong batch_id; public IntPtr events; public uint event_count; public IntPtr text_data; public uint text_length; }',
      '    #endregion',
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
        .map((p) =>
          isNativeStruct(p.type)
            ? `${p.out ? 'out' : 'ref'} Galfus${p.type.nativeStruct} ${escapeIdent(p.name)}`
            : `${mapNativeType(p.type, true)} ${escapeIdent(p.name)}`
        )
        .join(', ');

      lines.push(`        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]`);
      lines.push(`        public static extern ${ret} ${fn.cName}(${params});`);
      lines.push('');
    }

    lines.push('    }');
    lines.push('    #endregion', '');

    lines.push('    #region Descriptors');
    const enumNames = new Set(
      context.descriptors.filter((d) => d.kind === 'enum').map((d) => d.name)
    );
    for (const desc of context.descriptors) {
      lines.push(...renderCSharpDescriptor(desc, enumNames));
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

    lines.push('        #region Platform Event Decoding');
    lines.push('        private static object EventEnum(string value)');
    lines.push('        {');
    lines.push(
      '            if (value.StartsWith("Other(") && value.EndsWith(")")) return new Dictionary<string, object> { { "other", int.Parse(value.Substring(6, value.Length - 7)) } };'
    );
    lines.push(
      '            return string.IsNullOrEmpty(value) ? value : char.ToLowerInvariant(value[0]) + value.Substring(1);'
    );
    lines.push('        }');
    lines.push('');
    lines.push(
      '        private static List<Dictionary<string, object>> DecodeEventBatch(GalfusEventBatch batch)'
    );
    lines.push('        {');
    lines.push('            try');
    lines.push('            {');
    lines.push('                byte[] text = new byte[batch.text_length];');
    lines.push(
      '                if (batch.text_length > 0) Marshal.Copy(batch.text_data, text, 0, (int)batch.text_length);'
    );
    lines.push(
      '                Func<uint, uint, string> readText = (offset, length) => length == 0 ? "" : Encoding.UTF8.GetString(text, (int)offset, (int)length);'
    );
    lines.push('                var result = new List<Dictionary<string, object>>();');
    lines.push(
      '                string[] windowTypes = { "resized", "moved", "closeRequested", "focusChanged", "occluded", "scaleFactorChanged", "redrawRequested" };'
    );
    lines.push(
      '                string[] pointerTypes = { "move", "button", "enter", "leave", "cancel", "scroll" };'
    );
    lines.push(
      '                string[] gamepadTypes = { "connected", "disconnected", "button", "axis" };'
    );
    lines.push('                string[] pointerKinds = { "mouse", "touch", "pen" };');
    lines.push('                for (int index = 0; index < batch.event_count; index++)');
    lines.push('                {');
    lines.push(
      '                    var item = Marshal.PtrToStructure<GalfusPlatformEvent>(IntPtr.Add(batch.events, index * 72));'
    );
    lines.push(
      '                    uint flags = item.flags; string text0 = readText(item.text0_offset, item.text0_length), text1 = readText(item.text1_offset, item.text1_length), text2 = readText(item.text2_offset, item.text2_length);'
    );
    lines.push(
      '                    var modifiers = new Dictionary<string, object> { { "shift", (flags & 2) != 0 }, { "ctrl", (flags & 4) != 0 }, { "alt", (flags & 8) != 0 }, { "superKey", (flags & 16) != 0 } };'
    );
    lines.push('                    var value = new Dictionary<string, object>();');
    lines.push(
      '                    if (item.kind == 1) { value["kind"] = "window"; value["type"] = windowTypes[item.event_type - 1]; value["windowId"] = item.window_id; if (item.event_type == 1) { value["width"] = item.value0; value["height"] = item.value1; value["scaleFactor"] = item.value2; } else if (item.event_type == 2) { value["x"] = item.value0; value["y"] = item.value1; } else if (item.event_type == 4) value["focused"] = (flags & 1) != 0; else if (item.event_type == 5) value["occluded"] = (flags & 1) != 0; else if (item.event_type == 6) value["scaleFactor"] = item.value0; }'
    );
    lines.push(
      '                    else if (item.kind == 2) { value["kind"] = "pointer"; value["type"] = pointerTypes[item.event_type - 1]; value["windowId"] = item.window_id; value["pointerId"] = item.id; value["pointerType"] = pointerKinds[item.subject_id - 1]; value["position"] = new float[] { item.value0, item.value1 }; if (item.event_type == 1) { value["delta"] = new float[] { item.value2, item.value3 }; value["pressure"] = item.value4; } else if (item.event_type == 2) { value["button"] = EventEnum(text0); value["state"] = (flags & 1) != 0 ? "pressed" : "released"; value["pressure"] = item.value2; } else if (item.event_type == 6) value["delta"] = new Dictionary<string, object> { { (flags & 64) != 0 ? "pixels" : "lines", new float[] { item.value2, item.value3 } } }; }'
    );
    lines.push(
      '                    else if (item.kind == 3) { value["kind"] = "keyboard"; value["type"] = item.event_type == 1 ? "input" : "modifiersChanged"; value["windowId"] = item.window_id; value["modifiers"] = modifiers; if (item.event_type == 1) { value["physicalKey"] = EventEnum(text0); value["logicalKey"] = (flags & 128) != 0 ? (object)new Dictionary<string, object> { { "named", EventEnum(text1) } } : text1; value["state"] = (flags & 1) != 0 ? "pressed" : "released"; value["repeat"] = (flags & 32) != 0; } if ((flags & 256) != 0) value["text"] = text2; }'
    );
    lines.push(
      '                    else { value["kind"] = "gamepad"; value["type"] = gamepadTypes[item.event_type - 1]; value["gamepadId"] = item.subject_id; if (item.event_type == 1) value["name"] = text0; else if (item.event_type == 3) { value["button"] = EventEnum(text0); value["state"] = (flags & 1) != 0 ? "pressed" : "released"; } else if (item.event_type == 4) { value["axis"] = EventEnum(text0); value["value"] = item.value0; } }'
    );
    lines.push('                    result.Add(value);');
    lines.push('                }');
    lines.push('                return result;');
    lines.push('            }');
    lines.push('            finally');
    lines.push('            {');
    lines.push(
      '                if (Native.galfus_platform_release_event_batch(batch.batch_id) != 0) throw new GalfusError("platformReleaseEventBatch failed: " + PtrToStringUtf8AndFree(Native.galfus_get_last_error()));'
    );
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
      const outParam = fn.params.find((p) => p.out && isNativeStruct(p.type));
      const outStruct =
        outParam && isNativeStruct(outParam.type) ? outParam.type.nativeStruct : undefined;
      const isReturnI32 = fn.returnType === 'i32';
      const isReturnString =
        fn.returnType === 'string' || isJson(fn.returnType) || isJsonArray(fn.returnType);
      const isReturnBool = fn.returnType === 'bool';

      // Determine C# method return type
      let returnTypeStr = 'void';
      if (outStruct === 'EventBatch') returnTypeStr = 'List<Dictionary<string, object>>';
      else if (outStruct) returnTypeStr = `Galfus${outStruct}`;
      else if (isReturnString) returnTypeStr = 'string';
      else if (isReturnBool) returnTypeStr = 'bool';

      // 1. Primitive / Raw JSON string method
      const stringParamSig = fn.params
        .filter((p) => !p.out)
        .map((p) => {
          if (isNativeStruct(p.type)) return `Galfus${p.type.nativeStruct} ${escapeIdent(p.name)}`;
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

      if (outParam && outStruct) {
        lines.push(`                Galfus${outStruct} ${escapeIdent(outParam.name)};`);
      }
      const nativeArgs = fn.params
        .map((p) => {
          if (p.out && isNativeStruct(p.type)) return `out ${escapeIdent(p.name)}`;
          if (isNativeStruct(p.type)) return `ref ${escapeIdent(p.name)}`;
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
        if (outStruct === 'EventBatch' && outParam)
          lines.push(`                return DecodeEventBatch(${escapeIdent(outParam.name)});`);
        else if (outParam) lines.push(`                return ${escapeIdent(outParam.name)};`);
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
          .filter((p) => !p.out)
          .map((p) => {
            if (isNativeStruct(p.type))
              return `Galfus${p.type.nativeStruct} ${escapeIdent(p.name)}`;
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
          .filter((p) => !p.out)
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

      // 3. Out uint overloads for size functions
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
