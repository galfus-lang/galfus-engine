import type { KeyboardEvent } from '@galfus/transport-types';
import { TextEditor } from './editor';

/** Maps platform keyboard and composition events to a single editor. */
export function applyTextKeyboardEvent(editor: TextEditor, event: KeyboardEvent): void {
  switch (event.type) {
    case 'imePreedit':
      if (event.text) editor.updateComposition(event.text, event.selection);
      else editor.cancelComposition();
      return;
    case 'imeCommit':
    case 'imeDisabled':
      editor.cancelComposition();
      return;
    case 'textInput':
      editor.insert(event.text);
      return;
    case 'input':
      break;
    default:
      return;
  }
  if (event.state !== 'pressed' || editor.composition) return;
  const { shift, ctrl, alt, superKey } = event.modifiers;
  const isControl = (ctrl || superKey) && !alt;
  if (isControl && event.logicalKey.toLowerCase() === 'a') {
    editor.selectAll();
    return;
  }
  switch (event.logicalKey) {
    case 'ArrowLeft':
      editor.move('left', shift, isControl);
      return;
    case 'ArrowRight':
      editor.move('right', shift, isControl);
      return;
    case 'Home':
      if (!isControl) editor.moveToBoundary('start', shift);
      return;
    case 'End':
      if (!isControl) editor.moveToBoundary('end', shift);
      return;
    case 'Backspace':
      editor.backspace(isControl);
      return;
    case 'Delete':
      editor.deleteForward(isControl);
      return;
  }
}
