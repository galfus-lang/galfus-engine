/**
 * Built-in ColorRealm connector providing solid color clear/tinting.
 */

import type { GalfusEngine } from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';
import type { RealmConnector, RealmId, RealmKind } from './realm';

export class ColorRealm implements RealmConnector {
  readonly realmKind: RealmKind = 'color';
  readonly realmId: RealmId;
  color: [number, number, number, number];
  private _engine: GalfusEngine | null = null;

  constructor(realmId: RealmId | number, color: [number, number, number, number] = [0, 0, 0, 1]) {
    this.realmId = realmId as RealmId;
    assertValidLogicalId(this.realmId, 'RealmId');
    this.color = [...color];
  }

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
    engine.multiverseRegisterColorRealm(
      this.realmId,
      this.color[0],
      this.color[1],
      this.color[2],
      this.color[3]
    );
  }

  sync(): void {}

  dispose(): void {
    this._engine = null;
  }
}
