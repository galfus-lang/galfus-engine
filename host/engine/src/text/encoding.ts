import { Buffer } from 'buffer';
import * as iconv from 'iconv-lite';

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
    return Uint8Array.from(iconv.encode(value, this.charset_));
  }

  /** Invalid byte sequences are replaced according to the selected codec. */
  decode(value: Uint8Array): string {
    return iconv.decode(
      Buffer.from(value.buffer, value.byteOffset, value.byteLength),
      this.charset_
    );
  }

  private static validate(charset: string): string {
    if (!iconv.encodingExists(charset))
      throw new RangeError(`Unsupported text charset: ${charset}`);
    return charset;
  }
}
