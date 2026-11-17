import type {
  Collider2DComponent,
  MultiverseRuntime,
  Realm2D,
  Transform2DProps,
  WindowId
} from '@galfus/engine';
import type { UiLayoutStyleDesc, UiNodeKindDesc } from '@galfus/transport-types';
import type { UiThemeOverrides } from '../style/theme';
import type { StyledNode } from '../style/reconcile';

export type ComponentSyncState = 'pending' | 'synced' | 'failed' | 'disposed';

export interface ComponentRootOptions {
  readonly width: number;
  readonly height: number;
  /** Closing this window disposes the root. Omit for a realm shared by multiple targets. */
  readonly windowId?: number;
  readonly transform?: Transform2DProps;
  readonly panel?: Omit<UiNodeKindDesc, 'type'>;
  readonly layout?: Omit<UiLayoutStyleDesc, 'width' | 'height'>;
  readonly theme?: UiThemeOverrides;
}

export type NodeRecord = StyledNode;

export function validateComponentRootOptions(
  runtime: MultiverseRuntime,
  realm: Realm2D,
  options: ComponentRootOptions
): void {
  if (realm.isDisposed) throw new Error('Cannot create UI in a disposed realm.');
  if (runtime.multiverse.getRealm(realm.realmId) !== realm)
    throw new Error('UI root requires a realm registered with this runtime.');
  if (
    !Number.isFinite(options.width) ||
    options.width <= 0 ||
    !Number.isFinite(options.height) ||
    options.height <= 0
  )
    throw new RangeError('UI dimensions must be positive and finite.');
  if (
    options.windowId !== undefined &&
    (!Number.isSafeInteger(options.windowId) || options.windowId < 0)
  )
    throw new RangeError('Invalid window ID.');
  if (
    options.windowId !== undefined &&
    !runtime.platform.window.isOpen(options.windowId as WindowId)
  )
    throw new Error('UI root requires an open window in this runtime.');
}

export function syncRootCollider(
  realm: Realm2D,
  entityId: number,
  colliderId: number,
  rootNode: NodeRecord,
  colliderSize: [number, number],
  colliderActive: boolean
): { size: [number, number]; active: boolean } {
  const layout = rootNode.resolved?.layout;
  if (layout?.width?.type === 'exact' && layout.height?.type === 'exact') {
    const collider = realm.world.getComponent<Collider2DComponent>(entityId, 'Collider2D');
    const validSize = layout.width.value > 0 && layout.height.value > 0;
    const active = rootNode.visible && validSize;
    if (
      collider &&
      (active !== colliderActive ||
        (validSize &&
          (layout.width.value !== colliderSize[0] || layout.height.value !== colliderSize[1])))
    ) {
      const size: [number, number] = validSize
        ? [layout.width.value, layout.height.value]
        : colliderSize;
      collider.set(
        colliderId,
        { type: 'rectangle', halfExtents: [size[0] / 2, size[1] / 2] },
        { active }
      );
      return { size, active };
    }
  }
  return { size: colliderSize, active: colliderActive };
}
