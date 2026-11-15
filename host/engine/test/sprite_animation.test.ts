import { describe, expect, it } from 'bun:test';
import { SpriteAnimation, SpriteSheet, type SpriteUvRect } from '../src/realm2d';

const sheet = new SpriteSheet({
  textureId: 1,
  textureSize: [8, 1],
  grid: { columns: 8, rows: 1, frameSize: [1, 1], names: { off: 0, on: 7 } }
});
const uv = (index: number) => sheet.uvRect(index);

function create() {
  const updates: SpriteUvRect[] = [];
  const animation = new SpriteAnimation({
    sheet,
    setUvRect: (rect) => updates.push(rect),
    states: { off: 'off', on: 'on', disabled: 6 },
    initialState: 'off',
    transitions: {
      'off|on': { frames: [1, 2, 3], frameDuration: 0.25 },
      'on|off': { frames: [4, 5], frameDuration: 0.25 }
    }
  });
  return { animation, updates };
}

describe('SpriteAnimation', () => {
  it('plays a named transition and holds every frame for its full duration', () => {
    const { animation, updates } = create();
    expect(updates).toEqual([uv(0)]);
    animation.setState('on');
    expect(animation.state).toBe('on');
    animation.update(0.2);
    expect(updates.at(-1)).toEqual(uv(1));
    animation.update(0.05);
    expect(updates.at(-1)).toEqual(uv(2));
    animation.update(0.25);
    expect(updates.at(-1)).toEqual(uv(3));
    animation.update(0.25);
    expect(updates.at(-1)).toEqual(uv(7));
    expect(animation.isPlaying).toBe(false);
    expect(updates).toHaveLength(5);
  });

  it('interrupts from the logical destination, or switches immediately without a transition', () => {
    const { animation, updates } = create();
    animation.setState('on');
    animation.setState('on');
    expect(updates).toHaveLength(2);
    animation.setState('off');
    expect(updates.at(-1)).toEqual(uv(4));
    animation.update(1);
    expect(updates.at(-1)).toEqual(uv(0));
    animation.setState('disabled');
    expect(updates.at(-1)).toEqual(uv(6));
    expect(animation.isPlaying).toBe(false);
  });

  it('supports loops, large deltas, pause, resume, stop, and standalone clips', () => {
    const { animation, updates } = create();
    animation.play({ frames: [1, 2, 3], frameDuration: 0.25 }, { loop: true });
    animation.update(2.75);
    expect(updates.at(-1)).toEqual(uv(3));
    animation.pause();
    animation.update(10);
    expect(animation.isPaused).toBe(true);
    expect(updates.at(-1)).toEqual(uv(3));
    animation.resume();
    animation.update(0.25);
    expect(updates.at(-1)).toEqual(uv(1));
    animation.stop();
    expect(updates.at(-1)).toEqual(uv(0));
    animation.play({ frames: [1], frameDuration: 0.25 });
    animation.update(0.25);
    expect(updates.at(-1)).toEqual(uv(0));
    expect(animation.isPlaying).toBe(false);
  });

  it('validates definitions and rejects invalid changes without interrupting playback', () => {
    const { animation, updates } = create();
    animation.setState('on');
    expect(() => animation.setState('unknown')).toThrow();
    expect(() => animation.play({ frames: [99], frameDuration: 1 })).toThrow();
    expect(() => animation.play({ frames: [], frameDuration: 1 })).toThrow();
    expect(() => animation.play({ frames: [0], frameDuration: 0 })).toThrow();
    expect(() => animation.update(-1)).toThrow();
    expect(() => animation.update(NaN)).toThrow();
    animation.update(0.25);
    expect(updates.at(-1)).toEqual(uv(2));
    expect(
      () =>
        new SpriteAnimation({
          sheet,
          setUvRect: () => {},
          states: { 'a|b': 0 },
          initialState: 'a|b'
        })
    ).toThrow();
    expect(
      () =>
        new SpriteAnimation({
          sheet,
          setUvRect: () => {},
          states: { a: 0 },
          initialState: 'a',
          transitions: { 'a|missing': { frames: [1], frameDuration: 1 } }
        })
    ).toThrow();
  });
});
