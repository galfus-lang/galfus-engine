import {
  SpriteAnimation,
  type SpriteAnimationClip,
  type SpriteFrameKey,
  SpriteSheet,
  type SpriteUvRect
} from '@galfus/engine';

export interface UiIconDefinition {
  readonly states: Readonly<Record<string, SpriteFrameKey>>;
  readonly transitions?: Readonly<Record<string, SpriteAnimationClip>>;
}

export type UiIconDefinitions = Readonly<Record<string, UiIconDefinition>>;

/** Shared atlas and semantic icon definitions. The sheet's texture is borrowed. */
export class UiIconAtlas {
  private readonly icons = new Map<string, UiIconDefinition>();

  constructor(
    readonly sheet: SpriteSheet,
    definitions: UiIconDefinitions
  ) {
    for (const [name, definition] of Object.entries(definitions)) {
      if (!name.trim()) throw new TypeError('Icon names must not be empty.');
      const states = { ...definition.states };
      const initialState = Object.keys(states)[0];
      if (initialState === undefined) throw new RangeError(`Icon ${name} requires a state.`);
      const transitions = Object.fromEntries(
        Object.entries(definition.transitions ?? {}).map(([key, clip]) => [
          key,
          { frames: [...clip.frames], frameDuration: clip.frameDuration }
        ])
      );
      // Validate every frame, state and transition before exposing the atlas.
      new SpriteAnimation({ sheet, states, initialState, transitions, setUvRect: () => {} });
      this.icons.set(name, { states, transitions });
    }
    if (this.icons.size === 0) throw new RangeError('An icon atlas requires at least one icon.');
  }

  has(name: string): boolean {
    return this.icons.has(name);
  }

  /** Each consumer gets its own playback state while sharing the texture and definitions. */
  createAnimation(
    name: string,
    initialState: string,
    setUvRect: (uv: SpriteUvRect) => void
  ): SpriteAnimation {
    const icon = this.icons.get(name);
    if (!icon) throw new RangeError(`Unknown UI icon: ${name}`);
    return new SpriteAnimation({ sheet: this.sheet, ...icon, initialState, setUvRect });
  }
}
