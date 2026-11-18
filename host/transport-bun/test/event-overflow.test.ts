import { describe, expect, it } from 'bun:test';
import { ptr, toArrayBuffer } from 'bun:ffi';
import { GalfusBun } from '../src/sdk/galfus';

describe('Bun FFI event decoding', () => {
  it('preserves long IME text, UTF-16 selection, and embedded zero bytes', () => {
    const value = `${'é'.repeat(45)}\0漢😀`;
    const encoder = new TextEncoder();
    const fields = [encoder.encode(value), new Uint8Array(1), new Uint8Array(1)];
    const record = new Uint8Array(128);
    const view = new DataView(record.buffer);
    view.setUint16(0, 3, true);
    view.setUint16(2, 4, true);
    view.setUint32(4, 513, true);
    view.setUint32(8, 9, true);
    view.setUint32(12, 40, true);
    view.setBigUint64(16, 48n, true);
    const decoder = Object.create(GalfusBun.prototype) as any;
    decoder._textDecoder = new TextDecoder();
    decoder._lib = {
      symbols: {
        galfus_platform_event_text(field: number, lengthPtr: number) {
          new DataView(toArrayBuffer(lengthPtr, 0, 4)).setUint32(
            0,
            field === 0 ? fields[0]!.length : 0,
            true
          );
          return ptr(fields[field]!);
        }
      }
    };
    expect(decoder.decodePlatformEvents(record)).toEqual([
      { kind: 'keyboard', type: 'imePreedit', windowId: 9, text: value, selection: [40, 48] }
    ]);
  });
});
