import { GalfusBun } from '../../sdk/bun/galfus.ts';
import type { InvocationFilter } from '../../sdk/typescript/galfus.ts';

const TARGET_WINDOW = 1;
const REALM_COLOR = 10;
const INVOCATION_LEFT = 100;
const INVOCATION_RIGHT = 101;
const SHADER_CUSTOM_INVERT = 500;

const COLOR_PALETTE: [string, [number, number, number, number]][] = [
  ['Sky Blue (#33B2FF)', [0.2, 0.7, 1.0, 1.0]],
  ['Forest Green (#33D94D)', [0.2, 0.85, 0.3, 1.0]],
  ['Crimson Red (#E6334D)', [0.9, 0.2, 0.3, 1.0]],
  ['Golden Amber (#FFCC33)', [1.0, 0.8, 0.2, 1.0]],
  ['Pure White (#FFFFFF)', [1.0, 1.0, 1.0, 1.0]]
];

const INVERT_WGSL = `
fn screen_effect(in: ScreenInput) -> vec4<f32> {
    return vec4<f32>(1.0 - in.color.rgb, in.color.a);
}
`;

function extractKey(input: { physicalKey: string; logicalKey: any }): string {
  if (typeof input.logicalKey === 'object' && input.logicalKey !== null) {
    if ('character' in input.logicalKey && typeof input.logicalKey.character === 'string') {
      return input.logicalKey.character.toLowerCase();
    }
    if ('named' in input.logicalKey && typeof input.logicalKey.named === 'string') {
      return input.logicalKey.named.toLowerCase();
    }
  }
  const phys = input.physicalKey.toLowerCase();
  if (phys.startsWith('key') && phys.length === 4) {
    return phys.slice(3);
  }
  if (phys.startsWith('digit') && phys.length === 6) {
    return phys.slice(5);
  }
  return phys;
}

