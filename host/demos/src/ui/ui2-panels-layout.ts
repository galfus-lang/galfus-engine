/**
 * Demo UI2: Reactive Panels, SplitGroup, ScrollPanel & Layout Solver
 *
 * Showcases:
 * - `UiRoot` auto-generating `<svg width height viewBox>` and syncing surgical attribute updates
 * - `SplitGroup` (horizontal + nested vertical) with draggable sash dividers
 * - `ScrollPanel` with `<clipPath>` viewport, wheel scrolling, and draggable scrollbar thumbs
 * - `Panel` with `horizontal`, `vertical`, `grid`, `flex`, and `free` (draggable + resizable) layouts
 */
import {
  type Camera2DComponent,
  createRuntime,
  type MultiverseRuntime,
  type TargetId,
  type TextureId,
  type WindowId
} from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import {
  createUi,
  type Panel,
  type ScrollPanel,
  type SplitGroup,
  type UiRoot,
  type UiSystem
} from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { type HostDemoOptions, resolveDemoOptions } from '../common/options';
import { createCheckerTexture, createStarFlareTexture } from '../common/textures';

export interface Ui2SceneHandle {
  readonly ui: UiSystem;
  readonly root: UiRoot;
  readonly mainSplit: SplitGroup;
  readonly centerSplit: SplitGroup;
  readonly hierarchyScroll: ScrollPanel;
  readonly logScroll: ScrollPanel;
  readonly floating: Panel;
  readonly resize: (width: number, height: number) => void;
  readonly dispose: () => void;
}

