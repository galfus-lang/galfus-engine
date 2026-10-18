import { GalfusBun } from '../../sdk/bun/galfus.ts';
import { extractKey } from './utils.ts';

const TARGET_WINDOW = 1;
const REALM_2D = 30;
const INVOCATION_MAIN = 300;
const CAMERA_ID = 1;

// Entity IDs
const SVG_HUD_CARD_ID = 10;
const SVG_COMPASS_ID = 11;
const SVG_MASCOT_ID = 12;
const SVG_TEXT_ALIGN_ID = 13;
const LIGHT_ORBIT_ID = 1;
const LIGHT_AMBIENT_ID = 2;

// --- RICH SVG VECTOR ASSETS ---

/** SVG 1: Cyberpunk Reactive HUD / Status Card */
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

    <!-- State Icons -->
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

  <!-- Card Backdrop -->
  <rect id="card-bg" x="4" y="4" width="392" height="232" rx="16" fill="url(#card-grad)" stroke="#38bdf8" stroke-width="2"/>
  
  <!-- Corner Tech Accents -->
  <path d="M4 28 L4 4 L28 4" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M372 4 L396 4 L396 28" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M4 212 L4 236 L28 236" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M372 236 L396 236 L396 212" fill="none" stroke="#00ffff" stroke-width="3"/>

  <!-- Icon Slot (Dynamically Swapped via use href) -->
  <g transform="translate(18, 18)">
    <use id="icon-ref" href="#state-core"/>
  </g>

  <!-- Header Titles -->
  <text id="card-title" x="90" y="46" font-family="monospace" font-size="20" font-weight="bold" fill="#f8fafc" letter-spacing="1.5">GALFUS QUANTUM DECK</text>
  <text id="status-label" x="90" y="66" font-family="monospace" font-size="12" fill="#38bdf8">SYSTEM: ONLINE [DEFENSE]</text>

  <!-- Divider Line -->
  <line x1="20" y1="84" x2="380" y2="84" stroke="#334155" stroke-width="1.5"/>

  <!-- Telemetry Bar -->
  <text x="24" y="112" font-family="monospace" font-size="13" fill="#94a3b8">FLUX CAPACITANCE</text>
  <rect x="24" y="122" width="352" height="18" rx="6" fill="#0f172a" stroke="#1e293b" stroke-width="1"/>
  <rect id="flux-bar" x="26" y="124" width="280" height="14" rx="4" fill="url(#bar-grad)"/>

  <!-- Live Stats -->
  <text id="flux-percent" x="320" y="112" font-family="monospace" font-size="13" font-weight="bold" fill="#38bdf8">80%</text>

  <!-- Dynamic Uptime & Instructions -->
  <text id="uptime-text" x="24" y="172" font-family="monospace" font-size="13" fill="#cbd5e1">CYCLE TICK: 00000</text>
  <text id="mode-text" x="24" y="196" font-family="monospace" font-size="12" fill="#a78bfa">MODE: IDLE (PRESS SPACE TO TOGGLE)</text>
  <text x="24" y="218" font-family="monospace" font-size="10" fill="#64748b">WASD: MOVE | Q/E: SCALE | C: THEME PALETTE</text>
</svg>
`;

/** SVG 2: Rotating Sci-Fi Holographic Compass / Astrolabe */
const SVG_COMPASS_XML = `
<svg width="240" height="240" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="compass-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ec4899" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#831843" stop-opacity="0.0"/>
    </radialGradient>
  </defs>

  <!-- Ambient Glow -->
  <circle cx="120" cy="120" r="110" fill="url(#compass-glow)"/>

  <!-- Outer Dial -->
  <circle id="outer-ring" cx="120" cy="120" r="105" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-dasharray="14 6"/>
  <circle id="mid-ring" cx="120" cy="120" r="85" fill="none" stroke="#fb7185" stroke-width="1.5" stroke-dasharray="6 8"/>

  <!-- Calibrated Ticks -->
  <path d="M120 10 L120 22 M120 218 L120 230 M10 120 L22 120 M218 120 L230 120" stroke="#fda4af" stroke-width="2"/>
  <path d="M42 42 L52 52 M188 188 L198 198 M42 198 L52 188 M188 52 L198 42" stroke="#fda4af" stroke-width="1.5"/>

  <!-- Inner Reticle & Star -->
  <circle cx="120" cy="120" r="50" fill="none" stroke="#e11d48" stroke-width="2"/>
  <polygon id="center-star" points="120,78 127,112 162,120 127,128 120,162 113,128 78,120 113,112" fill="#fb7185" opacity="0.85"/>
  <circle cx="120" cy="120" r="8" fill="#fff1f2"/>
