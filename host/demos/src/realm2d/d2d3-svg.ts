import { isKey, type Model2DComponent } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

const SVG_HUD_CARD_XML = `
<svg width="400" height="240" viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="bar-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <g id="state-core">
      <circle cx="36" cy="36" r="18" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="4 3"/>
      <circle cx="36" cy="36" r="10" fill="#0284c7"/>
      <circle cx="36" cy="36" r="4" fill="#e0f2fe"/>
    </g>
    <g id="state-combat">
      <circle cx="36" cy="36" r="18" fill="none" stroke="#ef4444" stroke-width="2.5"/>
      <path d="M26 46 L46 26 M46 46 L26 26" stroke="#f87171" stroke-width="3" stroke-linecap="round"/>
      <circle cx="36" cy="36" r="5" fill="#fca5a5"/>
    </g>
    <g id="state-shield">
      <circle cx="36" cy="36" r="18" fill="none" stroke="#10b981" stroke-width="2.5"/>
      <path d="M26 30 Q36 24 46 30 Q46 44 36 50 Q26 44 26 30 Z" fill="#059669" stroke="#34d399" stroke-width="1.5"/>
    </g>
  </defs>
  <rect id="card-bg" x="4" y="4" width="392" height="232" rx="16" fill="url(#card-grad)" stroke="#38bdf8" stroke-width="2"/>
  <path d="M4 28 L4 4 L28 4" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M372 4 L396 4 L396 28" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M4 212 L4 236 L28 236" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M372 236 L396 236 L396 212" fill="none" stroke="#00ffff" stroke-width="3"/>
  <g transform="translate(18, 18)">
    <use id="icon-ref" href="#state-core"/>
  </g>
  <text id="card-title" x="90" y="46" font-family="monospace" font-size="20" font-weight="bold" fill="#f8fafc" letter-spacing="1.5">GALFUS QUANTUM DECK</text>
  <text id="status-label" x="90" y="66" font-family="monospace" font-size="12" fill="#38bdf8">SYSTEM: ONLINE [DEFENSE]</text>
  <line x1="20" y1="84" x2="380" y2="84" stroke="#334155" stroke-width="1.5"/>
  <text x="24" y="112" font-family="monospace" font-size="13" fill="#94a3b8">FLUX CAPACITANCE</text>
  <rect x="24" y="122" width="352" height="18" rx="6" fill="#0f172a" stroke="#1e293b" stroke-width="1"/>
  <rect id="flux-bar" x="26" y="124" width="280" height="14" rx="4" fill="url(#bar-grad)"/>
  <text id="flux-percent" x="320" y="112" font-family="monospace" font-size="13" font-weight="bold" fill="#38bdf8">80%</text>
  <text id="uptime-text" x="24" y="172" font-family="monospace" font-size="13" fill="#cbd5e1">CYCLE TICK: 00000</text>
  <text id="mode-text" x="24" y="196" font-family="monospace" font-size="12" fill="#a78bfa">MODE: IDLE (PRESS SPACE TO TOGGLE)</text>
  <text x="24" y="218" font-family="monospace" font-size="10" fill="#64748b">WASD: MOVE | Q/E: SCALE | C: THEME PALETTE</text>
</svg>
`;

const SVG_COMPASS_XML = `
<svg width="240" height="240" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="compass-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ec4899" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#831843" stop-opacity="0.0"/>
    </radialGradient>
  </defs>
  <circle cx="120" cy="120" r="110" fill="url(#compass-glow)"/>
  <circle id="outer-ring" cx="120" cy="120" r="105" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-dasharray="14 6"/>
  <circle id="mid-ring" cx="120" cy="120" r="85" fill="none" stroke="#fb7185" stroke-width="1.5" stroke-dasharray="6 8"/>
  <path d="M120 10 L120 22 M120 218 L120 230 M10 120 L22 120 M218 120 L230 120" stroke="#fda4af" stroke-width="2"/>
  <path d="M42 42 L52 52 M188 188 L198 198 M42 198 L52 188 M188 52 L198 42" stroke="#fda4af" stroke-width="1.5"/>
  <circle cx="120" cy="120" r="50" fill="none" stroke="#e11d48" stroke-width="2"/>
  <polygon id="center-star" points="120,78 127,112 162,120 127,128 120,162 113,128 78,120 113,112" fill="#fb7185" opacity="0.85"/>
  <circle cx="120" cy="120" r="8" fill="#fff1f2"/>
</svg>
`;

