import { describe, expect, it } from 'bun:test';
import { TextEditor } from '../src/text/editor';
import { applyTextKeyboardEvent } from '../src/text/keyboard';
import type { KeyboardEvent } from '@galfus/transport-types';

describe('text editor', () => {
  it('navigates and deletes complete Unicode graphemes', () => {
    const editor = new TextEditor('a👩‍👩‍👧‍👦e\u0301');
    editor.move('left');
    editor.backspace();
    expect(editor.value).toBe('ae\u0301');
    editor.deleteForward();
    expect(editor.value).toBe('a');
  });

  it('treats flags, skin tones and Indic conjuncts as graphemes', () => {
    for (const value of ['🇧🇷', '👍🏽', 'क्ष']) {
      const editor = new TextEditor(value);
      editor.backspace();
      expect(editor.value).toBe('');
    }
  });

  it('retains selection direction and replaces the selected range', () => {
    const editor = new TextEditor('abcd');
    editor.setSelection(3, 1);
    editor.insert('漢字');
    expect(editor.value).toBe('a漢字d');
    expect(editor.selection).toEqual({ anchor: 3, focus: 3 });
    editor.move('left', true);
    expect(editor.selection).toEqual({ anchor: 3, focus: 2 });
  });

  it('keeps the original text and selection until composition commits', () => {
    const editor = new TextEditor('hello');
    editor.setSelection(1, 4);
    editor.updateComposition('かな', [1, 2]);
    expect(editor.value).toBe('hello');
    expect(editor.displayValue).toBe('hかなo');
    editor.cancelComposition();
    expect(editor.selection).toEqual({ anchor: 1, focus: 4 });
    editor.updateComposition('か');
    editor.commitComposition('漢字');
    expect(editor.value).toBe('h漢字o');
  });

  it('never leaves the caret within a newly combined grapheme', () => {
    const editor = new TextEditor('e');
    editor.insert('\u0301');
    expect(editor.selection.focus).toBe(2);
    editor.backspace();
    expect(editor.value).toBe('');
  });

  it('applies a composition once and ignores editing keys during the preview', () => {
    const editor = new TextEditor('ab');
    const key = (logicalKey: string, text?: string): KeyboardEvent => ({
      kind: 'keyboard',
      type: 'input',
      windowId: 1,
      physicalKey: 'unknown',
      logicalKey,
      state: 'pressed',
      text,
      modifiers: { shift: false, ctrl: false, alt: false, superKey: false },
      repeat: false
    });
    applyTextKeyboardEvent(editor, {
      kind: 'keyboard',
      type: 'imePreedit',
      windowId: 1,
      text: 'かな'
    });
    applyTextKeyboardEvent(editor, key('Backspace'));
    expect(editor.displayValue).toBe('abかな');
    applyTextKeyboardEvent(editor, {
      kind: 'keyboard',
      type: 'imeCommit',
      windowId: 1,
      text: '仮名'
    });
    applyTextKeyboardEvent(editor, {
      kind: 'keyboard',
      type: 'textInput',
      windowId: 1,
      text: '仮名'
    });
    expect(editor.value).toBe('ab仮名');
    applyTextKeyboardEvent(editor, key('Backspace'));
    expect(editor.value).toBe('ab仮');
    applyTextKeyboardEvent(editor, key('x', 'x'));
    applyTextKeyboardEvent(editor, { kind: 'keyboard', type: 'textInput', windowId: 1, text: 'x' });
    expect(editor.value).toBe('ab仮x');
  });
});
