/**
 * Demo WIN1: Cursor & Window Controls Lab
 *
 * Interactive showcase for platform cursor and window APIs:
 * - Cursor grab modes: 'none', 'confined', 'locked' (including raw delta motion and focus-loss restore)
 * - Cursor visibility toggling (`setCursorVisible`)
 * - Programmatic cursor warping (`setCursorPosition`)
 * - Cursor icon cycling (`setCursorIcon`)
 * - Window title updates, input focus requests, and live resize/focus telemetry
 */
import {
  type Camera2DComponent,
  type CursorGrabMode,
  type CursorIconName,
  isKey,
  type Model2DComponent,
  type MultiverseRuntime,
  type TargetId,
  type WindowId
} from '@galfus/engine';
import { createUi, UiAppBar, UiButtonGroup } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const CURSOR_ICONS: readonly CursorIconName[] = [
  'default',
  'pointer',
  'grab',
  'grabbing',
  'crosshair',
  'text',
  'move',
  'wait'
];

const WINDOW_TITLES: readonly string[] = [
  'Galfus Demo [win1]: Cursor & Window Lab',
  'WIN1 — Locked Motion & Warp Tester',
  'WIN1 — Platform API Sandbox'
];

export interface Win1State {
  grabMode: CursorGrabMode;
  cursorVisible: boolean;
  cursorIcon: CursorIconName;
  windowFocused: boolean;
  windowSize: [number, number];
  pointerPos: [number, number];
  lastDelta: [number, number];
  lockedAccum: [number, number];
  moveEvents: number;
  windowEvents: number;
  lastAction: string;
}