const SVG_MASCOT_XML = `
<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="orb-grad" cx="40%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="70%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </radialGradient>
  </defs>
  <ellipse cx="90" cy="165" rx="55" ry="10" fill="#000000" opacity="0.45"/>
  <circle id="mascot-body" cx="90" cy="85" r="65" fill="url(#orb-grad)" stroke="#6ee7b7" stroke-width="3"/>
  <line x1="90" y1="20" x2="90" y2="5" stroke="#6ee7b7" stroke-width="3"/>
  <circle cx="90" cy="4" r="5" fill="#a7f3d0"/>
  <rect id="mascot-visor" x="45" y="60" width="90" height="42" rx="14" fill="#022c22" stroke="#10b981" stroke-width="1.5"/>
  <ellipse id="eye-left" cx="70" cy="81" rx="9" ry="12" fill="#34d399"/>
  <ellipse id="eye-right" cx="110" cy="81" rx="9" ry="12" fill="#34d399"/>
  <path id="mascot-mouth" d="M78 94 Q90 100 102 94" fill="none" stroke="#a7f3d0" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

const SVG_TEXT_ALIGN_XML = `
<svg width="400" height="240" viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="4" width="392" height="232" rx="14" fill="#0b1120" stroke="#3b82f6" stroke-width="1.5"/>
  <rect x="12" y="12" width="376" height="216" rx="8" fill="none" stroke="#1e293b" stroke-width="1" stroke-dasharray="4 4"/>
  <path d="M18 24 H30 M24 18 V30" stroke="#38bdf8" stroke-width="1.5"/>
  <text x="34" y="24" font-family="monospace" font-size="11" font-weight="bold" fill="#38bdf8" text-anchor="start" dominant-baseline="hanging">TOP-LEFT</text>
  <text x="34" y="38" font-family="monospace" font-size="9" fill="#64748b" text-anchor="start" dominant-baseline="hanging">[start | hanging]</text>
  <path d="M370 24 H382 M376 18 V30" stroke="#f43f5e" stroke-width="1.5"/>
  <text x="366" y="24" font-family="monospace" font-size="11" font-weight="bold" fill="#f43f5e" text-anchor="end" dominant-baseline="hanging">TOP-RIGHT</text>
  <text x="366" y="38" font-family="monospace" font-size="9" fill="#64748b" text-anchor="end" dominant-baseline="hanging">[end | hanging]</text>
  <path d="M18 216 H30 M24 210 V222" stroke="#10b981" stroke-width="1.5"/>
  <text x="34" y="202" font-family="monospace" font-size="9" fill="#64748b" text-anchor="start" dominant-baseline="auto">[start | auto]</text>
  <text x="34" y="216" font-family="monospace" font-size="11" font-weight="bold" fill="#10b981" text-anchor="start" dominant-baseline="auto">BOTTOM-LEFT</text>
  <path d="M370 216 H382 M376 210 V222" stroke="#fbbf24" stroke-width="1.5"/>
  <text x="366" y="202" font-family="monospace" font-size="9" fill="#64748b" text-anchor="end" dominant-baseline="auto">[end | auto]</text>
  <text x="366" y="216" font-family="monospace" font-size="11" font-weight="bold" fill="#fbbf24" text-anchor="end" dominant-baseline="auto">BOTTOM-RIGHT</text>
  <circle cx="200" cy="120" r="54" fill="none" stroke="#6366f1" stroke-width="1" stroke-dasharray="3 3"/>
  <path d="M192 120 H208 M200 112 V128" stroke="#818cf8" stroke-width="1.5"/>
  <rect x="55" y="58" width="290" height="124" rx="10" fill="#0f172a" stroke="#4f46e5" stroke-width="1.5"/>
  <text x="200" y="74" font-family="monospace" font-size="11" font-weight="bold" fill="#a5b4fc" text-anchor="middle" dominant-baseline="middle">CENTER &amp; AUTO-WRAP</text>
  <text id="center-wrapped-text" x="200" y="94" font-family="monospace" font-size="10" fill="#e2e8f0" text-anchor="middle"></text>
  <text x="200" y="168" font-family="monospace" font-size="9" fill="#818cf8" text-anchor="middle" dominant-baseline="middle">[T] KEY: CYCLE PARAGRAPH TEXT</text>
