const UTF8_ENCODER = new TextEncoder();
const ENCODE_TABLES = new Map<string, Map<string, readonly number[]>>();

function getEncodeTable(charset: string): Map<string, readonly number[]> {
  const key = charset.toLowerCase();
  const cached = ENCODE_TABLES.get(key);
  if (cached) return cached;

  const decoder = new TextDecoder(charset, { fatal: true });
  const table = new Map<string, readonly number[]>();
  const single = new Uint8Array(1);

  for (let b = 0; b < 0x100; b++) {
    single[0] = b;
    try {
      const ch = decoder.decode(single);
      if (ch.length === 1 && !table.has(ch)) {
        table.set(ch, [b]);
      }
    } catch {
      // Multi-byte lead byte or unmapped byte
    }
  }

  // Populate 2-byte sequences for multi-byte encodings (Shift_JIS, EUC-JP, GBK, Big5, EUC-KR)
  if (table.size < 256) {
    const pair = new Uint8Array(2);
    for (let lead = 0x81; lead <= 0xfe; lead++) {
      pair[0] = lead;
      for (let trail = 0x40; trail <= 0xfe; trail++) {
        if (trail === 0x7f) continue;
        pair[1] = trail;
        try {
          const ch = decoder.decode(pair);
          if (ch.length === 1 && !table.has(ch)) {
            table.set(ch, [lead, trail]);
          }
        } catch {
          // Invalid 2-byte sequence in this charset
        }
      }
    }
  }

  ENCODE_TABLES.set(key, table);
  return table;
}

/** Configures conversion at byte boundaries; editor strings remain Unicode. */
export class TextEncoding {
  private charset_: string;

  constructor(charset = 'utf-8') {
    this.charset_ = TextEncoding.validate(charset);
  }

  get charset(): string {
    return this.charset_;
  }

  setCharset(charset: string): void {
    this.charset_ = TextEncoding.validate(charset);
  }

  /** Unrepresentable characters are replaced according to the selected codec. */
  encode(value: string): Uint8Array {
    const normalized = this.charset_.toLowerCase();
    if (normalized === 'utf-8' || normalized === 'utf8') {
      return UTF8_ENCODER.encode(value);
    }

    const table = getEncodeTable(this.charset_);
    const bytes: number[] = [];
    for (const ch of value) {
      const seq = table.get(ch);
      if (seq) {
        for (let i = 0; i < seq.length; i++) bytes.push(seq[i]!);
      } else {
        bytes.push(0x3f);
      }
    }
    return new Uint8Array(bytes);
  }

  /** Invalid byte sequences are replaced according to the selected codec. */
  decode(value: Uint8Array): string {
    return new TextDecoder(this.charset_).decode(value);
  }

  private static validate(charset: string): string {
    // Throws RangeError if charset is not a valid WHATWG encoding label
    new TextDecoder(charset);
    return charset;
  }
}
