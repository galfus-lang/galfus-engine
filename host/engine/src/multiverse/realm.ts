/**
 * Realm connector contract for domain-specific realms (2D, 3D, Custom).
 */
import type { GalfusEngine } from '@galfus/transport-types';
import type { SystemContext } from '../ecs/system';
import type { RealmId } from '../types';

export { type RealmId };
export type RealmKind = '2d' | '3d' | 'color' | 'custom';

/**
 * Base contract implemented by all realm modules to synchronize their ECS state
 * with the underlying Multiverse and GalfusEngine core.
 */
export interface RealmConnector {
  readonly realmId: RealmId | number;
  readonly realmKind: RealmKind;

  /**
   * Binds this realm to the active GalfusEngine ABI driver and initializes native realm resources.
   */
  bindEngine(engine: GalfusEngine): void;

  /**
   * Synchronizes ECS entity data (transforms, components, lights, cameras) to the core.
   */
  sync(context: SystemContext): void;

  /**
   * Shuts down and cleans up native resources allocated for this realm in the core.
   */
  dispose(): void;
}
