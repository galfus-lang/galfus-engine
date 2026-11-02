import { describe, expect, it } from 'bun:test';
import { TextEncoding } from '../src/text/encoding';
import { createRuntime } from '../src/runtime';
import type { GalfusTransport } from '@galfus/transport-types';

describe('runtime text encoding', () => {
  it('defaults to UTF-8 and preserves Unicode independently of byte encoding', () => {
    const encoding = new TextEncoding();
    expect(encoding.charset).toBe('utf-8');
    expect(Array.from(encoding.encode('é漢'))).toEqual([0xc3, 0xa9, 0xe6, 0xbc, 0xa2]);
    expect(encoding.decode(encoding.encode('é漢'))).toBe('é漢');
    encoding.setCharset('shift_jis');
    expect(Array.from(encoding.encode('日本'))).toEqual([0x93, 0xfa, 0x96, 0x7b]);
    expect(encoding.decode(new Uint8Array([0x93, 0xfa, 0x96, 0x7b]))).toBe('日本');
  });

  it('rejects unknown charsets without changing the previous configuration', () => {
    const encoding = new TextEncoding('windows-1252');
    expect(() => encoding.setCharset('not-a-charset')).toThrow(RangeError);
    expect(encoding.charset).toBe('windows-1252');
    expect(encoding.decode(encoding.encode('€'))).toBe('€');
    expect(encoding.decode(new Uint8Array([0, 0x80, 0]).subarray(1, 2))).toBe('€');
  });

  it('accepts and updates the charset independently for each runtime', () => {
    const transport = { isDisposed: false, isInitialized: false } as GalfusTransport;
    const first = createRuntime(transport);
    const second = createRuntime(transport, { charset: 'shift_jis' });
    expect(first.textEncoding.charset).toBe('utf-8');
    expect(second.textEncoding.charset).toBe('shift_jis');
    second.textEncoding.setCharset('windows-1252');
    expect(first.textEncoding.charset).toBe('utf-8');
    expect(second.textEncoding.encode('€')[0]).toBe(0x80);
  });
});
