import { Collider2DComponent, getColliderEntries } from '../collision/components';
import type { MultiverseCoordinator } from '../multiverse/coordinator';
import type { Model2DComponent, Model2DUIComponent } from '../realm2d/components';
import { Realm2D } from '../realm2d/realm';

export interface UiSurfaceOptions {
  readonly realmId: number;
  readonly uiId: number;
  readonly elementId: number;
  readonly slot: string;
  /** Required when the ModelUI has more than one collider. */
  readonly colliderId?: number;
}

/** @internal */
export function connectUiSurface(
  multiverse: MultiverseCoordinator,
  surfaces: Map<string, () => void>,
  options: UiSurfaceOptions
): () => void {
  const realm = multiverse.getRealm(options.realmId);
  if (!(realm instanceof Realm2D) || realm.isDisposed)
    throw new Error('UI surface requires a live Realm2D.');
  const entityId = realm.world
    .query('Model2DUI')
    .find(
      (id) => realm.world.getComponent<Model2DUIComponent>(id, 'Model2DUI')?.uiId === options.uiId
    );
  if (entityId === undefined) throw new Error('UI surface requires an existing ModelUI.');
  const model = realm.world.getComponent<Model2DComponent>(entityId, 'Model2D');
  const collider = realm.world.getComponent<Collider2DComponent>(entityId, 'Collider2D');
  const entries = collider ? [...getColliderEntries(collider)] : [];
  const colliderId =
    options.colliderId ?? (entries.length === 1 ? entries[0]!.colliderId : undefined);
  if (
    !model ||
    colliderId === undefined ||
    !entries.some((entry) => entry.colliderId === colliderId)
  )
    throw new Error(
      'UI surface requires an existing collider on its ModelUI; specify colliderId when ambiguous.'
    );
  const key = `ui:${options.realmId}:${options.uiId}:${options.elementId}`;
  if (surfaces.has(key)) throw new Error('SpritePanel already has an interaction surface.');
  const engine = multiverse.engine;
  if (!engine) throw new Error('UI surface requires a bound engine.');
  realm.flush();
  const surface = {
    realmId: options.realmId,
    entityId,
    elementId: options.elementId,
    slot: options.slot
  };
  multiverse.connectPresentationSurface(surface);
  try {
    engine.multiverseConnectUiInteractionSurface({
      realmId: options.realmId,
      modelId: model.modelId,
      colliderId,
      elementId: options.elementId,
      slot: options.slot
    });
  } catch (error) {
    multiverse.disconnectPresentationSurface(surface);
    throw error;
  }
  let connected = true;
  const disconnect = () => {
    if (!connected) return;
    connected = false;
    surfaces.delete(key);
    multiverse.disconnectPresentationSurface(surface);
    if (multiverse.getRealm(options.realmId) === realm && !realm.isDisposed)
      engine.multiverseDisconnectUiInteractionSurface(
        options.realmId,
        model.modelId,
        options.elementId
      );
  };
  surfaces.set(key, disconnect);
  return disconnect;
}
