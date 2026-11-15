import type { Realm2D } from '@galfus/engine';
import type { UiSystem } from '../src/system';

/** A panel activated by pointer, Enter, or Space and styled for each interaction state. */
export function mountInteractionExample(ui: UiSystem, realm: Realm2D, windowId?: number) {
  const context = ui.createComponentRoot(realm, { width: 240, height: 80, windowId });
  const panel = context.root.addPanel(
    {},
    {
      width: { type: 'exact', value: 200 },
      height: { type: 'exact', value: 50 }
    }
  );
  panel.setFocusable(0);
  panel.setStateStyle('hover', { backgroundColor: [0.2, 0.3, 0.5, 1] });
  panel.setStateStyle('active', { backgroundColor: [0.1, 0.2, 0.4, 1] });
  panel.setStateStyle('focusVisible', { borderWidth: [2, 2, 2, 2], borderColor: [1, 1, 1, 1] });
  const label = panel.addText('Activate with mouse or keyboard');
  let count = 0;
  panel.onActivate(() => {
    label.setText(`Activated ${++count} times`);
    context.flush();
  });
  context.flush();
  return context;
}
