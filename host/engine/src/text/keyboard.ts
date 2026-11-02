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
      editor.cancelComposition();
      return;
    case 'textInput':
      editor.insert(event.text);
      return;
    case 'imeDisabled':
      editor.cancelComposition();
      return;
    case 'input':
      break;
    default:
      return;
  }
  if (event.state !== 'pressed' || editor.composition) return;
  const { shift, ctrl, alt, superKey } = event.modifiers;
  const shortcut = superKey || (ctrl && !alt);
  if (shortcut && event.logicalKey.toLowerCase() === 'a') {
    editor.selectAll();
    return;
  }
  if (shortcut) return;
  switch (event.logicalKey) {
    case 'ArrowLeft':
      editor.move('left', shift);
      return;
    case 'ArrowRight':
      editor.move('right', shift);
      return;
    case 'Home':
      editor.moveToBoundary('start', shift);
      return;
    case 'End':
      editor.moveToBoundary('end', shift);
      return;
    case 'Backspace':
      editor.backspace();
      return;
    case 'Delete':
      editor.deleteForward();
      return;
  }
}
