import { type SpriteFrameKey, SpriteSheet, type SpriteUvRect } from './sprite-sheet';

/** Frames have equal duration in seconds. The final frame is held for its full duration. */
export interface SpriteAnimationClip {
  readonly frames: readonly SpriteFrameKey[];
  readonly frameDuration: number;
}

export interface SpriteAnimationOptions {
  readonly sheet: SpriteSheet;
  /** Receives normalized UV coordinates; bind this to a sprite or panel. */
  readonly setUvRect: (uvRect: SpriteUvRect) => void;
  readonly states: Readonly<Record<string, SpriteFrameKey>>;
  readonly initialState: string;
  /** Transition keys have the form `source|destination`. */
  readonly transitions?: Readonly<Record<string, SpriteAnimationClip>>;
}

interface PreparedClip {
  readonly frames: readonly SpriteUvRect[];
  readonly frameDuration: number;
  readonly duration: number;
}

interface Playback {
  readonly clip: PreparedClip;
  readonly loop: boolean;
  elapsed: number;
  index: number;
}

/** Host-side frame player. Call update with elapsed seconds from the application's tick. */
export class SpriteAnimation {
  private readonly sheet: SpriteSheet;
  private readonly setUvRect: (uvRect: SpriteUvRect) => void;
  private readonly states = new Map<string, SpriteUvRect>();
  private readonly transitions = new Map<string, PreparedClip>();
  private playback?: Playback;
  private paused = false;
  private currentState: string;

  constructor(options: SpriteAnimationOptions) {
    this.sheet = options.sheet;
    this.setUvRect = options.setUvRect;
    for (const [name, frame] of Object.entries(options.states)) {
      if (!name.trim() || name.includes('|'))
        throw new TypeError('State names must be nonempty and cannot contain |.');
      this.states.set(name, this.sheet.uvRect(frame));
    }
    if (!this.states.has(options.initialState)) throw new RangeError('Unknown initial state.');
    for (const [name, clip] of Object.entries(options.transitions ?? {})) {
      const parts = name.split('|');
      if (parts.length !== 2 || !this.states.has(parts[0]!) || !this.states.has(parts[1]!))
        throw new RangeError(`Invalid transition: ${name}`);
      this.transitions.set(name, this.prepare(clip));
    }
    this.currentState = options.initialState;
    this.apply(this.states.get(this.currentState)!);
  }

  /** The destination state, including while a transition is playing. */
  get state(): string {
    return this.currentState;
  }

  get isPlaying(): boolean {
    return this.playback !== undefined && !this.paused;
  }

  get isPaused(): boolean {
    return this.playback !== undefined && this.paused;
  }

  /** Interrupts the current playback. Missing transitions switch immediately. */
  setState(state: string): void {
    const destination = this.states.get(state);
    if (!destination) throw new RangeError(`Unknown sprite state: ${state}`);
    if (state === this.currentState) return;
    const clip = this.transitions.get(`${this.currentState}|${state}`);
    this.apply(clip ? clip.frames[0]! : destination);
    this.currentState = state;
    this.paused = false;
    this.playback = clip ? { clip, loop: false, elapsed: 0, index: 0 } : undefined;
  }

  /** Plays a standalone clip; a non-looping clip returns to the current state's frame. */
  play(clip: SpriteAnimationClip, options: { readonly loop?: boolean } = {}): void {
    const prepared = this.prepare(clip);
    this.apply(prepared.frames[0]!);
    this.playback = { clip: prepared, loop: options.loop ?? false, elapsed: 0, index: 0 };
    this.paused = false;
  }

  pause(): void {
    if (this.playback) this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Stops playback and restores the current state's frame. */
  stop(): void {
    if (!this.playback) return;
    this.apply(this.states.get(this.currentState)!);
    this.playback = undefined;
    this.paused = false;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new RangeError('Delta time must be finite and nonnegative.');
    const playback = this.playback;
    if (!playback || this.paused || deltaSeconds === 0) return;
    const { clip } = playback;
    // Reduce the delta first to avoid overflowing when adding very large finite values.
    const remainder = deltaSeconds % clip.duration;
    const untilLoop = clip.duration - playback.elapsed;
    const elapsed = playback.loop
      ? remainder >= untilLoop
        ? remainder - untilLoop
        : playback.elapsed + remainder
      : Math.min(playback.elapsed + deltaSeconds, clip.duration);
    if (!playback.loop && elapsed >= clip.duration) {
      this.apply(this.states.get(this.currentState)!);
      this.playback = undefined;
      return;
    }
    const index = Math.min(Math.floor(elapsed / clip.frameDuration), clip.frames.length - 1);
    if (index !== playback.index) this.apply(clip.frames[index]!);
    playback.elapsed = elapsed;
    playback.index = index;
  }

  private prepare(clip: SpriteAnimationClip): PreparedClip {
    if (!Array.isArray(clip.frames) || clip.frames.length === 0)
      throw new RangeError('A sprite animation requires at least one frame.');
    if (!Number.isFinite(clip.frameDuration) || clip.frameDuration <= 0)
      throw new RangeError('Frame duration must be finite and positive.');
    const duration = clip.frameDuration * clip.frames.length;
    if (!Number.isFinite(duration)) throw new RangeError('Animation duration must be finite.');
    return {
      frames: clip.frames.map((frame) => this.sheet.uvRect(frame)),
      frameDuration: clip.frameDuration,
      duration
    };
  }

  private apply(uvRect: SpriteUvRect): void {
    this.setUvRect([...uvRect]);
  }
}
