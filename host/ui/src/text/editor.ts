import { graphemeSegments } from 'unicode-segmenter/grapheme';

/** UTF-16 offsets at grapheme boundaries. Anchor and focus preserve selection direction. */
export interface TextSelection {
  readonly anchor: number;
  readonly focus: number;
}

export interface TextComposition {
  readonly text: string;
  /** UTF-16 offsets within the preview, when supplied by the input method. */
  readonly selection?: readonly [number, number];
}

function charType(grapheme: string): 'space' | 'word' | 'punct' {
  if (/^\s+$/u.test(grapheme)) return 'space';
  if (/^[\p{L}\p{M}\p{N}_]+$/u.test(grapheme)) return 'word';
  return 'punct';
}

/** Platform-independent text editing state. Text remains Unicode inside the host. */
export class TextEditor {
  private value_: string;
  private boundaries: number[] = [];
  private anchor_: number;
  private focus_: number;
  private composition_: TextComposition | undefined;

  constructor(value = '') {
    this.value_ = value;
    this.rebuildBoundaries();
    this.anchor_ = this.focus_ = value.length;
  }

  get value(): string {
    return this.value_;
  }

  get selection(): TextSelection {
    return { anchor: this.anchor_, focus: this.focus_ };
  }

  get selectedText(): string {
    const [start, end] = this.range();
    return this.value_.slice(start, end);
  }

  get composition(): TextComposition | undefined {
    return this.composition_;
  }

  /** Includes the preview in place of the selected text, without committing it. */
  get displayValue(): string {
    if (!this.composition_) return this.value_;
    const [start, end] = this.range();
    return this.value_.slice(0, start) + this.composition_.text + this.value_.slice(end);
  }

  setValue(value: string): void {
    this.composition_ = undefined;
    this.value_ = value;
    this.rebuildBoundaries();
    this.anchor_ = this.focus_ = value.length;
  }

  setSelection(anchor: number, focus = anchor): void {
    const nextAnchor = this.snap(anchor);
    const nextFocus = this.snap(focus);
    this.composition_ = undefined;
    this.anchor_ = nextAnchor;
    this.focus_ = nextFocus;
  }

  selectAll(): void {
    this.setSelection(0, this.value_.length);
  }

  insert(text: string): void {
    this.composition_ = undefined;
    this.replaceSelection(text);
  }

  backspace(byWord = false): void {
    this.delete('backward', byWord);
  }

  deleteForward(byWord = false): void {
    this.delete('forward', byWord);
  }

  move(direction: 'left' | 'right', extend = false, byWord = false): void {
    if (this.composition_) return;
    const [start, end] = this.range();
    const position =
      !extend && start !== end
        ? direction === 'left'
          ? start
          : end
        : direction === 'left'
          ? byWord
            ? this.previousWord(this.focus_)
            : this.previous(this.focus_)
          : byWord
            ? this.nextWord(this.focus_)
            : this.next(this.focus_);
    this.focus_ = position;
    if (!extend) this.anchor_ = position;
  }

  moveToBoundary(boundary: 'start' | 'end', extend = false): void {
    if (this.composition_) return;
    this.focus_ = boundary === 'start' ? 0 : this.value_.length;
    if (!extend) this.anchor_ = this.focus_;
  }

  updateComposition(text: string, selection?: readonly [number, number]): void {
    this.composition_ = selection ? { text, selection: [selection[0], selection[1]] } : { text };
  }

  commitComposition(text: string): void {
    this.composition_ = undefined;
    this.replaceSelection(text);
  }

  cancelComposition(): void {
    this.composition_ = undefined;
  }

  private delete(direction: 'backward' | 'forward', byWord: boolean): void {
    if (this.composition_) return;
    if (this.anchor_ === this.focus_) {
      if (direction === 'backward') {
        this.anchor_ = byWord ? this.previousWord(this.focus_) : this.previous(this.focus_);
      } else {
        this.focus_ = byWord ? this.nextWord(this.focus_) : this.next(this.focus_);
      }
    }
    this.replaceSelection('');
  }

  private range(): [number, number] {
    return [Math.min(this.anchor_, this.focus_), Math.max(this.anchor_, this.focus_)];
  }

  private replaceSelection(text: string): void {
    const [start, end] = this.range();
    if (start === end && text.length === 0) return;
    this.value_ = this.value_.slice(0, start) + text + this.value_.slice(end);
    this.rebuildBoundaries();
    // Inserted text can combine with neighboring code points into one grapheme.
    const desired = start + text.length;
    this.anchor_ = this.focus_ =
      this.boundaries.find((boundary) => boundary >= desired) ?? this.value_.length;
  }

  private rebuildBoundaries(): void {
    this.boundaries.length = 0;
    for (const segment of graphemeSegments(this.value_)) this.boundaries.push(segment.index);
    this.boundaries.push(this.value_.length);
  }

  private snap(offset: number): number {
    if (!Number.isFinite(offset)) throw new RangeError('Text selection offset must be finite.');
    const clamped = Math.max(0, Math.min(this.value_.length, Math.trunc(offset)));
    let result = 0;
    for (const boundary of this.boundaries) {
      if (boundary > clamped) break;
      result = boundary;
    }
    return result;
  }

  private previous(offset: number): number {
    let result = 0;
    for (const boundary of this.boundaries) {
      if (boundary >= offset) break;
      result = boundary;
    }
    return result;
  }

  private next(offset: number): number {
    return this.boundaries.find((boundary) => boundary > offset) ?? this.value_.length;
  }

  private previousWord(offset: number): number {
    let current = this.snap(offset);
    if (current === 0) return 0;
    while (current > 0) {
      const prev = this.previous(current);
      if (charType(this.value_.slice(prev, current)) !== 'space') break;
      current = prev;
    }
    if (current === 0) return 0;
    const prev = this.previous(current);
    const targetType = charType(this.value_.slice(prev, current));
    while (current > 0) {
      const p = this.previous(current);
      if (charType(this.value_.slice(p, current)) !== targetType) break;
      current = p;
    }
    return current;
  }

  private nextWord(offset: number): number {
    let current = this.snap(offset);
    const length = this.value_.length;
    if (current >= length) return length;
    while (current < length) {
      const next = this.next(current);
      if (charType(this.value_.slice(current, next)) !== 'space') break;
      current = next;
    }
    if (current >= length) return length;
    const next = this.next(current);
    const targetType = charType(this.value_.slice(current, next));
    while (current < length) {
      const n = this.next(current);
      if (charType(this.value_.slice(current, n)) !== targetType) break;
      current = n;
    }
    return current;
  }
}