</svg>
`;

/** SVG 3: Expressive Cyber Mascot with Dynamic Eye Reaction */
const SVG_MASCOT_XML = `
<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="orb-grad" cx="40%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="70%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </radialGradient>
  </defs>

  <!-- Floating Shadow Base -->
  <ellipse cx="90" cy="165" rx="55" ry="10" fill="#000000" opacity="0.45"/>

  <!-- Main Cyber Sphere -->
  <circle id="mascot-body" cx="90" cy="85" r="65" fill="url(#orb-grad)" stroke="#6ee7b7" stroke-width="3"/>

  <!-- Tech Antennas -->
  <line x1="90" y1="20" x2="90" y2="5" stroke="#6ee7b7" stroke-width="3"/>
  <circle cx="90" cy="4" r="5" fill="#a7f3d0"/>

  <!-- Visor Screen -->
  <rect id="mascot-visor" x="45" y="60" width="90" height="42" rx="14" fill="#022c22" stroke="#10b981" stroke-width="1.5"/>

  <!-- Expressive Eyes (Dynamically Modulated) -->
  <ellipse id="eye-left" cx="70" cy="81" rx="9" ry="12" fill="#34d399"/>
  <ellipse id="eye-right" cx="110" cy="81" rx="9" ry="12" fill="#34d399"/>

  <!-- Cheerful Mouth / Audio Waveform -->
  <path id="mascot-mouth" d="M78 94 Q90 100 102 94" fill="none" stroke="#a7f3d0" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

