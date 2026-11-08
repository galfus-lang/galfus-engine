/**
 * Demo UI1: SVG Pointer & Wheel Events + Engine Texture `<image textureId="...">`
 *
 * Showcases:
 * - Engine logical textures bound directly to SVG `<image textureId="...">` elements
 * - `image-rendering="pixelated"` vs smooth linear sampling and `preserveAspectRatio` modes
 * - SVG `<clipPath>` clipping an interactive zoomed/panned `<image>` viewport
 * - `InteractiveSystem` pointer (`hover`, `leave`, `move`, `down`, `up`, `click`, `pressmove`)
 *   and wheel (`scroll`) events with normalized local `uv` coordinates
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

function buildUi1Svg(texRadar: number, texPixel: number, texStar: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="580" viewBox="0 0 920 580">
  <defs>
    <clipPath id="viewport-clip">
      <rect x="36" y="96" width="460" height="340" rx="12"/>
    </clipPath>
  </defs>

  <!-- Main Card Frame -->
  <rect x="12" y="12" width="896" height="556" rx="18" fill="#0b1320" stroke="#1e3a5f" stroke-width="2"/>
  <text x="36" y="52" fill="#f0f7ff" font-family="sans-serif" font-size="22" font-weight="bold">UI 1 — SVG POINTER, WHEEL &amp; TEXTURE IMAGE LAB</text>
  <text x="36" y="74" fill="#8babc7" font-family="sans-serif" font-size="13">Scroll wheel on the viewport to zoom, drag to pan inside &lt;clipPath&gt;, or click thumbnails to swap textureId</text>

  <!-- Left: Clipped <image textureId="..."> Viewport -->
  <rect x="34" y="94" width="464" height="344" rx="14" fill="#060b13" stroke="#2b5278" stroke-width="2"/>
  <g clip-path="url(#viewport-clip)">
    <rect x="36" y="96" width="460" height="340" fill="#08101c"/>
    <image id="viewport-image" textureId="${texRadar}" x="86" y="116" width="360" height="300" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <!-- Interactive Hit Overlay for Viewport -->
  <rect id="viewport-hit" x="36" y="96" width="460" height="340" fill="#ffffff" fill-opacity="0.01"/>

  <!-- Thumbnails Row (<image textureId="...">) -->
  <text x="36" y="466" fill="#72d9e9" font-family="sans-serif" font-size="12" font-weight="bold">ENGINE TEXTURES IN SVG (&lt;image textureId="..."&gt;)</text>

  <rect id="thumb-radar" x="36" y="478" width="136" height="68" rx="8" fill="#13263b" stroke="#38bdf8" stroke-width="2"/>
  <image textureId="${texRadar}" x="44" y="484" width="56" height="56"/>
  <text x="108" y="508" fill="#f0f7ff" font-family="sans-serif" font-size="12" font-weight="bold">Radar</text>
  <text x="108" y="526" fill="#8babc7" font-family="sans-serif" font-size="10">ID #${texRadar}</text>

  <rect id="thumb-pixel" x="184" y="478" width="146" height="68" rx="8" fill="#13263b" stroke="#284664" stroke-width="1.5"/>
  <image textureId="${texPixel}" x="192" y="484" width="56" height="56" image-rendering="pixelated"/>
  <text x="256" y="508" fill="#f0f7ff" font-family="sans-serif" font-size="12" font-weight="bold">Pixelated</text>
  <text x="256" y="526" fill="#8babc7" font-family="sans-serif" font-size="10">ID #${texPixel}</text>

  <rect id="thumb-star" x="342" y="478" width="154" height="68" rx="8" fill="#13263b" stroke="#284664" stroke-width="1.5"/>
  <image textureId="${texStar}" x="350" y="484" width="56" height="56"/>
  <text x="414" y="508" fill="#f0f7ff" font-family="sans-serif" font-size="12" font-weight="bold">Star Flare</text>
  <text x="414" y="526" fill="#8babc7" font-family="sans-serif" font-size="10">ID #${texStar}</text>

  <!-- Right: Telemetry & Controls Panel -->
  <rect x="524" y="94" width="360" height="452" rx="14" fill="#101e30" stroke="#244263" stroke-width="1.5"/>
  <text x="548" y="128" fill="#72d9e9" font-family="sans-serif" font-size="14" font-weight="bold">POINTER &amp; WHEEL TELEMETRY</text>

  <text x="548" y="160" fill="#8babc7" font-family="sans-serif" font-size="12">Last Event:</text>
  <text id="stat-event" x="670" y="160" fill="#ffffff" font-family="monospace" font-size="13" font-weight="bold">idle</text>

  <text x="548" y="190" fill="#8babc7" font-family="sans-serif" font-size="12">Pointer Pos:</text>
  <text id="stat-pos" x="670" y="190" fill="#dceafa" font-family="monospace" font-size="13">0, 0</text>

  <text x="548" y="220" fill="#8babc7" font-family="sans-serif" font-size="12">Local UV:</text>
  <text id="stat-uv" x="670" y="220" fill="#38bdf8" font-family="monospace" font-size="13">0.50, 0.50</text>

  <text x="548" y="250" fill="#8babc7" font-family="sans-serif" font-size="12">Wheel Delta:</text>
  <text id="stat-wheel" x="670" y="250" fill="#4ade80" font-family="monospace" font-size="13">0.0, 0.0 (none)</text>

  <text x="548" y="280" fill="#8babc7" font-family="sans-serif" font-size="12">Viewport Zoom:</text>
  <text id="stat-zoom" x="670" y="280" fill="#facc15" font-family="monospace" font-size="13">1.00x (pan: 0, 0)</text>

  <!-- Zoom Bar -->
  <rect x="548" y="296" width="312" height="12" rx="6" fill="#08111d"/>
  <rect id="zoom-bar" x="548" y="296" width="78" height="12" rx="6" fill="#38bdf8"/>

  <text x="548" y="340" fill="#8babc7" font-family="sans-serif" font-size="12">Active Texture:</text>
  <text id="stat-tex" x="670" y="340" fill="#ffffff" font-family="monospace" font-size="13">#${texRadar} (smooth)</text>

  <text x="548" y="370" fill="#8babc7" font-family="sans-serif" font-size="12">Aspect Ratio:</text>
  <text id="stat-aspect" x="670" y="370" fill="#ffffff" font-family="monospace" font-size="13">xMidYMid meet</text>

  <!-- Action Buttons -->
  <rect id="btn-aspect" x="548" y="400" width="312" height="42" rx="8" fill="#1e496d"/>
  <text x="612" y="426" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="bold">Cycle preserveAspectRatio</text>

  <rect id="btn-reset" x="548" y="454" width="312" height="42" rx="8" fill="#1a3550"/>
  <text x="628" y="480" fill="#dceafa" font-family="sans-serif" font-size="14">Reset Zoom &amp; Pan</text>

  <text id="stat-clicks" x="548" y="526" fill="#64829e" font-family="sans-serif" font-size="12">Interactions: 0 | ESC / Q to exit</text>
</svg>`;
}

const ASPECT_MODES = ['xMidYMid meet', 'xMidYMid slice', 'none'] as const;

export function createUi1Scene(
  runtime: MultiverseRuntime,
  targetId: TargetId,
  windowId?: WindowId,
  initialSize: readonly [number, number] = [1024, 680]
) {
  const realm2d = runtime.createRealm2D();
  runtime.multiverse.createInvocation({
    realmId: realm2d.realmId,
    targetId,
    clearColor: [0.02, 0.04, 0.07, 1]
  });

  const camera = realm2d.createCamera({ orthoScale: 620 });
  const cameraComp = realm2d.world.getComponent<Camera2DComponent>(camera.entityId, 'Camera2D')!;
  const resize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    const targetScale = aspect < 920 / 580 ? (950 * height) / width : 610;
    if (cameraComp.desc.orthoScale !== targetScale) {
      cameraComp.desc.orthoScale = targetScale;
      cameraComp.isDirty = true;
    }
  };
  resize(initialSize[0], initialSize[1]);
  if (windowId !== undefined) {
    runtime.on('window', (ev) => {
      if (ev.windowId === windowId && ev.type === 'resized') resize(ev.width, ev.height);
    });
  }

  realm2d.setShadowConfig({ ambient: 1 });

  const radarData = createRadarTexture(128);
  const pixelData = createCheckerTexture(16, [56, 189, 248, 255], [15, 23, 42, 255], 2);
  const starData = createStarFlareTexture(128);

  const texRadar = runtime.resources.createTexture(radarData.pixels, {
    label: 'ui1-radar',
    width: radarData.width,
    height: radarData.height,
    format: 'rgba8UnormSrgb'
  });
  const texPixel = runtime.resources.createTexture(pixelData.pixels, {
    label: 'ui1-pixel',
    width: pixelData.width,
    height: pixelData.height,
    format: 'rgba8UnormSrgb'
  });
  const texStar = runtime.resources.createTexture(starData.pixels, {
    label: 'ui1-star',
    width: starData.width,
    height: starData.height,
    format: 'rgba8UnormSrgb'
  });

  const svg = realm2d.createSvg({
    source: buildUi1Svg(texRadar, texPixel, texStar),
    castShadow: false,
    receiveShadow: false
  });

  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let lastPointerPos: [number, number] = [0, 0];
  let aspectIndex = 0;
  let interactions = 0;
  let activeTex = texRadar;
  let activePixelated = false;

  const updateViewportTransform = () => {
    const baseW = 360 * zoom;
    const baseH = 300 * zoom;
    const cx = 36 + 230 + panX;
    const cy = 96 + 170 + panY;
    realm2d.setSvgAttribute(svg, 'viewport-image', 'x', (cx - baseW * 0.5).toFixed(1));
    realm2d.setSvgAttribute(svg, 'viewport-image', 'y', (cy - baseH * 0.5).toFixed(1));
    realm2d.setSvgAttribute(svg, 'viewport-image', 'width', baseW.toFixed(1));
    realm2d.setSvgAttribute(svg, 'viewport-image', 'height', baseH.toFixed(1));
    realm2d.setSvgText(
      svg,
      'stat-zoom',
      `${zoom.toFixed(2)}x (pan: ${Math.round(panX)}, ${Math.round(panY)})`
    );
    const barWidth = Math.max(12, Math.min(312, ((zoom - 0.4) / 3.6) * 312));
    realm2d.setSvgAttribute(svg, 'zoom-bar', 'width', barWidth.toFixed(1));
  };

  const recordEvent = (label: string, pos?: [number, number], uv?: [number, number]) => {
    realm2d.setSvgText(svg, 'stat-event', label);
    if (pos) {
      realm2d.setSvgText(svg, 'stat-pos', `${Math.round(pos[0])}, ${Math.round(pos[1])}`);
    }
    if (uv) {
      realm2d.setSvgText(svg, 'stat-uv', `${uv[0].toFixed(2)}, ${uv[1].toFixed(2)}`);
    }
  };

  const bumpInteractions = () => {
    interactions++;
    realm2d.setSvgText(svg, 'stat-clicks', `Interactions: ${interactions} | ESC / Q to exit`);
  };

  const viewportHit = runtime.interactive(realm2d.realmId, {
    type: 'svg',
    svgId: svg.svgId,
    elementId: 'viewport-hit'
  });

  viewportHit.on('hover', (ev) => {
    recordEvent('hover (viewport)', ev.pointer.position, ev.uv);
  });
  viewportHit.on('leave', (ev) => {
    recordEvent('leave (viewport)', ev.pointer.position, ev.uv);
  });
  viewportHit.on('move', (ev) => {
    recordEvent(dragging ? 'drag (viewport)' : 'move (viewport)', ev.pointer.position, ev.uv);
  });
  viewportHit.on('down', (ev) => {
    dragging = true;
    lastPointerPos = [ev.pointer.position[0], ev.pointer.position[1]];
    bumpInteractions();
    recordEvent('down (viewport)', ev.pointer.position, ev.uv);
  });
  viewportHit.on('pressmove', (ev) => {
    if (!dragging) return;
    const dx = ev.pointer.position[0] - lastPointerPos[0];
    const dy = ev.pointer.position[1] - lastPointerPos[1];
    lastPointerPos = [ev.pointer.position[0], ev.pointer.position[1]];
    panX = Math.max(-220, Math.min(220, panX + dx));
    panY = Math.max(-180, Math.min(180, panY + dy));
    updateViewportTransform();
    recordEvent('pressmove (pan)', ev.pointer.position, ev.uv);
  });
  viewportHit.on('pressup', (ev) => {
    dragging = false;
    recordEvent('pressup (viewport)', ev.pointer.position, ev.uv);
  });
  viewportHit.on('scroll', (ev) => {
    const delta = ev.scrollDelta;
    if (!delta) return;
    const isLines = 'lines' in delta;
    const [dx, dy] = isLines ? delta.lines : delta.pixels;
    const unit = isLines ? 'lines' : 'pixels';
    const step = isLines ? dy * 0.15 : dy * 0.003;
    zoom = Math.max(0.4, Math.min(4.0, zoom + step));
    bumpInteractions();
    realm2d.setSvgText(svg, 'stat-wheel', `${dx.toFixed(1)}, ${dy.toFixed(1)} (${unit})`);
    updateViewportTransform();
    recordEvent('scroll (wheel)', ev.pointer.position, ev.uv);
  });

  const selectTexture = (texId: TextureId, pixelated: boolean, activeThumbId: string) => {
    activeTex = texId;
    activePixelated = pixelated;
    realm2d.setSvgAttribute(svg, 'viewport-image', 'textureId', String(activeTex));
    realm2d.setSvgAttribute(
      svg,
      'viewport-image',
      'image-rendering',
      activePixelated ? 'pixelated' : 'optimizeQuality'
    );
    realm2d.setSvgText(
      svg,
      'stat-tex',
      `#${activeTex} (${activePixelated ? 'pixelated' : 'smooth'})`
    );
    for (const id of ['thumb-radar', 'thumb-pixel', 'thumb-star']) {
      realm2d.setSvgAttribute(svg, id, 'stroke', id === activeThumbId ? '#38bdf8' : '#284664');
      realm2d.setSvgAttribute(svg, id, 'stroke-width', id === activeThumbId ? '2' : '1.5');
    }
    bumpInteractions();
  };

  for (const [thumbId, texId, pixelated] of [
    ['thumb-radar', texRadar, false],
    ['thumb-pixel', texPixel, true],
    ['thumb-star', texStar, false]
  ] as const) {
    const listener = runtime.interactive(realm2d.realmId, {
      type: 'svg',
      svgId: svg.svgId,
      elementId: thumbId
    });
    listener.on('click', (ev) => {
      selectTexture(texId, pixelated, thumbId);
      recordEvent(`click (${thumbId})`, ev.pointer.position, ev.uv);
    });
  }

  const btnAspect = runtime.interactive(realm2d.realmId, {
    type: 'svg',
    svgId: svg.svgId,
    elementId: 'btn-aspect'
  });
  btnAspect.on('click', (ev) => {
    aspectIndex = (aspectIndex + 1) % ASPECT_MODES.length;
    const mode = ASPECT_MODES[aspectIndex]!;
    realm2d.setSvgAttribute(svg, 'viewport-image', 'preserveAspectRatio', mode);
    realm2d.setSvgText(svg, 'stat-aspect', mode);
    bumpInteractions();
    recordEvent('click (btn-aspect)', ev.pointer.position, ev.uv);
  });

  const btnReset = runtime.interactive(realm2d.realmId, {
    type: 'svg',
    svgId: svg.svgId,
    elementId: 'btn-reset'
  });
  btnReset.on('click', (ev) => {
    zoom = 1.0;
    panX = 0;
    panY = 0;
    updateViewportTransform();
    bumpInteractions();
    recordEvent('click (btn-reset)', ev.pointer.position, ev.uv);
  });

  return {
    realm2d,
    svg,
    textures: { texRadar, texPixel, texStar },
    getState: () => ({ zoom, panX, panY, activeTex, activePixelated, interactions })
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
          title: options.title ?? 'Galfus Demo [ui1]: SVG Pointer, Wheel & Texture Image Lab',
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