export function createWin1Scene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  windowId?: WindowId,
  initialSize: readonly [number, number] = [1024, 680]
) {
  const realm = runtime.createRealm2D();
  realm.setShadowConfig({ ambient: 1 });
  const camera = realm.createCamera({ orthoScale: initialSize[1], near: -100, far: 100 });
  runtime.multiverse.createInvocation({
    realmId: realm.realmId,
    targetId,
    clearColor: [0.03, 0.05, 0.09, 1]
  });

  // Visual arena pad & reticle in the lower half of the viewport.
  const matPad = realm.createMaterial({ baseColor: [0.06, 0.1, 0.17, 1] });
  const matReticle = realm.createMaterial({ baseColor: [0.22, 0.88, 0.96, 1] });
  const padBg = realm.createSprite(
    { dimensions: [520, 180], materialId: matPad, castShadow: false, receiveShadow: false },
    { position: [0, -170], zLayer: 0 }
  );
  const reticle = realm.createSprite(
    { dimensions: [18, 18], materialId: matReticle, castShadow: false, receiveShadow: false },
    { position: [0, -170], zLayer: 1 }
  );

  const state: Win1State = {
    grabMode: 'none',
    cursorVisible: true,
    cursorIcon: 'default',
    windowFocused: true,
    windowSize: [initialSize[0], initialSize[1]],
    pointerPos: [0, 0],
    lastDelta: [0, 0],
    lockedAccum: [0, 0],
    moveEvents: 0,
    windowEvents: 0,
    lastAction: 'Ready. Press 1/2/3 for grab, V for visibility, C/W to warp, I for icon.'
  };

  let iconIndex = 0;
  let titleIndex = 0;
  let reticleOffset: [number, number] = [0, 0];

  const ui = createUi(runtime);
  const root = ui.createComponentRoot(realm, {
    width: initialSize[0],
    height: initialSize[1],
    windowId,
    layout: { direction: 'column', padding: [20, 24, 20, 24], gap: [10, 10], alignItems: 'start' },
    theme: {
      tokens: { colors: { accent: [0.15, 0.5, 0.72, 1] } },
      components: {
        button: { variants: { accent: { backgroundColor: { token: 'colors.accent' } } } },
        appBar: {
          base: { color: [0.85, 0.94, 1, 1], typography: { fontSize: 18, fontWeight: 700 } }
        }
      }
    }
  });

  const bar = new UiAppBar(root.root, {
    spacing: 20,
    layout: { width: { type: 'percent', value: 100 }, padding: [10, 16, 10, 16] }
  });
  bar.addText('WIN 1 — CURSOR & WINDOW CONTROLS LAB');

  const windowLine = root.root.addText('', 14);
  const cursorLine = root.root.addText('', 14);
  const pointerLine = root.root.addText('', 14);
  const actionLine = root.root.addText('', 14);
  root.root.addText(
    'Hotkeys: [1] None  [2] Confined  [3] Locked  [V] Visible  [C] Center  [W] Warp(160,160)  [I] Icon  [T] Title  [R] Reset  [Esc] Unlock/Exit  [Q] Quit',
    13
  );

  const syncReticle = () => {
    realm.world
      .getComponent<Model2DComponent>(reticle, 'Model2D')
      ?.setPosition(reticleOffset[0], -170 + reticleOffset[1]);
  };

  const refreshHud = () => {
    windowLine.setText(
      `Window: size=${state.windowSize[0]}x${state.windowSize[1]} | focused=${state.windowFocused} | events=${state.windowEvents}`
    );
    cursorLine.setText(
      `Cursor: grab=${state.grabMode} | visible=${state.cursorVisible} | icon=${state.cursorIcon}`
    );
    pointerLine.setText(
      `Pointer: pos=(${state.pointerPos[0].toFixed(1)}, ${state.pointerPos[1].toFixed(1)}) | delta=(${state.lastDelta[0].toFixed(1)}, ${state.lastDelta[1].toFixed(1)}) | lockedAccum=(${state.lockedAccum[0].toFixed(1)}, ${state.lockedAccum[1].toFixed(1)}) | moves=${state.moveEvents}`
    );
    actionLine.setText(`Last Action: ${state.lastAction}`);
    root.flush();
  };

  const runWindowAction = (label: string, fn: () => void) => {
    if (windowId === undefined) {
      state.lastAction = `${label} (headless: no OS window)`;
      refreshHud();
      return;
    }
    try {
      fn();
      state.lastAction = label;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.lastAction = `${label} FAILED: ${message}`;
    }
    refreshHud();
  };

  const setGrabMode = (mode: CursorGrabMode) => {
    runWindowAction(`setCursorGrab('${mode}')`, () => {
      runtime.platform.window.setCursorGrab(windowId!, mode);
      state.grabMode = mode;
    });
  };

  const toggleCursorVisible = () => {
    const next = !state.cursorVisible;
    runWindowAction(`setCursorVisible(${next})`, () => {
      runtime.platform.window.setCursorVisible(windowId!, next);
      state.cursorVisible = next;
    });
  };

  const warpCursor = (x: number, y: number, label: string) => {
    runWindowAction(`${label} -> setCursorPosition(${x}, ${y})`, () => {
      runtime.platform.window.setCursorPosition(windowId!, x, y);
      state.pointerPos = [x, y];
    });
  };

  const centerCursor = () => {
    const [w, h] =
      windowId !== undefined ? runtime.platform.window.getSize(windowId) : state.windowSize;
    if (w > 0 && h > 0) state.windowSize = [w, h];
    warpCursor(Math.round(state.windowSize[0] / 2), Math.round(state.windowSize[1] / 2), 'Center');
  };

  const cycleIcon = () => {
    iconIndex = (iconIndex + 1) % CURSOR_ICONS.length;
    const icon = CURSOR_ICONS[iconIndex]!;
    runWindowAction(`setCursorIcon('${icon}')`, () => {
      runtime.platform.window.setCursorIcon(windowId!, icon);
      state.cursorIcon = icon;
    });
  };

  const cycleTitle = () => {
    titleIndex = (titleIndex + 1) % WINDOW_TITLES.length;
    const nextTitle = WINDOW_TITLES[titleIndex]!;
    runWindowAction(`setTitle('${nextTitle}')`, () => {
      runtime.platform.window.setTitle(windowId!, nextTitle);
    });
  };

  const focusWindow = () => {
    runWindowAction('requestInputFocus()', () => {
      runtime.platform.window.requestInputFocus(windowId!);
    });
  };

  const resetDelta = () => {
    state.lockedAccum = [0, 0];
    state.lastDelta = [0, 0];
    state.moveEvents = 0;
    reticleOffset = [0, 0];
    syncReticle();
    state.lastAction = 'Reset accumulated delta and reticle';
    refreshHud();
  };

  const grabGroup = new UiButtonGroup(root.root, { spacing: 8 });
  grabGroup.addButton({ label: 'Grab: None [1]', onActivate: () => setGrabMode('none') });
  grabGroup.addButton({ label: 'Grab: Confined [2]', onActivate: () => setGrabMode('confined') });
  grabGroup.addButton({
    label: 'Grab: Locked [3]',
    variant: 'accent',
    onActivate: () => setGrabMode('locked')
  });

  const cursorGroup = new UiButtonGroup(root.root, { spacing: 8 });
  cursorGroup.addButton({ label: 'Toggle Visible [V]', onActivate: toggleCursorVisible });
  cursorGroup.addButton({ label: 'Center Cursor [C]', onActivate: centerCursor });
  cursorGroup.addButton({
    label: 'Warp (160,160) [W]',
    onActivate: () => warpCursor(160, 160, 'Warp')
  });
  cursorGroup.addButton({ label: 'Cycle Icon [I]', onActivate: cycleIcon });

  const windowGroup = new UiButtonGroup(root.root, { spacing: 8 });
  windowGroup.addButton({ label: 'Cycle Title [T]', onActivate: cycleTitle });
  windowGroup.addButton({ label: 'Focus Window [F]', onActivate: focusWindow });
  windowGroup.addButton({ label: 'Reset Delta [R]', onActivate: resetDelta });

  const resize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    state.windowSize = [width, height];
    const cam = realm.world.getComponent<Camera2DComponent>(camera.entityId, 'Camera2D');
    if (cam) {
      cam.desc.orthoScale = height;
      cam.isDirty = true;
    }
    realm.world
      .getComponent<Model2DComponent>(padBg, 'Model2D')
      ?.setPosition(0, -Math.round(height * 0.25));
    root.root.setLayout({
      ...root.root.layout,
      width: { type: 'exact', value: width },
      height: { type: 'exact', value: height }
    });
    refreshHud();
  };

  runtime.platform.on('pointer', (event) => {
    if (windowId !== undefined && event.windowId !== windowId) return;
    if (event.type === 'move') {
      state.moveEvents += 1;
      state.pointerPos = [event.position[0], event.position[1]];
      state.lastDelta = [event.delta[0], event.delta[1]];
      if (state.grabMode === 'locked') {
        state.lockedAccum = [
          state.lockedAccum[0] + event.delta[0],
          state.lockedAccum[1] + event.delta[1]
        ];
        reticleOffset = [
          Math.max(-245, Math.min(245, reticleOffset[0] + event.delta[0])),
          Math.max(-75, Math.min(75, reticleOffset[1] - event.delta[1]))
        ];
      } else {
        const [w, h] = state.windowSize;
        reticleOffset = [
          Math.max(-245, Math.min(245, (event.position[0] / Math.max(1, w) - 0.5) * 490)),
          Math.max(-75, Math.min(75, (0.5 - event.position[1] / Math.max(1, h)) * 150))
        ];
      }
      syncReticle();
      refreshHud();
    }
  });

  runtime.platform.on('window', (event) => {
    if (windowId !== undefined && event.windowId !== windowId) return;
    state.windowEvents += 1;
    if (event.type === 'resized') {
      resize(event.width, event.height);
    } else if (event.type === 'focusChanged') {
      state.windowFocused = event.focused;
      state.lastAction = event.focused
        ? state.grabMode !== 'none'
          ? `Focus regained (grab '${state.grabMode}' restored)`
          : 'Focus regained'
        : 'Focus lost';
      refreshHud();
    }
  });

  runtime.platform.on('keyboard', (event) => {
    if (event.type !== 'input' || event.state !== 'pressed' || event.repeat) return;
    if (isKey(event, '1')) setGrabMode('none');
    else if (isKey(event, '2')) setGrabMode('confined');
    else if (isKey(event, '3')) setGrabMode('locked');
    else if (isKey(event, 'v')) toggleCursorVisible();
    else if (isKey(event, 'c')) centerCursor();
    else if (isKey(event, 'w')) warpCursor(160, 160, 'Warp');
    else if (isKey(event, 'i')) cycleIcon();
    else if (isKey(event, 't')) cycleTitle();
    else if (isKey(event, 'f')) focusWindow();
    else if (isKey(event, 'r')) resetDelta();
  });

  refreshHud();

  return {
    realm,
    root,
    setGrabMode,
    toggleCursorVisible,
    warpCursor,
    centerCursor,
    cycleIcon,
    cycleTitle,
    focusWindow,
    resetDelta,
    resize,
    getState: (): Win1State => ({ ...state })
  };
}

export async function runDemoWin1(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, windowId, targetId, size, maxFrames } = createDemoSession(
    options.title ?? WINDOW_TITLES[0]!,
    options,
    [1024, 680]
  );
  try {
    const scene = createWin1Scene(runtime, targetId, windowId, size);
    await runDemoLoop(runtime, {
      windowId,
      maxFrames,
      exitKeys: ['escape', 'q'],
      canExit: (event) => {
        if (
          event.type === 'input' &&
          isKey(event, 'escape') &&
          scene.getState().grabMode !== 'none'
        ) {
          scene.setGrabMode('none');
          return false;
        }
        return true;
      }
    });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) await runDemoWin1();