/** SVG 4: Typography, 4 Corners Alignment & Auto-Wrapping Showcase */
const SVG_TEXT_ALIGN_XML = `
<svg width="400" height="240" viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
  <!-- Card Backdrop -->
  <rect x="4" y="4" width="392" height="232" rx="14" fill="#0b1120" stroke="#3b82f6" stroke-width="1.5"/>
  <rect x="12" y="12" width="376" height="216" rx="8" fill="none" stroke="#1e293b" stroke-width="1" stroke-dasharray="4 4"/>

  <!-- Corner 1: Top-Left (x=24, y=24) -->
  <path d="M18 24 H30 M24 18 V30" stroke="#38bdf8" stroke-width="1.5"/>
  <text x="34" y="24" font-family="monospace" font-size="11" font-weight="bold" fill="#38bdf8" text-anchor="start" dominant-baseline="hanging">TOP-LEFT</text>
  <text x="34" y="38" font-family="monospace" font-size="9" fill="#64748b" text-anchor="start" dominant-baseline="hanging">[start | hanging]</text>

  <!-- Corner 2: Top-Right (x=376, y=24) -->
  <path d="M370 24 H382 M376 18 V30" stroke="#f43f5e" stroke-width="1.5"/>
  <text x="366" y="24" font-family="monospace" font-size="11" font-weight="bold" fill="#f43f5e" text-anchor="end" dominant-baseline="hanging">TOP-RIGHT</text>
  <text x="366" y="38" font-family="monospace" font-size="9" fill="#64748b" text-anchor="end" dominant-baseline="hanging">[end | hanging]</text>

  <!-- Corner 3: Bottom-Left (x=24, y=216) -->
  <path d="M18 216 H30 M24 210 V222" stroke="#10b981" stroke-width="1.5"/>
  <text x="34" y="202" font-family="monospace" font-size="9" fill="#64748b" text-anchor="start" dominant-baseline="auto">[start | auto]</text>
  <text x="34" y="216" font-family="monospace" font-size="11" font-weight="bold" fill="#10b981" text-anchor="start" dominant-baseline="auto">BOTTOM-LEFT</text>

  <!-- Corner 4: Bottom-Right (x=376, y=216) -->
  <path d="M370 216 H382 M376 210 V222" stroke="#fbbf24" stroke-width="1.5"/>
  <text x="366" y="202" font-family="monospace" font-size="9" fill="#64748b" text-anchor="end" dominant-baseline="auto">[end | auto]</text>
  <text x="366" y="216" font-family="monospace" font-size="11" font-weight="bold" fill="#fbbf24" text-anchor="end" dominant-baseline="auto">BOTTOM-RIGHT</text>

  <!-- Center (x=200, y=120) with Auto-Wrapped Box -->
  <circle cx="200" cy="120" r="54" fill="none" stroke="#6366f1" stroke-width="1" stroke-dasharray="3 3"/>
  <path d="M192 120 H208 M200 112 V128" stroke="#818cf8" stroke-width="1.5"/>

  <rect x="55" y="58" width="290" height="124" rx="10" fill="#0f172a" stroke="#4f46e5" stroke-width="1.5"/>
  <text x="200" y="74" font-family="monospace" font-size="11" font-weight="bold" fill="#a5b4fc" text-anchor="middle" dominant-baseline="middle">CENTER &amp; AUTO-WRAP</text>

  <text id="center-wrapped-text" x="200" y="94" font-family="monospace" font-size="10" fill="#e2e8f0" text-anchor="middle">
  </text>

  <text x="200" y="168" font-family="monospace" font-size="9" fill="#818cf8" text-anchor="middle" dominant-baseline="middle">[T] KEY: CYCLE PARAGRAPH TEXT</text>
</svg>
`;

/** Wraps long text into lines of maxChars length */
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

// Color Palettes for 'C' Key Cycling
const THEMES = [
  { stroke: '#38bdf8', accent: '#06b6d4', label: 'CYAN NEON' },
  { stroke: '#ec4899', accent: '#f43f5e', label: 'MAGENTA PUNK' },
  { stroke: '#10b981', accent: '#34d399', label: 'EMERALD MATRIX' },
  { stroke: '#fbbf24', accent: '#f59e0b', label: 'AMBER SOLAR' }
];

