/**
 * Multiverse coordinator managing targets, invocations, and realm orchestration.
 */
import type {
  AntiAliasingMode,
  GalfusEngine,
  InvocationDesc,
  InvocationFilter,
  MultiverseSchedule,
  TargetDesc,
  TargetTextureBinding,
  ViewportRect
} from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';
import type { SystemContext } from '../ecs/system';
import type { RealmConnector, RealmId } from './realm';

export type TargetId = number;
export type InvocationId = number;

export class MultiverseCoordinator {
  private _engine: GalfusEngine | null = null;
  private readonly _realms = new Map<RealmId, RealmConnector>();
  private readonly _targets = new Set<TargetId>();
  private readonly _invocations = new Set<InvocationId>();

  get engine(): GalfusEngine | null {
    return this._engine;
  }

  /**
   * Binds the coordinator to the active native or WASM GalfusEngine driver.
   */
  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
    for (const realm of this._realms.values()) {
      realm.bindEngine(engine);
    }
  }

  /**
   * Registers a target (Window or Texture) in the multiverse.
   */
  createTarget(targetId: TargetId, desc: TargetDesc): void {
    assertValidLogicalId(targetId, 'TargetId');
    if (this._targets.has(targetId)) {
      throw new Error(`Multiverse target ${targetId} is already created.`);
    }

    if (this._engine) {
      this._engine.multiverseCreateTarget(targetId, desc);
    }
    this._targets.add(targetId);
  }

  /**
   * Destroys a render target.
   */
  destroyTarget(targetId: TargetId): void {
    if (!this._targets.has(targetId)) return;
    if (this._engine) {
      this._engine.multiverseDestroyTarget(targetId);
    }
    this._targets.delete(targetId);
  }

  /**
   * Registers a specialized realm connector (e.g. Realm2D or Realm3D).
   */
  registerRealm(realm: RealmConnector): void {
    assertValidLogicalId(realm.realmId, 'RealmId');
    if (this._realms.has(realm.realmId)) {
      throw new Error(`Realm ${realm.realmId} is already registered in Multiverse.`);
    }

    this._realms.set(realm.realmId, realm);
    if (this._engine) {
      realm.bindEngine(this._engine);
    }
  }

  /**
   * Unregisters and disposes a realm connector.
   */
  unregisterRealm(realmId: RealmId): void {
    const realm = this._realms.get(realmId);
    if (!realm) return;

    realm.dispose();
    if (this._engine) {
      this._engine.multiverseUnregisterRealm(realmId);
    }
    this._realms.delete(realmId);
  }

  /**
   * Retrieves a registered realm connector by ID.
   */
  getRealm<T extends RealmConnector = RealmConnector>(realmId: RealmId): T | undefined {
    return this._realms.get(realmId) as T | undefined;
  }

  /**
   * Creates an invocation linking a realm to a target with viewport parameters.
   */
  createInvocation(invocationId: InvocationId, desc: InvocationDesc): void {
    assertValidLogicalId(invocationId, 'InvocationId');
    if (this._invocations.has(invocationId)) {
      throw new Error(`Invocation ${invocationId} is already created.`);
    }

    if (this._engine) {
      this._engine.multiverseCreateInvocation(invocationId, desc);
    }
    this._invocations.add(invocationId);
  }

  /**
   * Destroys an existing invocation.
   */
  destroyInvocation(invocationId: InvocationId): void {
    if (!this._invocations.has(invocationId)) return;
    if (this._engine) {
      this._engine.multiverseDestroyInvocation(invocationId);
    }
    this._invocations.delete(invocationId);
  }

  /**
   * Enables or disables an invocation.
   */
  setInvocationEnabled(invocationId: InvocationId, enabled: boolean): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationEnabled(invocationId, enabled);
    }
  }

  /**
   * Updates the responsive viewport rectangle of an invocation.
   */
  setInvocationViewport(invocationId: InvocationId, viewport: ViewportRect): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationViewport(invocationId, viewport);
    }
  }

  /**
   * Updates the post-process filter chain for an invocation.
   */
  setInvocationFilters(invocationId: InvocationId, filters: InvocationFilter[]): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationFilters(invocationId, filters);
    }
  }

  /**
   * Updates the clear color of an invocation.
   */
  setInvocationClearColor(
    invocationId: InvocationId,
    r: number,
    g: number,
    b: number,
    a: number,
    hasClear = true
  ): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationClearColor(invocationId, r, g, b, a, hasClear);
    }
  }

  /**
   * Updates the camera slot bound to an existing invocation.
   */
  setInvocationCameraSlot(invocationId: InvocationId, cameraSlot: number, hasSlot = true): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationCameraSlot(invocationId, cameraSlot, hasSlot);
    }
  }

  /**
   * Binds an output target texture to a realm input slot (e.g. portal or render-to-texture).
   */
  bindTargetTexture(binding: TargetTextureBinding): void {
    if (this._engine) {
      this._engine.multiverseBindTargetTexture(binding);
    }
  }

  /**
   * Unbinds a target texture from a realm input slot.
   */
  unbindTargetTexture(realmId: RealmId, slot: string): void {
    if (this._engine) {
      this._engine.multiverseUnbindTargetTexture(realmId, slot);
    }
  }

  /**
   * Registers a custom WGSL post-processing shader.
   */
  registerShader(shaderId: number, source: string): void {
    assertValidLogicalId(shaderId, 'ShaderId');
    if (this._engine) {
      this._engine.multiverseRegisterShader(shaderId, source);
    }
  }

  /**
   * Updates the window size for a window Target.
   */
  updateWindowSize(windowId: number, width: number, height: number): void {
    if (this._engine) {
      this._engine.multiverseUpdateWindowSize(windowId, width, height);
    }
  }

  /**
   * Sets global Anti-Aliasing mode for the Multiverse.
   */
  setAntiAliasing(mode: AntiAliasingMode): void {
    if (this._engine) {
      this._engine.multiverseSetAntiAliasing(mode);
    }
  }

  /**
   * Gets current global Anti-Aliasing mode.
   */
  getAntiAliasing(): string {
    return this._engine?.multiverseGetAntiAliasing() ?? 'none';
  }

  /**
   * Synchronizes all registered realms before rendering.
   */
  syncAllRealms(context: SystemContext): void {
    for (const realm of this._realms.values()) {
      realm.sync(context);
    }
  }

  /**
   * Resolves the multiverse frame schedule.
   */
  resolve(): MultiverseSchedule | undefined {
    return this._engine?.multiverseResolve();
  }

  /**
   * Dispatches the resolved schedule to the GPU.
   */
  dispatch(frameId: number, dtSeconds: number): void {
    if (this._engine) {
      this._engine.multiverseDispatch(frameId, dtSeconds);
    }
  }

  /**
   * Shuts down all invocations, targets, and realms.
   */
  dispose(): void {
    for (const invId of Array.from(this._invocations)) {
      this.destroyInvocation(invId);
    }
    for (const realmId of Array.from(this._realms.keys())) {
      this.unregisterRealm(realmId);
    }
    for (const targetId of Array.from(this._targets)) {
      this.destroyTarget(targetId);
    }
    this._engine = null;
  }
}
