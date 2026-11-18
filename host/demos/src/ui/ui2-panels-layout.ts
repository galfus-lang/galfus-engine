/**
 * Demo UI2: Reactive Panels, SplitGroup, ScrollPanel & Layout Solver
 *
 * Showcases:
 * - Native `Model2DUI` hardware-accelerated quads and text runs
 * - `SplitGroup` (horizontal + nested vertical) with draggable sash dividers
 * - `ScrollPanel` with scissor clipping, mouse wheel scrolling, and draggable scrollbars
 * - `SpritePanel` with textured quads, UV mapping, and 9-slice rendering
 * - `StackLayout` relative layering (background sprite + interactive panels/buttons)
 * - `UiText` inline and multiline layout variants
 * - Direct property setters, interaction events (`onHover`, `onClick`, `onDrag`), and smooth property animations
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
  type SpritePanel,
  type UiRoot,
  type UiSystem,
  type UiText
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
    style: {
      fill: [0.03, 0.06, 0.09, 1],
      stroke: [0.11, 0.19, 0.29, 1],
      strokeWidth: 1.5,
      radius: 12
    }
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
      style: { fill: [0.06, 0.12, 0.19, 1], stroke: [0.14, 0.26, 0.39, 1], radius: 8 }
    });

    const badge = header.addPanel({
      id: 'brand-badge',
      width: 290,
      height: 32,
      padding: { left: 8, right: 8 },
      layout: { type: 'horizontal', gap: 8, align: 'center' },
      style: { fill: [0.09, 0.18, 0.28, 1], stroke: [0.22, 0.74, 0.97, 1], radius: 6 }
    });
    badge.addSpritePanel({ width: 22, height: 22, textureId: texStar, fit: 'contain' });
    badge.addText({ text: 'UI2 — MODEL2DUI NATIVE', fontSize: 13, color: '#f0f7ff' });

    const statusText = header.addText({
      id: 'status-bar',
      text: 'Drag SplitGroup sashes, scroll lists with mouse wheel, or drag/resize the floating tool card',
      fontSize: 12,
      color: '#8babc7',
      flex: 1
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
      const row = hierarchyScroll.addPanel({
        id: `node-item-${i}`,
        height: 36,
        padding: { left: 8, right: 8 },
        layout: { type: 'horizontal', gap: 8, align: 'center' },
        style: { fill: [0.07, 0.15, 0.23, 1], stroke: [0.14, 0.26, 0.39, 1], radius: 6 }
      });
      row.addSpritePanel({
        width: 18,
        height: 18,
        textureId: isEven ? texChecker : texStar,
        fit: 'contain'
      });
      row.addText({ text: `Entity #${100 + i} — ${isEven ? 'Mesh3D' : 'Light2D'}`, fontSize: 12 });
      row.onHover(() => row.animate('backgroundColor', [0.12, 0.24, 0.37, 1], { duration: 100 }));
      row.onLeave(() => row.animate('backgroundColor', [0.07, 0.15, 0.23, 1], { duration: 100 }));
      row.onClick(() => {
        statusText.setText(`Selected Entity #${100 + i} from native ScrollPanel`);
      });
    }

    const centerWrapper = mainSplit.addPanel({
      id: 'center-wrapper',
      flex: 1.5,
      minWidth: 280,
      padding: 0,
      layout: { type: 'vertical' },
      style: { fill: [0, 0, 0, 0], radius: 0 }
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
      flex: 1.4,
      minHeight: 200,
      padding: 12,
      layout: {
        type: 'grid',
        columns: ['1fr', '1fr', '1fr'],
        rowHeight: 74,
        gapX: 10,
        gapY: 10
      }
    });
    for (let i = 1; i <= 9; i++) {
      const card = gridPanel.addPanel({
        id: `asset-card-${i}`,
        padding: { top: 8, bottom: 8, left: 6, right: 6 },
        layout: { type: 'vertical', gap: 6, align: 'center' },
        style: { fill: [0.08, 0.15, 0.24, 1], stroke: [0.16, 0.3, 0.44, 1], radius: 8 }
      });
      card.addSpritePanel({
        width: 26,
        height: 26,
        textureId: i % 2 === 0 ? texStar : texChecker,
        fit: 'contain'
      });
      card.addText({ text: `Asset 0${i}`, fontSize: 11 });
      card.onHover(() => card.animate('backgroundColor', [0.13, 0.26, 0.4, 1], { duration: 100 }));
      card.onLeave(() => card.animate('backgroundColor', [0.08, 0.15, 0.24, 1], { duration: 100 }));
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
      const logRow = logScroll.addPanel({
        id: `log-row-${i}`,
        height: 28,
        padding: { left: 8, right: 8 },
        layout: { type: 'horizontal', gap: 6, align: 'center' },
        style: { fill: [0.05, 0.09, 0.15, 1], stroke: [0.1, 0.19, 0.29, 1], radius: 4 }
      });
      logRow.addText({
        text: `[00:0${i < 10 ? '0' + i : i}] Native Model2DUI quads & texts compiled to GPU`,
        fontSize: 11,
        color: '#9ec5e6'
      });
    }

    const workspaceFree = mainSplit.addPanel({
      id: 'free-dock',
      title: 'Inspector Sandbox (Drag / Resize)',
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
      width: 250,
      height: 230,
      minWidth: 180,
      minHeight: 140,
      draggable: true,
      resizable: true,
      padding: 10,
      layout: { type: 'vertical', gap: 8 },
      style: {
        fill: [0.07, 0.15, 0.23, 1],
        stroke: [0.22, 0.74, 0.97, 1],
        strokeWidth: 1.5,
        headerFill: [0.11, 0.23, 0.36, 1],
        radius: 8
      }
    });

    const sizeReadout = floating.addText({
      id: 'floating-size',
      text: 'Size: 250 x 230',
      fontSize: 12,
      color: '#f0f7ff'
    });

    // Demonstrate Stack Layout (Relative Layering: Background SpritePanel + overlay Panel with Text)
    const stackCard = floating.addPanel({
      id: 'stack-preview',
      flex: 1,
      layout: { type: 'stack' },
      style: { radius: 6 }
    });
    stackCard.addSpritePanel({
      id: 'stack-bg',
      textureId: texChecker,
      fit: 'nineSlice',
      slice: [4, 4, 4, 4],
      tintColor: [0.15, 0.35, 0.55, 0.8]
    });
    const overlay = stackCard.addPanel({
      id: 'stack-overlay',
      padding: 10,
      layout: { type: 'vertical', gap: 6, align: 'center' },
      style: { fill: [0, 0, 0, 0] }
    });
    overlay.addText({ text: 'StackLayout: Sprite BG', fontSize: 12, color: '#f0f7ff' });
    const btn = overlay.addPanel({
      id: 'stack-btn',
      width: 130,
      height: 28,
      padding: { left: 8, right: 8 },
      layout: { type: 'horizontal', justify: 'center', align: 'center' },
      style: { fill: [0.14, 0.3, 0.46, 1], stroke: [0.22, 0.74, 0.97, 1], radius: 4 }
    });
    btn.addText({ text: 'Interactive Btn', fontSize: 11, align: 'center', color: '#ffffff' });
    btn.onHover(() => btn.animate('backgroundColor', [0.2, 0.45, 0.7, 1], { duration: 100 }));
    btn.onLeave(() => btn.animate('backgroundColor', [0.14, 0.3, 0.46, 1], { duration: 100 }));
    btn.onClick(() => statusText.setText('Stack overlay button clicked!'));

    floating.onResize((r) => {
      sizeReadout.setText(`Size: ${Math.round(r.width)} x ${Math.round(r.height)}`);
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