export async function runDemo2d3(): Promise<void> {
  console.log(`================================================================
   GALFUS ENGINE - DEMO 2D-3: REACTIVE SVG 2D VECTOR GRAPHICS
================================================================
Initializing Platform & Multiverse Subsystems...`);

  const galfus = new GalfusBun();
  galfus.platformInit();

  const windowId = 1;
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 2D-3: Reactive Vector SVG Component',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created (Logical ID: ${windowId})`);

  galfus.multiverseAttachWindow(windowId);
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });

  console.log(`==> Creating Realm2D (#${REALM_2D})...`);
  galfus.realm2dCreate(REALM_2D);

  console.log('==> Setting up 2D Camera (#1) with Reverse-Z orthographic projection...');
  const WORLD_HEIGHT = 18.0;
  galfus.realm2dCreateCamera(
    REALM_2D,
    CAMERA_ID,
    {
      orthoScale: WORLD_HEIGHT,
      near: -100.0,
      far: 100.0,
      cameraSlot: 1,
      active: true
    },
    {
      position: [0.0, 0.0],
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 0
    }
  );

  // Multiverse Invocation for Fullscreen Window
  galfus.multiverseCreateInvocation(INVOCATION_MAIN, {
    realmId: REALM_2D,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: {
      offsetX: { px: 0 },
      offsetY: { px: 0 },
      width: { vw: 100 },
      height: { vh: 100 }
    },
    zIndex: 1,
    enabled: true,
    clearColor: [0.03, 0.04, 0.07, 1.0]
  });

  console.log('==> Creating Ambient & Orbiting 2D Lights...');
  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_AMBIENT_ID,
    {
      color: [1.0, 1.0, 1.0],
      intensity: 0.85,
      range: 50.0,
      lightRadius: 0.5,
      castShadow: false,
      active: true
    },
    { position: [0.0, 0.0], zLayer: 0 }
  );

  galfus.realm2dCreateLight(
    REALM_2D,
    LIGHT_ORBIT_ID,
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

  console.log('==> Instantiating Reactive SVG Entities...');
  // 1. Main Cyberpunk HUD Card (size: 8.8 x 5.2 world units)
  galfus.realm2dCreateSvg(
    REALM_2D,
    SVG_HUD_CARD_ID,
    {
      source: SVG_HUD_CARD_XML,
      dimensions: [8.8, 5.2],
      castShadow: false,
      receiveShadow: true
    },
    {
      position: [-3.2, 3.2],
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 10
    }
  );

  // 2. Typography, 4 Corners Alignment & Auto-Wrapping Card (size: 8.8 x 5.2 world units)
  const initialWrapped = wrapTextLines(PARAGRAPHS[0]!, 34).join('\n');
  galfus.realm2dCreateSvg(
    REALM_2D,
    SVG_TEXT_ALIGN_ID,
    {
      source: SVG_TEXT_ALIGN_XML,
      dimensions: [8.8, 5.2],
      castShadow: false,
      receiveShadow: true
    },
    {
      position: [-3.2, -3.2],
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 10
    }
  );
  galfus.realm2dSetSvgText(REALM_2D, SVG_TEXT_ALIGN_ID, 'center-wrapped-text', initialWrapped);

  // 3. Rotating Holographic Compass (size: 4.8 x 4.8 world units)
  galfus.realm2dCreateSvg(
    REALM_2D,
    SVG_COMPASS_ID,
    {
      source: SVG_COMPASS_XML,
      dimensions: [4.8, 4.8],
      castShadow: false,
      receiveShadow: true
    },
    {
      position: [5.8, 3.2],
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 5
    }
  );

  // 4. Cyber Mascot (size: 4.0 x 4.0 world units)
  galfus.realm2dCreateSvg(
    REALM_2D,
    SVG_MASCOT_ID,
    {
      source: SVG_MASCOT_XML,
      dimensions: [4.0, 4.0],
      castShadow: false,
      receiveShadow: true
    },
    {
      position: [5.8, -3.2],
      rotation: 0.0,
      scale: [1.0, 1.0],
      zLayer: 8
    }
  );

  console.log(`
✔ All SVG Entities Initialized!
----------------------------------------------------------------
 CONTROLS:
   [SPACE]       - Toggle HUD Mode: DEFENSE -> COMBAT -> CORE
   [C]           - Cycle SVG Theme Palettes (Cyan / Magenta / Green / Amber)
   [T]           - Cycle Auto-Wrapped Paragraph Text (Center Alignment)
   [W, A, S, D]  - Translate HUD Vector Card in 2D World
   [Q, E]        - Scale HUD Card Up / Down
   [ESC / Ctrl+C]- Exit Demo
----------------------------------------------------------------
`);

  // State Management
  const STATES = [
    { id: '#state-shield', title: 'SYSTEM: ONLINE [DEFENSE]', mode: 'MODE: DEFENSE (SHIELD UP)' },
    { id: '#state-combat', title: 'SYSTEM: ALERT [COMBAT]', mode: 'MODE: COMBAT (WEAPONS ARMED)' },
    { id: '#state-core', title: 'SYSTEM: RECHARGE [CORE]', mode: 'MODE: QUANTUM CORE (HARVESTING)' }
  ];
  let stateIndex = 0;
  let themeIndex = 0;
  let paragraphIndex = 0;

  const hudPos = { x: -3.2, y: 3.2 };
  let hudScale = 1.0;
  let running = true;
  let frame = 0;
  let compassAngle = 0.0;

  // Active Key States
  const keysDown = new Set<string>();

  while (running) {
    const events = galfus.platformPumpEvents();
    for (const ev of events) {
      if (ev.kind === 'window') {
        if (ev.type === 'closeRequested') {
          running = false;
          break;
        } else if (ev.type === 'resized') {
          galfus.multiverseUpdateWindowSize(windowId, ev.width, ev.height);
        }
      } else if (ev.kind === 'keyboard' && ev.type === 'input') {
        const key = extractKey(ev);
        if (ev.state === 'pressed') {
          keysDown.add(key);

          if (key === 'escape') {
            running = false;
            break;
          } else if (key === ' ' || key === 'space') {
            // Toggle State via SVG <use href="#..."> and update text
            stateIndex = (stateIndex + 1) % STATES.length;
            const curState = STATES[stateIndex]!;
            galfus.realm2dSetSvgAttribute(
              REALM_2D,
              SVG_HUD_CARD_ID,
              'icon-ref',
              'href',
              curState.id
            );
            galfus.realm2dSetSvgText(REALM_2D, SVG_HUD_CARD_ID, 'status-label', curState.title);
            galfus.realm2dSetSvgText(REALM_2D, SVG_HUD_CARD_ID, 'mode-text', curState.mode);
            console.log(`[MODE] Switched state to: ${curState.mode}`);

            // Mascot eye expressions change with mode
            if (stateIndex === 1) {
              // Combat: narrow eyes, red visor
              galfus.realm2dSetSvgAttribute(REALM_2D, SVG_MASCOT_ID, 'eye-left', 'ry', '6');
              galfus.realm2dSetSvgAttribute(REALM_2D, SVG_MASCOT_ID, 'eye-right', 'ry', '6');
              galfus.realm2dSetSvgAttribute(REALM_2D, SVG_MASCOT_ID, 'eye-left', 'fill', '#f87171');
              galfus.realm2dSetSvgAttribute(
                REALM_2D,
                SVG_MASCOT_ID,
                'eye-right',
                'fill',
                '#f87171'
              );
            } else {
              // Normal/Shield: wide eyes, cyan/green
              galfus.realm2dSetSvgAttribute(REALM_2D, SVG_MASCOT_ID, 'eye-left', 'ry', '12');
              galfus.realm2dSetSvgAttribute(REALM_2D, SVG_MASCOT_ID, 'eye-right', 'ry', '12');
              galfus.realm2dSetSvgAttribute(REALM_2D, SVG_MASCOT_ID, 'eye-left', 'fill', '#34d399');
              galfus.realm2dSetSvgAttribute(
                REALM_2D,
                SVG_MASCOT_ID,
                'eye-right',
                'fill',
                '#34d399'
              );
            }
          } else if (key === 'c') {
            // Cycle Color Theme on SVG card border
            themeIndex = (themeIndex + 1) % THEMES.length;
            const theme = THEMES[themeIndex]!;
            galfus.realm2dSetSvgAttribute(
              REALM_2D,
              SVG_HUD_CARD_ID,
              'card-bg',
              'stroke',
              theme.stroke
            );
            galfus.realm2dSetSvgAttribute(
              REALM_2D,
              SVG_HUD_CARD_ID,
              'status-label',
              'fill',
              theme.accent
            );
            console.log(`[THEME] Switched palette to: ${theme.label}`);
          } else if (key === 't') {
            // Cycle Auto-Wrapped Paragraph Text
            paragraphIndex = (paragraphIndex + 1) % PARAGRAPHS.length;
            const wrapped = wrapTextLines(PARAGRAPHS[paragraphIndex]!, 34).join('\n');
            galfus.realm2dSetSvgText(REALM_2D, SVG_TEXT_ALIGN_ID, 'center-wrapped-text', wrapped);
            console.log(`[TEXT] Cycled auto-wrapped paragraph #${paragraphIndex + 1}`);
          }
        } else if (ev.state === 'released') {
          keysDown.delete(key);
        }
      }
    }

    // Smooth Interactive HUD Controls
    const moveSpeed = 0.12;
    if (keysDown.has('w') || keysDown.has('arrowup')) hudPos.y += moveSpeed;
    if (keysDown.has('s') || keysDown.has('arrowdown')) hudPos.y -= moveSpeed;
    if (keysDown.has('a') || keysDown.has('arrowleft')) hudPos.x -= moveSpeed;
    if (keysDown.has('d') || keysDown.has('arrowright')) hudPos.x += moveSpeed;

    if (keysDown.has('q')) hudScale = Math.max(0.6, hudScale - 0.015);
    if (keysDown.has('e')) hudScale = Math.min(1.8, hudScale + 0.015);

    // Apply Fast-Path Transform on HUD Card
    galfus.realm2dSetSvgTransform(
      REALM_2D,
      SVG_HUD_CARD_ID,
      new Float32Array([hudPos.x, hudPos.y, 0.0, hudScale, hudScale, 10])
    );

    // Dynamic Animations
    frame++;
    compassAngle -= 0.02;
    galfus.realm2dSetSvgTransform(
      REALM_2D,
      SVG_COMPASS_ID,
      new Float32Array([5.8, 3.2, compassAngle, 1.0, 1.0, 5])
    );

    // Bobbing Mascot with gentle floating scale
    const mascotBob = Math.sin(frame * 0.06) * 0.35;
    galfus.realm2dSetSvgTransform(
      REALM_2D,
      SVG_MASCOT_ID,
      new Float32Array([5.8, -3.2 + mascotBob, 0.0, 1.0, 1.0, 8])
    );

    // Orbit dynamic light around the HUD card
    const lightAngle = frame * 0.03;
    const lightRadius = 4.5;
    galfus.realm2dSetLightTransform(REALM_2D, LIGHT_ORBIT_ID, {
      position: [
        hudPos.x + Math.cos(lightAngle) * lightRadius,
        hudPos.y + Math.sin(lightAngle) * lightRadius
      ],
      zLayer: 0
    });

    // Real-Time Reactive SVG Mutating (every 6 frames ~ 10Hz)
    if (frame % 6 === 0) {
      // Oscillating flux capacitance bar width (0 to 348px)
      const fluxPct = 0.5 + 0.5 * Math.sin(frame * 0.05);
      const fluxWidth = Math.floor(40 + fluxPct * 308);
      galfus.realm2dSetSvgAttribute(
        REALM_2D,
        SVG_HUD_CARD_ID,
        'flux-bar',
        'width',
        fluxWidth.toString()
      );
      galfus.realm2dSetSvgText(
        REALM_2D,
        SVG_HUD_CARD_ID,
        'flux-percent',
        `${Math.floor(fluxPct * 100)}%`
      );

      // Tick Uptime
      const paddedTick = frame.toString().padStart(5, '0');
      galfus.realm2dSetSvgText(
        REALM_2D,
        SVG_HUD_CARD_ID,
        'uptime-text',
        `CYCLE TICK: ${paddedTick}`
      );
    }

    galfus.multiverseResolve();
    galfus.multiverseDispatch(frame, 0.016);

    // Sleep 16ms to cap at ~60fps
    await Bun.sleep(16);
  }

  console.log('==> Cleaning up Realm 2D & Platform context...');
  galfus.multiverseDestroyInvocation(INVOCATION_MAIN);
  galfus.realmClear(REALM_2D);
  galfus.realm2dDestroy(REALM_2D);
  galfus.multiverseDestroyTarget(TARGET_WINDOW);
  galfus.windowClose(windowId);
  galfus.platformShutdown();
  console.log('✔ Demo 2D-3 completed successfully.');
}
