import type { SpriteAnimation, SpriteUvRect } from '@galfus/engine';
import type { UiPanelComponent, UiSpritePanelComponent } from '../components/component';
import { sameUiValue } from '../style/resolve';
import type { UiIconAtlas } from './atlas';

/** @internal Decorative sprite that forwards panel input to its owning control. */
export class UiIcon {
  readonly panel: UiSpritePanelComponent;
  private readonly animation: SpriteAnimation;
  private uv!: SpriteUvRect;

  constructor(
    parent: UiPanelComponent,
    name: string,
    state: string,
    customAtlas?: UiIconAtlas,
    requiredStates: readonly string[] = []
  ) {
    const root = parent.componentRoot;
    const atlas = customAtlas ?? root.getIcons(name);
    // Validate before adding any nodes to the tree.
    atlas.createAnimation(name, state, () => {});
    for (const required of requiredStates) atlas.createAnimation(name, required, () => {});
    this.panel = parent.addSpritePanel(
      { textureId: atlas.sheet.textureId, backgroundColor: [0, 0, 0, 0] },
      { width: { type: 'exact', value: 20 }, height: { type: 'exact', value: 20 }, flexShrink: 0 }
    );
    try {
      this.animation = atlas.createAnimation(name, state, (uv) => {
        this.uv = uv;
        this.panel.setSpriteUvRect(uv);
      });
      root.interactionFor(parent.id).attachTarget(this.panel.id);
      const stopTick = root.onTick((dt) => {
        if (!this.panel.isAttached || root.syncState !== 'synced' || !this.animation.isPlaying)
          return;
        this.animation.update(dt);
        if ((root.syncState as string) === 'pending') root.flush();
      });
      const stopSync = root.onSyncState((status) => {
        if (status === 'disposed' || (status === 'synced' && !this.panel.isAttached)) {
          stopTick();
          stopSync();
        } else if (status === 'synced' && this.panel.isAttached) {
          // Restoring a staged tree must not leave a player's frame out of sync.
          if (!sameUiValue(root.nodeSnapshot(this.panel.id).kind.uvRect, this.uv)) {
            this.panel.setSpriteUvRect(this.uv);
            root.flush();
          }
        }
      });
    } catch (error) {
      this.panel.remove();
      throw error;
    }
  }

  setState(state: string): void {
    const root = this.panel.componentRoot;
    const synced = root.syncState === 'synced';
    this.animation.setState(state);
    if (synced && (root.syncState as string) === 'pending') root.flush();
  }
}
