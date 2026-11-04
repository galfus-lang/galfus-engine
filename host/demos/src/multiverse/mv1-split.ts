/**
 * Multiverse Demo MV-1: Split-Screen Viewports & Post-Processing Filters
 *
 * Demonstrates split-screen Multiverse invocations rendering a ColorRealm with:
 * - Left Viewport (0..50vw): Raw output
 * - Right Viewport (50..100vw): Built-in Sepia / Custom WGSL Invert shader filter
 * - Animated clear color transitions via the Host Animation API
 */
import { isKey } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, type HostDemoOptions } from '../common/options';

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

export async function runDemoMv1(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Engine - Demo MV1: Split-Screen & Sepia Post-Processing',
    options,
    [1024, 768]
  );

  try {
    let paletteIdx = 0;
    const initialColor = COLOR_PALETTE[0]![1];
    const colorRealmId = runtime.multiverse.registerColorRealm(initialColor);
    const invertShaderId = runtime.multiverse.registerShader(INVERT_WGSL);

    const leftInvocation = runtime.multiverse.createInvocation({
      realmId: colorRealmId,
      targetId,
      cameraSlot: 1,
      viewport: { anchorX: 'left', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      filters: [],
      zIndex: 0,
      enabled: true,
      clearColor: initialColor
    });

    const rightInvocation = runtime.multiverse.createInvocation({
      realmId: colorRealmId,
      targetId,
      cameraSlot: 2,
      viewport: { anchorX: 'right', anchorY: 'top', width: { vw: 50 }, height: { vh: 100 } },
      filters: ['sepia'],
      zIndex: 0,
      enabled: true,
      clearColor: initialColor
    });

    let filterMode: 'sepia' | 'invert' | 'none' = 'sepia';
    const setColor = (idx: number) => {
      paletteIdx = idx % COLOR_PALETTE.length;
      const [name, color] = COLOR_PALETTE[paletteIdx]!;
      runtime.multiverse.setInvocationClearColor(leftInvocation, color);
      runtime.multiverse.setInvocationClearColor(rightInvocation, color);
      console.log(`[mv1] Palette switched to ${name}`);
    };

    runtime.on('pointer', (ev) => {
      if (ev.type === 'button' && ev.state === 'pressed' && ev.button === 'primary') {
        setColor(paletteIdx + 1);
      }
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type !== 'input' || ev.state !== 'pressed') return;
      if (isKey(ev, 'space', ' ')) {
        setColor(paletteIdx + 1);
      } else if (isKey(ev, '1', '2', '3', '4', '5')) {
        setColor(Number(ev.logicalKey) - 1);
      } else if (isKey(ev, 'f')) {
        if (filterMode === 'sepia') {
          filterMode = 'invert';
          runtime.multiverse.setInvocationFilters(rightInvocation, [
            { custom: { shaderId: invertShaderId } }
          ]);
        } else if (filterMode === 'invert') {
          filterMode = 'none';
          runtime.multiverse.setInvocationFilters(rightInvocation, []);
        } else {
          filterMode = 'sepia';
          runtime.multiverse.setInvocationFilters(rightInvocation, ['sepia']);
        }
        console.log(`[mv1] Right viewport filter: ${filterMode}`);
      } else if (isKey(ev, 'a')) {
        const targetColor: [number, number, number, number] = [0.2, 0.85, 0.95, 1.0];
        const cfg = {
          duration: 2.5,
          easing: 'easeInOutSine' as const,
          loopMode: 'pingPong' as const
        };
        runtime.animation.createTransition({ type: 'vec4', value: [0.95, 0.25, 0.25, 1.0] }, cfg, {
          kind: 'invocationClearColor',
          invocationId: leftInvocation
        });
        const t2 = runtime.animation.createTransition(
          { type: 'vec4', value: [0.95, 0.25, 0.25, 1.0] },
          cfg,
          { kind: 'invocationClearColor', invocationId: rightInvocation }
        );
        runtime.animation.transitionTo(t2, { type: 'vec4', value: targetColor }, cfg);
      }
    });

    console.log('[mv1] Ready. Space/1-5: cycle color | F: cycle filter | A: animate | Esc: exit.');
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}