</svg>
`;

function wrapTextLines(text: string, maxChars = 34): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (current.length + w.length + 1 <= maxChars) {
      current = current ? `${current} ${w}` : w;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const PARAGRAPHS = [
  'Galfus Engine renders crisp vector SVGs with GPU rasterization, full straight alpha blending and live DOM reactive XML updates in real-time.',
  'Automatic multiline text wrapping splits paragraphs into structured tspan lines with proportional vertical line-height spacing.',
  'Vector elements integrate with 2D lighting, polar soft shadows, and Reverse-Z orthographic camera layering with sub-millisecond dispatch.'
];

const THEMES = [
  { stroke: '#38bdf8', accent: '#06b6d4', label: 'CYAN NEON' },
  { stroke: '#ec4899', accent: '#f43f5e', label: 'MAGENTA PUNK' },
  { stroke: '#10b981', accent: '#34d399', label: 'EMERALD MATRIX' },
  { stroke: '#fbbf24', accent: '#f59e0b', label: 'AMBER SOLAR' }
];

export async function runDemo2d3(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 2D-3 Reactive Vector SVG Graphics',
    options,
    [1024, 768]
  );

  try {
    const realm2d = runtime.createRealm2D();

    realm2d.createCamera(
      { orthoScale: 18.0, near: -100, far: 100, cameraSlot: 1, active: true },
      { position: [0, 0] }
    );

    realm2d.createLight(
      {
        color: [1.0, 1.0, 1.0],
        intensity: 0.85,
        range: 50.0,
        lightRadius: 0.5,
        castShadow: false,
        active: true
      },
      { position: [0, 0], zLayer: 0 }
    );
    const orbitLight = realm2d.createLight(
      {
        color: [0.3, 0.7, 1.0],
        intensity: 1.5,
        range: 12.0,
        lightRadius: 0.4,
        castShadow: false,
        active: true
      },
      { position: [-4.0, 2.0], zLayer: 0 }
    );

    const hudCard = realm2d.createSvg(
      { source: SVG_HUD_CARD_XML, dimensions: [8.8, 5.2], castShadow: false, receiveShadow: true },
      { position: [-3.2, 3.2], zLayer: 10 }
    );
    const textAlignCard = realm2d.createSvg(
      {
        source: SVG_TEXT_ALIGN_XML,
        dimensions: [8.8, 5.2],
        castShadow: false,
        receiveShadow: true
      },
      { position: [-3.2, -3.2], zLayer: 10 }
    );
    const compassSvg = realm2d.createSvg(
      { source: SVG_COMPASS_XML, dimensions: [4.8, 4.8], castShadow: false, receiveShadow: true },
      { position: [5.8, 3.2], zLayer: 5 }
    );
    const mascotSvg = realm2d.createSvg(
      { source: SVG_MASCOT_XML, dimensions: [4.0, 4.0], castShadow: false, receiveShadow: true },
      { position: [5.8, -3.2], zLayer: 8 }
    );

    runtime.multiverse.createInvocation({
      realmId: realm2d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.03, 0.04, 0.07, 1.0]
    });
    realm2d.flush();

    realm2d.setSvgText(
      textAlignCard,
      'center-wrapped-text',
      wrapTextLines(PARAGRAPHS[0]!, 34).join('\n')
    );

    const STATES = [
      { id: '#state-shield', title: 'SYSTEM: ONLINE [DEFENSE]', mode: 'MODE: DEFENSE (SHIELD UP)' },
      {
        id: '#state-combat',
        title: 'SYSTEM: ALERT [COMBAT]',
        mode: 'MODE: COMBAT (WEAPONS ARMED)'
      },
      {
        id: '#state-core',
        title: 'SYSTEM: RECHARGE [CORE]',
        mode: 'MODE: QUANTUM CORE (HARVESTING)'
      }
    ];
    let stateIndex = 0;
    let themeIndex = 0;
    let paragraphIndex = 0;
    const hudPos = { x: -3.2, y: 3.2 };
    let hudScale = 1.0;
    let compassAngle = 0;
    let frame = 0;
    const keysDown = new Set<string>();

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input') {
        const key = ev.logicalKey.toLowerCase();
        if (ev.state === 'pressed') {
          keysDown.add(key);
          if (isKey(ev, 'space', ' ')) {
            stateIndex = (stateIndex + 1) % STATES.length;
            const curState = STATES[stateIndex]!;
            realm2d.setSvgAttribute(hudCard, 'icon-ref', 'href', curState.id);
            realm2d.setSvgText(hudCard, 'status-label', curState.title);
            realm2d.setSvgText(hudCard, 'mode-text', curState.mode);
            if (stateIndex === 1) {
              realm2d.setSvgAttribute(mascotSvg, 'eye-left', 'ry', '6');
              realm2d.setSvgAttribute(mascotSvg, 'eye-right', 'ry', '6');
              realm2d.setSvgAttribute(mascotSvg, 'eye-left', 'fill', '#f87171');
              realm2d.setSvgAttribute(mascotSvg, 'eye-right', 'fill', '#f87171');
            } else {
              realm2d.setSvgAttribute(mascotSvg, 'eye-left', 'ry', '12');
              realm2d.setSvgAttribute(mascotSvg, 'eye-right', 'ry', '12');
              realm2d.setSvgAttribute(mascotSvg, 'eye-left', 'fill', '#34d399');
              realm2d.setSvgAttribute(mascotSvg, 'eye-right', 'fill', '#34d399');
            }
          } else if (isKey(ev, 'c')) {
            themeIndex = (themeIndex + 1) % THEMES.length;
            const theme = THEMES[themeIndex]!;
            realm2d.setSvgAttribute(hudCard, 'card-bg', 'stroke', theme.stroke);
            realm2d.setSvgAttribute(hudCard, 'status-label', 'fill', theme.accent);
          } else if (isKey(ev, 't')) {
            paragraphIndex = (paragraphIndex + 1) % PARAGRAPHS.length;
            realm2d.setSvgText(
              textAlignCard,
              'center-wrapped-text',
              wrapTextLines(PARAGRAPHS[paragraphIndex]!, 34).join('\n')
            );
          }
        } else {
          keysDown.delete(key);
        }
      }
    });

    runtime.on('tick', ({ dt }) => {
      frame++;
      const moveSpeed = 7.2 * dt;
      if (keysDown.has('w') || keysDown.has('arrowup')) hudPos.y += moveSpeed;
      if (keysDown.has('s') || keysDown.has('arrowdown')) hudPos.y -= moveSpeed;
      if (keysDown.has('a') || keysDown.has('arrowleft')) hudPos.x -= moveSpeed;
      if (keysDown.has('d') || keysDown.has('arrowright')) hudPos.x += moveSpeed;
      if (keysDown.has('q')) hudScale = Math.max(0.6, hudScale - 0.9 * dt);
      if (keysDown.has('e')) hudScale = Math.min(1.8, hudScale + 0.9 * dt);

      realm2d.world
        .getComponent<Model2DComponent>(hudCard.entityId, 'Model2D')
        ?.setTRS([hudPos.x, hudPos.y], 0, [hudScale, hudScale]);

      compassAngle -= 1.2 * dt;
      realm2d.world
        .getComponent<Model2DComponent>(compassSvg.entityId, 'Model2D')
        ?.setRotation(compassAngle);

      const mascotBob = Math.sin(frame * 0.06) * 0.35;
      realm2d.world
        .getComponent<Model2DComponent>(mascotSvg.entityId, 'Model2D')
        ?.setPosition(5.8, -3.2 + mascotBob);

      const lightAngle = frame * 0.03;
      realm2d.world
        .getComponent<Model2DComponent>(orbitLight, 'Model2D')
        ?.setPosition(hudPos.x + Math.cos(lightAngle) * 4.5, hudPos.y + Math.sin(lightAngle) * 4.5);

      if (frame % 6 === 0) {
        const fluxPct = 0.5 + 0.5 * Math.sin(frame * 0.05);
        const fluxWidth = Math.floor(40 + fluxPct * 308);
        realm2d.setSvgAttribute(hudCard, 'flux-bar', 'width', fluxWidth.toString());
        realm2d.setSvgText(hudCard, 'flux-percent', `${Math.floor(fluxPct * 100)}%`);
        realm2d.setSvgText(
          hudCard,
          'uptime-text',
          `CYCLE TICK: ${frame.toString().padStart(5, '0')}`
        );
      }
    });

    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape'] });
  } finally {
    runtime.dispose();
  }
}

if (import.meta.main) {
  await runDemo2d3();
}