export async function runDemo1(): Promise<void> {
  console.log(
    '=== Galfus Engine - Demo 1 (TypeScript / Bun): Split-Screen & Post-Processing ===\n'
  );

  const galfus = new GalfusBun();

  console.log('==> Initializing Platform Context...');
  try {
    galfus.platformInit();
  } catch (err) {
    console.error('Failed to initialize platform context:', err);
    process.exit(1);
  }

  const windowId = 1;
  console.log('==> Creating window...');
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 1 (TS): Split-Screen & Sepia Post-Processing',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created successfully (Logical ID: ${windowId})`);

  console.log('==> Attaching window to Multiverse GPU presentation...');
  galfus.multiverseAttachWindow(windowId);
  console.log('✔ Multiverse Context attached to window');

  console.log('==> Declaring Window Target (#1)...');
  galfus.multiverseCreateTarget(TARGET_WINDOW, {
    kind: { type: 'window', windowId }
  });
  console.log('✔ Window Target created');

  let paletteIdx = 0;
  const activePalette = COLOR_PALETTE[paletteIdx] ?? COLOR_PALETTE[0]!;
  const initialColor = activePalette[1];
  console.log(
    `==> Registering ColorRealm (#${REALM_COLOR}) with initial color: ${activePalette[0]}`
  );
  galfus.multiverseRegisterColorRealm(
    REALM_COLOR,
    initialColor[0],
    initialColor[1],
    initialColor[2],
    initialColor[3]
  );
  console.log('✔ ColorRealm registered');

  console.log('==> Creating Invocations (Split-Screen):');
  galfus.multiverseCreateInvocation(INVOCATION_LEFT, {
    realmId: REALM_COLOR,
    targetId: TARGET_WINDOW,
    cameraSlot: 1,
    viewport: { unit: 'normalized', x: 0.0, y: 0.0, width: 0.5, height: 1.0 },
    filters: [],
    zIndex: 0,
    enabled: true,
    clearColor: initialColor
  });
  console.log('    Left  (#100): Viewport (0.0..0.5) -> Normal / Raw Pass');

  galfus.multiverseCreateInvocation(INVOCATION_RIGHT, {
    realmId: REALM_COLOR,
    targetId: TARGET_WINDOW,
    cameraSlot: 2,
    viewport: { unit: 'normalized', x: 0.5, y: 0.0, width: 0.5, height: 1.0 },
    filters: ['sepia'],
    zIndex: 0,
    enabled: true,
    clearColor: initialColor
  });
  console.log('    Right (#101): Viewport (0.5..1.0) -> Sepia Post-Process Filter');

  console.log('==> Registering custom WGSL ShaderEffect (#500: Invert Color)...');
  galfus.multiverseRegisterShader(SHADER_CUSTOM_INVERT, INVERT_WGSL);
  console.log('✔ Custom shader registered\n');

  console.log('==> Controls:');
  console.log('  - Click / Space : Cycle Color Palette in real-time');
  console.log('  - 1..5 Keys     : Direct Color selection');
  console.log('  - F / C / S / N : Right Viewport filter (Sepia / Invert / Raw)');
  console.log('  - A             : Toggle smooth RGB rainbow animation');
  console.log('  - Escape        : Exit demo application cleanly\n');

  let running = true;
  let animating = false;
  let animTime = 0;
  let filterMode: 'sepia' | 'invert' | 'none' = 'sepia';
  let frame = 0;
  let lastTime = Date.now();
  let lastFpsUpdate = Date.now();

  const setColor = (idx: number) => {
    paletteIdx = idx % COLOR_PALETTE.length;
    const selected = COLOR_PALETTE[paletteIdx];
    if (selected) {
      const [name, color] = selected;
      galfus.multiverseSetInvocationClearColor(
        INVOCATION_LEFT,
        color[0],
        color[1],
        color[2],
        color[3],
        true
      );
      galfus.multiverseSetInvocationClearColor(
        INVOCATION_RIGHT,
        color[0],
        color[1],
        color[2],
        color[3],
        true
      );
      console.log(`[Palette] Switched to ${name}`);
    }
  };

  const handleExit = () => {
    if (running) {
      running = false;
    }
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  try {
    while (running) {
      const now = Date.now();
      const deltaSecs = Math.max(0.001, (now - lastTime) / 1000.0);
      lastTime = now;

      const events = galfus.platformPumpEvents();
      for (const ev of events) {
        if ('window' in ev) {
          const win = ev.window;
          if ('closeRequested' in win) {
            console.log('Window close requested.');
            running = false;
          } else if ('resized' in win) {
            galfus.multiverseUpdateWindowSize(windowId, win.resized.width, win.resized.height);
          }
        } else if ('pointer' in ev && 'button' in ev.pointer) {
          const btn = ev.pointer.button;
          if (btn.state === 'pressed' && btn.button === 'primary') {
            setColor(paletteIdx + 1);
          }
        } else if ('keyboard' in ev && 'input' in ev.keyboard) {
          const input = ev.keyboard.input;
          if (input.state === 'pressed') {
            const key = extractKey(input);

            if (key === 'escape') {
              console.log('Escape pressed: Exiting demo.');
              running = false;
            } else if (key >= '1' && key <= '5') {
              setColor(parseInt(key, 10) - 1);
            } else if (key === ' ' || key === 'space') {
              setColor(paletteIdx + 1);
            } else if (key === 'a') {
              animating = !animating;
              console.log(`[Animation] Rainbow animation ${animating ? 'STARTED' : 'PAUSED'}`);
            } else if (key === 'f') {
              // Cycle filter: sepia -> invert -> none -> sepia
              if (filterMode === 'sepia') {
                filterMode = 'invert';
                galfus.multiverseSetInvocationFilters(INVOCATION_RIGHT, [
                  { custom: { shaderId: SHADER_CUSTOM_INVERT } }
                ]);
                console.log('[Filter] Right Viewport filter: Custom Invert Shader (#500)');
              } else if (filterMode === 'invert') {
                filterMode = 'none';
                galfus.multiverseSetInvocationFilters(INVOCATION_RIGHT, []);
                console.log('[Filter] Right Viewport filter: None (Raw / No Filter)');
              } else {
                filterMode = 'sepia';
                galfus.multiverseSetInvocationFilters(INVOCATION_RIGHT, ['sepia']);
                console.log('[Filter] Right Viewport filter: Builtin Sepia Filter');
              }
            } else if (key === 's') {
              filterMode = 'sepia';
              galfus.multiverseSetInvocationFilters(INVOCATION_RIGHT, ['sepia']);
              console.log('[Filter] Right Viewport filter: Builtin Sepia Filter');
            } else if (key === 'c') {
              filterMode = 'invert';
              galfus.multiverseSetInvocationFilters(INVOCATION_RIGHT, [
                { custom: { shaderId: SHADER_CUSTOM_INVERT } }
              ]);
              console.log('[Filter] Right Viewport filter: Custom Invert Shader (#500)');
            } else if (key === 'n') {
              filterMode = 'none';
              galfus.multiverseSetInvocationFilters(INVOCATION_RIGHT, []);
              console.log('[Filter] Right Viewport filter: None (Raw / No Filter)');
            }
          }
        }
      }

      if (animating) {
        animTime += deltaSecs;
        const r = 0.5 + 0.5 * Math.sin(animTime * 2.0);
        const g = 0.5 + 0.5 * Math.sin(animTime * 2.0 + 2.094);
        const b = 0.5 + 0.5 * Math.sin(animTime * 2.0 + 4.188);
        galfus.multiverseSetInvocationClearColor(INVOCATION_LEFT, r, g, b, 1.0, true);
        galfus.multiverseSetInvocationClearColor(INVOCATION_RIGHT, r, g, b, 1.0, true);
      }

      galfus.multiverseResolve();
      galfus.multiverseDispatch(frame, deltaSecs);

      frame++;
      if (now - lastFpsUpdate >= 250) {
        const fps = (1.0 / deltaSecs).toFixed(0);
        const title = `Galfus TS Demo 1 | Left: RAW | Right: ${filterMode.toUpperCase()} | FPS: ${fps} | Frame: ${frame}`;
        galfus.windowSetTitle(windowId, title);
        lastFpsUpdate = now;
      }

      await Bun.sleep(16);
    }
  } finally {
    process.removeListener('SIGINT', handleExit);
    process.removeListener('SIGTERM', handleExit);
    console.log('\n==> Cleaning up Multiverse resources...');
    try {
      galfus.multiverseDestroyInvocation(INVOCATION_LEFT);
      galfus.multiverseDestroyInvocation(INVOCATION_RIGHT);
      galfus.multiverseDestroyTarget(TARGET_WINDOW);
    } catch {
      // Ignore if already cleaned up
    }
    console.log('==> Shutting down platform context...');
    galfus.platformShutdown();
    console.log('✔ Demo 1 shutdown clean. Goodbye!\n');
  }
}
