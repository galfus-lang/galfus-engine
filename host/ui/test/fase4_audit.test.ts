import { describe, expect, it } from 'bun:test';
import { setup } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createUi, UiInputText } from '../src/index';
import { UiSlider } from '../src/value/slider';
import { UiProgressBar } from '../src/widgets/progress';

describe('Fase 4 Audit Fixes', () => {
  describe('A01: Retention leak fix in UiSystem roots & realm disposal', () => {
    it('automatically removes disposed UiRoot and NativeUiModel instances from UiSystem', () => {
      const { runtime, realm } = setup();
      try {
        const ui = createUi(runtime);
        const roots: any[] = [];
        const nativeRoots: any[] = [];

        for (let i = 0; i < 50; i++) {
          const root = ui.createRoot(realm, { width: 100, height: 100 });
          roots.push(root);
          const nativeRoot = ui.createNativeRoot(realm, { width: 100, height: 100 });
          nativeRoots.push(nativeRoot);
        }

        expect((ui as any)._roots.size).toBe(50);
        expect((ui as any)._nativeRoots.size).toBe(50);

        for (const root of roots) {
          root.dispose();
        }
        for (const nativeRoot of nativeRoots) {
          nativeRoot.dispose();
        }

        expect((ui as any)._roots.size).toBe(0);
        expect((ui as any)._nativeRoots.size).toBe(0);
      } finally {
        runtime.dispose();
      }
    });

    it('disposes UiRoot and NativeUiModel when the owning Realm2D is disposed', () => {
      const { runtime } = setup();
      try {
        const realm = runtime.createRealm2D(20);
        const ui = createUi(runtime);

        const root = ui.createRoot(realm, { width: 100, height: 100 });
        const nativeRoot = ui.createNativeRoot(realm, { width: 100, height: 100 });

        expect((ui as any)._roots.size).toBe(1);
        expect((ui as any)._nativeRoots.size).toBe(1);

        realm.dispose();

        expect((root as any)._disposed).toBe(true);
        expect((nativeRoot as any).disposed).toBe(true);
        expect((ui as any)._roots.size).toBe(0);
        expect((ui as any)._nativeRoots.size).toBe(0);
      } finally {
        runtime.dispose();
      }
    });
  });

  describe('A05: Transactional recovery in constructors and flush', () => {
    it('cleans up UI and entity when UiRoot construction fails post-createUi', () => {
      const { runtime, realm } = setup();
      try {
        const ui = createUi(runtime);
        // Force failure by mocking addCollider to throw
        const origAddCollider = realm.addCollider;
        realm.addCollider = () => {
          throw new Error('simulated collider failure');
        };

        expect(() => {
          ui.createRoot(realm, { width: 100, height: 100 });
        }).toThrow('simulated collider failure');

        realm.addCollider = origAddCollider;
        // Verify no entities remained in world
        expect(realm.world.query('Model2DUI').length).toBe(0);
      } finally {
        runtime.dispose();
      }
    });

    it('cleans up UI and entity when NativeUiModel construction fails post-createUi', () => {
      const { runtime, realm } = setup();
      try {
        const ui = createUi(runtime);
        const origAddCollider = realm.addCollider;
        realm.addCollider = () => {
          throw new Error('simulated native failure');
        };

        expect(() => {
          ui.createNativeRoot(realm, { width: 100, height: 100 });
        }).toThrow('simulated native failure');

        realm.addCollider = origAddCollider;
        expect(realm.world.query('Model2DUI').length).toBe(0);
      } finally {
        runtime.dispose();
      }
    });

    it('preserves dirty flags in UiRoot if flush() throws', () => {
      const { runtime, realm } = setup();
      try {
        const ui = createUi(runtime);
        const root = ui.createRoot(realm, { width: 100, height: 100 });

        const origSetUiContent = realm.setUiContent;
        realm.setUiContent = () => {
          throw new Error('simulated setUiContent failure');
        };

        expect(() => {
          root.rootPanel.addPanel({ width: 50, height: 50 });
        }).toThrow('simulated setUiContent failure');

        // Dirty flag should still be true to allow retry
        expect((root as any)._structureDirty).toBe(true);

        realm.setUiContent = origSetUiContent;
        root.flush();
        expect((root as any)._structureDirty).toBe(false);
      } finally {
        runtime.dispose();
      }
    });
  });

  describe('N05: NativeUiModel ID allocation safety and duplicate rejection', () => {
    it('rejects duplicate explicit element IDs in NativeUiModel', () => {
      const { runtime, realm } = setup();
      try {
        const ui = createUi(runtime);
        const model = ui.createNativeRoot(realm, { width: 200, height: 200, rootId: 10 });

        model.createChild(10, { type: 'panel' }, {}, 20);
        expect(() => {
          model.createChild(10, { type: 'panel' }, {}, 20);
        }).toThrow('UI element ID 20 is already in use.');

        // High explicit ID (last valid before reserved range) must not push nextId into reserved range
        model.createChild(10, { type: 'panel' }, {}, 4294901760);
        const autoId = model.createChild(10, { type: 'panel' }, {});
        expect(autoId).toBeLessThanOrEqual(4294901760);
      } finally {
        runtime.dispose();
      }
    });
  });

  describe('N08: Terminal event delivery in ComponentRoot.onPanel when disabled mid-interaction', () => {
    it('delivers pressup to UiSlider even if disabled during a drag', () => {
      const { runtime, realm, windowId } = setup();
      realm.getUiLayout = () =>
        ({
          absoluteRect: [0, 0, 100, 20],
          contentRect: [0, 0, 100, 20],
          margin: [0, 0, 0, 0],
          padding: [0, 0, 0, 0],
          border: [0, 0, 0, 0]
        }) as any;
      try {
        const ui = createUi(runtime);
        const root = ui.createComponentRoot(realm, { width: 300, height: 100, windowId });
        const slider = new UiSlider(root.root, { min: 0, max: 100, value: 50 });
        root.flush();

        const listener = (root as any).panelListener(slider.track.id);

        // Simulate pointer down on the slider track
        listener.emit({
          type: 'down',
          realmId: realm.realmId,
          target: { type: 'ui', uiId: root.uiId, elementId: slider.track.id },
          pointer: {
            id: 1,
            pointerId: 1,
            type: 'button',
            button: 'primary',
            windowId,
            position: [50, 20]
          } as any
        });
        expect((slider as any).pressed).toBeDefined();

        // Disable slider mid-drag
        slider.setDisabled(true);
        expect(root.interactionEligible(slider.panel.id)).toBe(false);

        // Emit pressup on the slider track
        listener.emit({
          type: 'pressup',
          realmId: realm.realmId,
          target: { type: 'ui', uiId: root.uiId, elementId: slider.track.id },
          pointer: {
            id: 1,
            pointerId: 1,
            type: 'button',
            button: 'primary',
            windowId,
            position: [50, 20]
          } as any
        });

        // The slider must have received pressup and released pressed state
        expect((slider as any).pressed).toBeUndefined();
      } finally {
        runtime.dispose();
      }
    });
  });

  describe('N09: Immediate cleanup on UiTextField.dispose() and textInputs clearing', () => {
    it('cleans up IME and listeners immediately on textField.dispose()', () => {
      const { runtime, realm, windowId } = setup();
      try {
        const ui = createUi(runtime);
        const root = ui.createComponentRoot(realm, { width: 300, height: 100, windowId });
        const field = new UiInputText(ui, root.root, { value: 'initial' });
        root.flush();

        field.requestFocus(windowId);
        expect((field as any).disposed).toBe(false);

        // Dispose field directly
        field.dispose();
        expect((field as any).disposed).toBe(true);
        expect((field as any).windows.size).toBe(0);
      } finally {
        runtime.dispose();
      }
    });
  });

  describe('N11: Isolated tick channel for UI widgets immune to runtime.clearListeners()', () => {
    it('keeps UiProgressBar ticking even after runtime.clearListeners("tick") is called', () => {
      const { runtime, transport, realm, windowId } = setup();
      try {
        const ui = createUi(runtime);
        const root = ui.createComponentRoot(realm, { width: 300, height: 100, windowId });
        // Indeterminate progress bar (value: null) animates via tick
        const progress = new UiProgressBar(ui, root.root, { value: null });
        root.flush();

        const initialPhase = (progress as any).phase;

        // User code clears public runtime listeners
        runtime.clearListeners('tick');

        // Advance frame
        advanceFrame(runtime, transport, 0.016);
        expect((progress as any).phase).toBeGreaterThan(initialPhase);

        // Full clearListeners()
        runtime.clearListeners();
        const nextPhase = (progress as any).phase;
        advanceFrame(runtime, transport, 0.016);
        expect((progress as any).phase).toBeGreaterThan(nextPhase);
      } finally {
        runtime.dispose();
      }
    });
  });
});