export function createUi2Scene(
  runtime: MultiverseRuntime,
  windowTargetId: TargetId,
  windowId?: WindowId,
  viewport: readonly [number, number] = [1120, 700]
): Ui2SceneHandle {
  const ui = createUi(runtime);
  let [winW, winH] = viewport;

  const checkerImg = createCheckerTexture(16, [56, 189, 248, 255], [15, 23, 42, 255], 2);
  const starImg = createStarFlareTexture(64);
  const texChecker = runtime.resources.createTexture(checkerImg.pixels, {
    label: 'ui2-checker',
    width: checkerImg.width,
    height: checkerImg.height,
    format: 'rgba8UnormSrgb'
  }) as TextureId;
  const texStar = runtime.resources.createTexture(starImg.pixels, {
    label: 'ui2-star',
    width: starImg.width,
    height: starImg.height,
    format: 'rgba8UnormSrgb'
  }) as TextureId;

  const realm = runtime.createRealm2D();
  realm.setShadowConfig({ ambient: 1 });
  const { entityId: camEntity } = realm.createCamera(
    { orthoScale: winH, near: -100, far: 100 },
    { position: [0, 0] }
  );

  const root = ui.createRoot(realm, {
    id: 'ui2-root',
    width: winW,
    height: winH,
    padding: 12,
    layout: { type: 'vertical', gap: 10 },
    style: { fill: '#070e17', stroke: '#1b314b', strokeWidth: 1.5, radius: 12 }
  });

  let mainSplit!: SplitGroup;
  let centerSplit!: SplitGroup;
  let hierarchyScroll!: ScrollPanel;
  let logScroll!: ScrollPanel;
  let floating!: Panel;

  root.batch(() => {
    const header = root.addPanel({
      id: 'top-bar',
      height: 46,
      padding: { top: 6, right: 12, bottom: 6, left: 12 },
      layout: { type: 'horizontal', gap: 12, align: 'center' },
      style: { fill: '#0f1e30', stroke: '#244263', radius: 8 }
    });
    header.addContent({
      id: 'brand-badge',
      width: 290,
      height: 32,
      label: 'UI2 — PANELS, SPLITTERS & SCROLL',
      textureId: texStar,
      fill: '#162d47',
      stroke: '#38bdf8',
      textColor: '#f0f7ff',
      fontSize: 13
    });
    const statusItem = header.addContent({
      id: 'status-bar',
      flex: 1,
      height: 32,
      label:
        'Drag SplitGroup sashes, scroll lists with mouse wheel, or drag/resize the floating tool card',
      fill: '#0b1624',
      stroke: '#1e3854',
      textColor: '#8babc7',
      fontSize: 12
    });

    mainSplit = root.addSplitGroup({
      id: 'main-split',
      orientation: 'horizontal',
      flex: 1,
      handleSize: 6
    });

    hierarchyScroll = mainSplit.addScrollPanel({
      id: 'hierarchy-scroll',
      title: 'Scene Hierarchy (ScrollPanel)',
      flex: 0.9,
      minWidth: 190,
      padding: 10,
      layout: { type: 'vertical', gap: 8 }
    });
    for (let i = 1; i <= 16; i++) {
      const isEven = i % 2 === 0;
      const item = hierarchyScroll.addContent({
        id: `node-item-${i}`,
        height: 38,
        label: `Entity #${100 + i} — ${isEven ? 'Mesh3D' : 'Light2D'}`,
        textureId: isEven ? texChecker : texStar,
        fill: '#13263b',
        stroke: '#234264',
        radius: 6
      });
      const listener = root.listen(item.id);
      listener.on('hover', () => item.setFill('#1c3a59'));
      listener.on('leave', () => item.setFill('#13263b'));
      listener.on('click', () => {
        statusItem.setLabel(`Selected Entity #${100 + i} from ScrollPanel`);
      });
    }

    const centerWrapper = mainSplit.addPanel({
      id: 'center-wrapper',
      flex: 1.5,
      minWidth: 280,
      padding: 0,
      layout: { type: 'vertical' },
      style: { fill: 'none', stroke: undefined, radius: 0 }
    });
    centerSplit = centerWrapper.addSplitGroup({
      id: 'center-split',
      orientation: 'vertical',
      flex: 1,
      handleSize: 6
    });

    const gridPanel = centerSplit.addPanel({
      id: 'asset-grid',
      title: 'Asset Browser (Grid Layout — 3fr Columns)',
      flex: 1.3,
      minHeight: 160,
      padding: 10,
      layout: {
        type: 'grid',
        columns: ['1fr', '1fr', '1fr'],
        rowHeight: 58,
        gapX: 10,
        gapY: 10
      }
    });
    for (let i = 1; i <= 9; i++) {
      const card = gridPanel.addContent({
        id: `asset-card-${i}`,
        label: `Asset 0${i}`,
        textureId: i % 2 === 0 ? texStar : texChecker,
        fill: '#14273d',
        stroke: '#294c70',
        radius: 8
      });
      const listener = root.listen(card.id);
      listener.on('hover', () => card.setFill('#1e3d5e'));
      listener.on('leave', () => card.setFill('#14273d'));
    }

    logScroll = centerSplit.addScrollPanel({
      id: 'console-scroll',
      title: 'Event Log (ScrollPanel)',
      flex: 0.9,
      minHeight: 120,
      padding: 8,
      layout: { type: 'vertical', gap: 6 }
    });
    for (let i = 1; i <= 12; i++) {
      logScroll.addContent({
        id: `log-row-${i}`,
        height: 28,
        label: `[00:0${i < 10 ? '0' + i : i}] Layout pass & SVG clipPath synced cleanly`,
        fill: '#0c1826',
        stroke: '#19304a',
        textColor: '#9ec5e6',
        fontSize: 11
      });
    }

    const workspaceFree = mainSplit.addPanel({
      id: 'free-dock',
      title: 'Floating Inspector Sandbox (Drag Header / Resize Corner)',
      flex: 1.1,
      minWidth: 240,
      padding: 12,
      layout: { type: 'free' }
    });

    floating = workspaceFree.addPanel({
      id: 'floating-tool',
      title: 'Floating Tool (Drag / Resize)',
      x: 16,
      y: 16,
      width: 240,
      height: 220,
      minWidth: 160,
      minHeight: 130,
      draggable: true,
      resizable: true,
      padding: 10,
      layout: { type: 'vertical', gap: 8 },
      style: {
        fill: '#13263b',
        stroke: '#38bdf8',
        strokeWidth: 1.5,
        headerFill: '#1d3b5c',
        radius: 8
      }
    });
    const sizeReadout = floating.addContent({
      id: 'floating-size',
      height: 36,
      label: 'Size: 240 x 220',
      fill: '#0c1826',
      stroke: '#244263'
    });
    floating.addContent({
      id: 'floating-preview',
      flex: 1,
      label: 'Live Flex Child',
      textureId: texStar,
      fill: '#0e1d2f',
      stroke: '#244263'
    });
    floating.onResize((r) => {
      sizeReadout.setLabel(`Size: ${Math.round(r.width)} x ${Math.round(r.height)}`);
    });
  });

  runtime.multiverse.createInvocation({
    realmId: realm.realmId,
    targetId: windowTargetId,
    clearColor: [0.02, 0.04, 0.07, 1]
  });

  const resize = (w: number, h: number) => {
    if (w <= 0 || h <= 0 || (w === winW && h === winH)) return;
    winW = w;
    winH = h;
    const camComp = realm.world.getComponent<Camera2DComponent>(camEntity, 'Camera2D');
    if (camComp) {
      camComp.desc.orthoScale = winH;
      camComp.isDirty = true;
    }
    root.resizeViewport(winW, winH);
  };

  if (windowId !== undefined) {
    runtime.on('window', (ev) => {
      if (ev.windowId === windowId && ev.type === 'resized') resize(ev.width, ev.height);
    });
  }

  return {
    ui,
    root,
    mainSplit,
    centerSplit,
    hierarchyScroll,
    logScroll,
    floating,
    resize,
    dispose: () => {
      ui.dispose();
    }
  };
}

export async function runDemoUi2(options: HostDemoOptions = {}): Promise<void> {
  const { headless, maxFrames } = resolveDemoOptions(options);
  const runtime = createRuntime(createBunTransport({ headless }));
  let windowId: WindowId | undefined;

  try {
    windowId = headless
      ? undefined
      : runtime.platform.window.create({
          title:
            options.title ?? 'Galfus Demo [ui2]: Panels, SplitGroup, ScrollPanel & Layout Solver',
          size: [1120, 700]
        });

    const targetId = runtime.multiverse.createTarget(
      windowId === undefined
        ? { kind: { type: 'texture', width: 1120, height: 700 } }
        : { kind: { type: 'window', windowId } }
    );

    const size =
      windowId === undefined ? ([1120, 700] as const) : runtime.platform.window.getSize(windowId);
    const scene = createUi2Scene(runtime, targetId, windowId, size);
    try {
      await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
    } finally {
      scene.dispose();
    }
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemoUi2();
}
