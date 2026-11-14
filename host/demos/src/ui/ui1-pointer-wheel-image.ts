/**
 * Demo UI1: Native SpritePanel & Texture Lab
 *
 * Showcases:
 * - Native Model2DUI SpritePanel with hardware texture sampling ('linear' vs 'nearest')
 * - UV coordinate mapping and 9-slice capabilities
 * - Interactive pointer drag pan and wheel zoom directly on native UI panels
 * - UiText labels and dynamic real-time property mutations
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
import { Panel, SpritePanel, UiRoot, UiText } from '@galfus/ui';
import { runDemoLoop } from '../common/loop';
import { type HostDemoOptions, resolveDemoOptions } from '../common/options';
import { createCheckerTexture, createStarFlareTexture } from '../common/textures';

function createRadarTexture(size = 128): { pixels: Uint8Array; width: number; height: number } {
  const pixels = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - half) / half;
      const ny = (y - half) / half;
      const r = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);
      const rings = Math.exp(-((r * 4 - Math.round(r * 4)) ** 2) * 45) * (r <= 0.95 ? 1 : 0);
      const cross = Math.max(Math.exp(-(nx ** 2) * 350), Math.exp(-(ny ** 2) * 350)) * 0.65;
      const sweep = (((angle + Math.PI) / (2 * Math.PI) + 0.15) % 1) * (r <= 0.95 ? 1 : 0);
      const glow = Math.max(0, 1 - r) * 0.35 + rings * 0.8 + cross + sweep * 0.45;
      const idx = (y * size + x) * 4;
      pixels[idx] = Math.min(255, Math.round(20 + glow * 45));
      pixels[idx + 1] = Math.min(255, Math.round(45 + glow * 195));
      pixels[idx + 2] = Math.min(255, Math.round(80 + glow * 235));
      pixels[idx + 3] = 255;
    }
  }
  return { pixels, width: size, height: size };
}

export function createUi1Scene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  _windowId?: WindowId,
  size: readonly [number, number] = [1024, 680]
) {
  const radar = createRadarTexture(128);
  const pixel = createCheckerTexture(64);
  const star = createStarFlareTexture(128);

  const texRadar = runtime.resources.createTexture(radar.pixels, {
    width: radar.width,
    height: radar.height,
    format: 'rgba8Unorm'
  });
  const texPixel = runtime.resources.createTexture(pixel.pixels, {
    width: pixel.width,
    height: pixel.height,
    format: 'rgba8Unorm'
  });
  const texStar = runtime.resources.createTexture(star.pixels, {
    width: star.width,
    height: star.height,
    format: 'rgba8Unorm'
  });

  const realm2d = runtime.createRealm2D(1);
  realm2d.setShadowConfig({ ambient: 1 });
  const { entityId: camEntity } = realm2d.createCamera(
    { orthoScale: size[1], near: -100, far: 100 },
    { position: [0, 0] }
  );
  runtime.multiverse.createInvocation({
    realmId: realm2d.realmId,
    targetId,
    zIndex: 10,
    clearColor: [0.04, 0.07, 0.12, 1]
  });

  const uiRoot = new UiRoot(runtime, realm2d, {
    width: size[0],
    height: size[1],
    zLayer: 1,
    padding: 0,
    layout: { type: 'free' }
  });

  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  let activeTex = texRadar;
  let activePixelated = false;
  let interactions = 0;
  let lastEventName = 'ready';

  const rootPanel = uiRoot.rootPanel;
  rootPanel.setBackgroundColor([0.04, 0.07, 0.12, 1]);

  // Header Title
  const titleText = new UiText({
    text: 'UI 1 — NATIVE SPRITE & TEXTURE LAB',
    fontSize: 20,
    color: [0.94, 0.97, 1.0, 1],
    x: 24,
    y: 20
  });
  rootPanel.addText(titleText);

  const subtitleText = new UiText({
    text: 'Hardware-accelerated SpritePanel with nearest/linear sampling, 9-slice, pan & zoom',
    fontSize: 12,
    color: [0.55, 0.67, 0.78, 1],
    x: 24,
    y: 46
  });
  rootPanel.addText(subtitleText);

  // A core-owned RichText node; the surrounding ModelUI remains non-interactive.
  const richUi = realm2d.createUi({}, { zLayer: 2 });
  realm2d.applyUiCommands(richUi, [
    {
      type: 'create',
      id: 1,
      kind: { type: 'panel', backgroundColor: [0, 0, 0, 0] },
      layout: {
        width: { type: 'exact', value: size[0] },
        height: { type: 'exact', value: size[1] },
        isStack: true
      }
    },
    {
      type: 'create',
      id: 2,
      kind: {
        type: 'richText',
        multiline: false,
        spans: [
          { text: 'RichText: ', style: { fontSize: 18, color: [0.8, 0.9, 1, 1] } },
          { text: 'bold ', style: { fontSize: 18, fontWeight: 700, color: [0.3, 0.9, 1, 1] } },
          { text: 'italic ', style: { fontSize: 18, italic: true, color: [1, 0.8, 0.4, 1] } },
          { text: 'underline ', style: { fontSize: 18, underline: true, color: [0.5, 1, 0.6, 1] } },
          { text: 'strike', style: { fontSize: 18, strikethrough: true, color: [1, 0.5, 0.5, 1] } }
        ]
      },
      layout: { positionOffset: [24, 530] }
    },
    { type: 'insert', parentId: 1, childId: 2 },
    {
      type: 'create',
      id: 3,
      kind: {
        type: 'richText',
        multiline: true,
        wrap: 'wordWrap',
        spans: [
          {
            text: 'Multiline text wraps across ',
            style: { fontSize: 15, color: [0.8, 0.9, 1, 1] }
          },
          {
            text: 'formatted spans while retaining their styles.',
            style: { fontSize: 15, underline: true, color: [0.4, 0.9, 0.8, 1] }
          }
        ]
      },
      layout: { positionOffset: [24, 570], width: { type: 'exact', value: 330 } }
    },
    { type: 'insert', parentId: 1, childId: 3 }
  ]);

  // Main Viewport Container Frame
  const viewportContainer = new Panel({
    x: 24,
    y: 80,
    width: 560,
    height: 420,
    padding: 0,
    layout: { type: 'free' }
  })
    .setBackgroundColor([0.02, 0.04, 0.07, 1])
    .setBorderColor([0.17, 0.32, 0.47, 1])
    .setBorderWidth(2)
    .setBorderRadius(12);
  rootPanel.addChild(viewportContainer);

  // Inside Viewport: SpritePanel
  const spriteViewport = new SpritePanel({
    x: 20,
    y: 20,
    width: 520,
    height: 380,
    textureId: activeTex,
    sampler: activePixelated ? 'nearest' : 'linear'
  })
    .setBackgroundColor([0.03, 0.06, 0.11, 1])
    .setBorderRadius(8);
  viewportContainer.addChild(spriteViewport);

  // Status & Control Side Panel
  const controlPanel = new Panel({
    x: 608,
    y: 80,
    width: 392,
    height: 420,
    padding: 0,
    layout: { type: 'free' }
  })
    .setBackgroundColor([0.06, 0.1, 0.16, 1])
    .setBorderColor([0.15, 0.25, 0.38, 1])
    .setBorderWidth(1.5)
    .setBorderRadius(12);
  rootPanel.addChild(controlPanel);

  const statusLabel = new UiText({
    text: 'INTERACTIVE STATUS',
    fontSize: 14,
    color: [0.45, 0.85, 0.95, 1],
    x: 20,
    y: 20
  });
  controlPanel.addText(statusLabel);

  const statDetails = new UiText({
    text: 'Zoom: 1.0x | Pan: [0, 0]\nTexture: #Radar | Sampler: linear\nLast Event: ready',
    fontSize: 12,
    color: [0.8, 0.88, 0.95, 1],
    x: 20,
    y: 48,
    multiline: true
  });
  controlPanel.addText(statDetails);

  function updateStatus(event: string) {
    lastEventName = event;
    statDetails.setText(
      `Zoom: ${zoom.toFixed(2)}x | Pan: [${Math.round(panX)}, ${Math.round(panY)}]\n` +
        `Texture: #${activeTex} | Sampler: ${activePixelated ? 'nearest' : 'linear'}\n` +
        `Last Event: ${event} (${++interactions})`
    );
  }

  function updateSpriteViewport() {
    spriteViewport.setTextureId(activeTex);
    spriteViewport.setSampler(activePixelated ? 'nearest' : 'linear');
    // Calculate UV based on pan and zoom
    const uSpan = 1.0 / zoom;
    const vSpan = 1.0 / zoom;
    const uOffset = 0.5 - uSpan * 0.5 - (panX / 520) * uSpan;
    const vOffset = 0.5 - vSpan * 0.5 - (panY / 380) * vSpan;
    spriteViewport.setUv([uOffset, vOffset, uOffset + uSpan, vOffset + vSpan]);
  }

  viewportContainer.on('press', () => {
    updateStatus('press (viewport)');
  });

  viewportContainer.on('drag', (dx, dy) => {
    panX = Math.max(-250, Math.min(250, panX + dx));
    panY = Math.max(-200, Math.min(200, panY + dy));
    updateSpriteViewport();
    updateStatus('drag (pan)');
  });

  viewportContainer.on('release', () => {
    updateStatus('release (viewport)');
  });

  viewportContainer.on('scroll', (_dx, dy) => {
    const step = dy * 0.003;
    zoom = Math.max(0.4, Math.min(4.0, zoom + step));
    updateSpriteViewport();
    updateStatus('scroll (wheel)');
  });

  // Buttons on Control Panel
  const btnSampler = new Panel({
    x: 20,
    y: 130,
    width: 170,
    height: 36,
    padding: 0,
    layout: { type: 'free' }
  })
    .setBackgroundColor([0.12, 0.22, 0.35, 1])
    .setBorderColor([0.25, 0.45, 0.7, 1])
    .setBorderWidth(1)
    .setBorderRadius(6);
  const btnSamplerText = new UiText({
    text: 'Toggle Sampler',
    fontSize: 12,
    color: [0.9, 0.95, 1, 1],
    x: 32,
    y: 10
  });
  btnSampler.addText(btnSamplerText);
  btnSampler.on('click', () => {
    activePixelated = !activePixelated;
    updateSpriteViewport();
    updateStatus('click (sampler)');
  });
  controlPanel.addChild(btnSampler);

  const btnReset = new Panel({
    x: 200,
    y: 130,
    width: 170,
    height: 36,
    padding: 0,
    layout: { type: 'free' }
  })
    .setBackgroundColor([0.12, 0.22, 0.35, 1])
    .setBorderColor([0.25, 0.45, 0.7, 1])
    .setBorderWidth(1)
    .setBorderRadius(6);
  const btnResetText = new UiText({
    text: 'Reset Pan/Zoom',
    fontSize: 12,
    color: [0.9, 0.95, 1, 1],
    x: 32,
    y: 10
  });
  btnReset.addText(btnResetText);
  btnReset.on('click', () => {
    zoom = 1.0;
    panX = 0;
    panY = 0;
    updateSpriteViewport();
    updateStatus('click (reset)');
  });
  controlPanel.addChild(btnReset);

  // Thumbnails Section
  const thumbsLabel = new UiText({
    text: 'SELECT TEXTURE',
    fontSize: 12,
    color: [0.45, 0.85, 0.95, 1],
    x: 20,
    y: 190
  });
  controlPanel.addText(thumbsLabel);

  const thumbs: SpritePanel[] = [];
  const texList = [
    { name: 'Radar', id: texRadar, pixelated: false },
    { name: 'Checker', id: texPixel, pixelated: true },
    { name: 'Star', id: texStar, pixelated: false }
  ];

  texList.forEach((t, i) => {
    const thumb = new SpritePanel({
      x: 20 + i * 120,
      y: 215,
      width: 105,
      height: 75,
      textureId: t.id,
      sampler: t.pixelated ? 'nearest' : 'linear'
    })
      .setBorderColor(t.id === activeTex ? [0.22, 0.74, 0.97, 1] : [0.16, 0.27, 0.39, 1])
      .setBorderWidth(t.id === activeTex ? 2 : 1)
      .setBorderRadius(6);
    thumb.on('click', () => {
      activeTex = t.id;
      activePixelated = t.pixelated;
      thumbs.forEach((th, idx) => {
        const isSelected = texList[idx]!.id === activeTex;
        th.setBorderColor(isSelected ? [0.22, 0.74, 0.97, 1] : [0.16, 0.27, 0.39, 1]);
        th.setBorderWidth(isSelected ? 2 : 1);
      });
      updateSpriteViewport();
      updateStatus(`click (${t.name})`);
    });
    thumbs.push(thumb);
    controlPanel.addChild(thumb);
  });

  if (_windowId !== undefined) {
    runtime.on('window', (event) => {
      if (event.type === 'resized' && event.windowId === _windowId) {
        const camComp = realm2d.world.getComponent<Camera2DComponent>(camEntity, 'Camera2D');
        if (camComp) {
          camComp.desc.orthoScale = event.height;
          camComp.isDirty = true;
        }
        uiRoot.resizeViewport(event.width, event.height);
        realm2d.applyUiCommands(richUi, [
          {
            type: 'setLayout',
            id: 1,
            layout: {
              width: { type: 'exact', value: Math.max(1, event.width) },
              height: { type: 'exact', value: Math.max(1, event.height) },
              isStack: true
            }
          }
        ]);
      }
    });
  }

  return {
    realm2d,
    uiRoot,
    richUi,
    viewportContainer,
    controlPanel,
    spriteViewport,
    btnSampler,
    btnReset,
    textures: { texRadar, texPixel, texStar },
    selectTexture: (texId: TextureId, pixelated = false) => {
      activeTex = texId;
      activePixelated = pixelated;
      updateSpriteViewport();
      updateStatus(`select (${texId})`);
    },
    getState: () => ({
      zoom,
      panX,
      panY,
      activeTex,
      activePixelated,
      interactions,
      lastEventName
    })
  };
}

export async function runDemoUi1(options: HostDemoOptions = {}): Promise<void> {
  const { headless, maxFrames } = resolveDemoOptions(options);
  const runtime = createRuntime(createBunTransport({ headless }));
  let windowId: WindowId | undefined;
  try {
    windowId = headless
      ? undefined
      : runtime.platform.window.create({
          title: options.title ?? 'Galfus Demo [ui1]: Native SpritePanel & Texture Lab',
          size: [1024, 680]
        });
    const targetId = runtime.multiverse.createTarget(
      windowId === undefined
        ? { kind: { type: 'texture', width: 1024, height: 680 } }
        : { kind: { type: 'window', windowId } }
    );
    const size =
      windowId === undefined ? ([1024, 680] as const) : runtime.platform.window.getSize(windowId);
    createUi1Scene(runtime, targetId, windowId, size);
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
