import type { Realm2D } from '@galfus/engine';
import type { UiSystem } from '../src/system';

/** Minimal component tree with explicit update and removal operations. */
export function mountComponentExample(ui: UiSystem, realm: Realm2D) {
  const context = ui.createComponentRoot(realm, {
    width: 320,
    height: 120,
    theme: {
      tokens: { colors: { surface: [0.1, 0.2, 0.3, 1] }, typography: { body: { fontSize: 18 } } }
    }
  });
  const panel = context.root.addPanel();
  panel.setStyle({
    backgroundColor: { token: 'colors.surface' },
    padding: { token: 'spacing.medium' }
  });
  const label = panel.addText('Hello');
  context.flush();
  return {
    context,
    update(value: string) {
      label.setText(value);
      context.flush();
    },
    remove() {
      panel.remove();
      context.flush();
    },
    dispose() {
      context.dispose();
    }
  };
}
