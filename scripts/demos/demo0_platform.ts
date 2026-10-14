import { GalfusBun } from '../../sdk/bun/galfus.ts';

const CURSOR_ICONS = [
  { name: 'Default', id: 0 },
  { name: 'Pointer', id: 1 },
  { name: 'Grab', id: 2 },
  { name: 'Crosshair', id: 4 }
];

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

export async function runDemo0(): Promise<void> {
  console.log('=== Galfus Engine - Demo 0 (TypeScript / Bun): Platform & Input ===\n');

  const galfus = new GalfusBun();

  console.log('==> Initializing Platform Context...');
  try {
    galfus.platformInit();
  } catch (err) {
    console.error('Failed to initialize platform context:', err);
    process.exit(1);
  }

  const caps = galfus.platformGetCapabilities();
  console.log('Platform Capabilities:');
  console.log(` - Multiple windows : ${caps.supportsMultipleWindows}`);
  console.log(` - Positioning      : ${caps.supportsWindowPositioning}`);
  console.log(` - Cursor grab      : ${caps.supportsCursorGrab}`);
  console.log(` - Gamepad          : ${caps.supportsGamepad}`);
  console.log(` - Audio            : ${caps.supportsAudio}`);
  console.log(` - Headless         : ${caps.isHeadless}\n`);

  const windowId = 1;
  console.log('==> Creating window...');
  galfus.windowCreate({
    id: windowId,
    title: 'Galfus Engine - Demo 0 (TS): Platform & Input',
    size: [1024, 768],
    resizable: true,
    decorations: true
  });
  console.log(`✔ Window created successfully (Logical ID: ${windowId})\n`);

  console.log('==> Controls:');
  console.log('  - Mouse Move    : Track pointer coordinates in terminal / title');
  console.log('  - Left Click    : Log pointer click location');
  console.log('  - Right Click   : Cycle cursor icon');
  console.log('  - Middle Click  : Toggle cursor lock / grab');
  console.log('  - Mouse Wheel   : Log scroll delta');
  console.log('  - 1..4 Keys     : Direct cursor icon selection');
  console.log('  - Escape        : Exit demo application cleanly\n');

  let running = true;
  let cursorIdx = 0;
  let cursorGrabbed = false;
  let pointerPos: [number, number] = [0, 0];
  let frame = 0;
  let lastTitleUpdate = Date.now();

  const handleExit = () => {
    if (running) {
      running = false;
    }
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  try {
    while (running) {
      const events = galfus.platformPumpEvents();

      for (const ev of events) {
        if ('window' in ev) {
          const winEv = ev.window;
          if ('closeRequested' in winEv) {
            console.log('Window close requested.');
            running = false;
          } else if ('resized' in winEv) {
            console.log(
              `Window resized: ${winEv.resized.width}x${winEv.resized.height} (scale: ${winEv.resized.scaleFactor})`
            );
          } else if ('focusChanged' in winEv) {
            console.log(`Window focus: ${winEv.focusChanged.focused ? 'Focused' : 'Blurred'}`);
          }
        } else if ('pointer' in ev) {
          const ptrEv = ev.pointer;
          if ('move' in ptrEv) {
            pointerPos = ptrEv.move.position;
          } else if ('button' in ptrEv) {
            const btn = ptrEv.button;
            if (btn.state === 'pressed') {
              if (btn.button === 'primary') {
                console.log(
                  `[Mouse] Left click at (${btn.position[0].toFixed(1)}, ${btn.position[1].toFixed(1)})`
                );
              } else if (btn.button === 'secondary') {
                cursorIdx = (cursorIdx + 1) % CURSOR_ICONS.length;
                const nextIcon = CURSOR_ICONS[cursorIdx] ?? CURSOR_ICONS[0]!;
                galfus.windowSetCursorIcon(windowId, nextIcon.id);
                console.log(`[Mouse] Right click: Cursor icon set to '${nextIcon.name}'`);
              } else if (btn.button === 'auxiliary') {
                cursorGrabbed = !cursorGrabbed;
                galfus.windowSetCursorGrab(windowId, cursorGrabbed ? 2 : 0);
                console.log(
                  `[Mouse] Middle click: Cursor grab ${cursorGrabbed ? 'LOCKED' : 'UNLOCKED'}`
                );
              }
            }
          } else if ('scroll' in ptrEv) {
            const delta = ptrEv.scroll.delta;
            if ('lines' in delta) {
              console.log(`[Scroll] Lines: dx=${delta.lines[0]}, dy=${delta.lines[1]}`);
            } else if ('pixels' in delta) {
              console.log(`[Scroll] Pixels: dx=${delta.pixels[0]}, dy=${delta.pixels[1]}`);
            }
          }
        } else if ('keyboard' in ev) {
          const kbEv = ev.keyboard;
          if ('input' in kbEv) {
            const input = kbEv.input;
            if (input.state === 'pressed') {
              const key = extractKey(input);

              if (key === 'escape') {
                console.log('Escape pressed: Exiting demo.');
                running = false;
              } else if (key >= '1' && key <= '4') {
                const idx = parseInt(key, 10) - 1;
                cursorIdx = idx;
                const nextIcon = CURSOR_ICONS[cursorIdx] ?? CURSOR_ICONS[0]!;
                galfus.windowSetCursorIcon(windowId, nextIcon.id);
                console.log(`[Key] Cursor icon set to '${nextIcon.name}'`);
              }
            }
          }
        } else if ('gamepad' in ev) {
          const gpEv = ev.gamepad;
          if ('button' in gpEv) {
            console.log(
              `[Gamepad #${gpEv.button.gamepadId}] Button: ${gpEv.button.button} (${gpEv.button.state})`
            );
          }
        }
      }

      frame++;
      const now = Date.now();
      if (now - lastTitleUpdate >= 250) {
        const title = `Galfus TS Demo 0 | Pos: (${pointerPos[0].toFixed(0)}, ${pointerPos[1].toFixed(0)}) | Frame: ${frame}`;
        galfus.windowSetTitle(windowId, title);
        lastTitleUpdate = now;
      }

      await Bun.sleep(16);
    }
  } finally {
    process.removeListener('SIGINT', handleExit);
    process.removeListener('SIGTERM', handleExit);
    console.log('\n==> Shutting down platform context...');
    galfus.platformShutdown();
    console.log('✔ Platform shutdown clean. Goodbye!\n');
  }
}
