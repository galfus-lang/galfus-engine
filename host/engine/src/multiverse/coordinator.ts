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
import { IdAllocator, type InvocationId, type RealmId, type TargetId } from '../types';
import type { RealmConnector } from './realm';

export { type InvocationId, type TargetId } from '../types';

export class MultiverseCoordinator {
  private _engine: GalfusEngine | null = null;
  private readonly _targetIdAllocator = new IdAllocator<TargetId>(1);
  private readonly _invocationIdAllocator = new IdAllocator<InvocationId>(1);
  private readonly _realms = new Map<RealmId, RealmConnector>();
  private readonly _targets = new Map<TargetId, TargetDesc>();
  private readonly _invocations = new Set<InvocationId>();

  get engine(): GalfusEngine | null {
    return this._engine;
  }

  /**
   * Binds the coordinator to the active native or WASM GalfusEngine driver.
   */
  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
    for (const [targetId, desc] of this._targets) {
      if (desc.kind.type === 'window') {
        engine.multiverseAttachWindow?.(desc.kind.windowId);
      }
      engine.multiverseCreateTarget(targetId, desc);
    }
    for (const realm of this._realms.values()) {
      realm.bindEngine(engine);
    }
  }

  /**
   * Registers a target (Window or Texture) in the multiverse, returning its TargetId.
   */
  createTarget(desc: TargetDesc): TargetId;
  createTarget(targetId: TargetId | number, desc: TargetDesc): TargetId;
  createTarget(arg1: TargetId | number | TargetDesc, arg2?: TargetDesc): TargetId {
    let targetId: TargetId;
    let desc: TargetDesc;

    if (typeof arg1 === 'number') {
      targetId = arg1 as TargetId;
      desc = arg2!;
    } else {
      targetId = this._targetIdAllocator.allocate('TargetId');
      desc = arg1;
    }

    assertValidLogicalId(targetId, 'TargetId');
    if (this._targets.has(targetId)) {
      throw new Error(`Multiverse target ${targetId} is already created.`);
    }

    if (this._engine) {
      if (desc.kind.type === 'window') {
        this._engine.multiverseAttachWindow?.(desc.kind.windowId);
      }
      this._engine.multiverseCreateTarget(targetId, desc);
    }
    this._targets.set(targetId, desc);
    return targetId;
  }

  /**
   * Destroys a render target.
   */
  destroyTarget(targetId: TargetId | number): void {
    const id = targetId as TargetId;
    if (!this._targets.has(id)) return;
    if (this._engine) {
      this._engine.multiverseDestroyTarget(id);
    }
    this._targets.delete(id);
  }

  /**
   * Registers a specialized realm connector (e.g. Realm2D or Realm3D).
   */
  registerRealm(realm: RealmConnector): void {
    const realmId = realm.realmId as RealmId;
    assertValidLogicalId(realmId, 'RealmId');
    if (this._realms.has(realmId)) {
      throw new Error(`Realm ${realmId} is already registered in Multiverse.`);
    }

    this._realms.set(realmId, realm);
    if (this._engine) {
      realm.bindEngine(this._engine);
    }
  }

  /**
   * Unregisters and disposes a realm connector.
   */
  unregisterRealm(realmId: RealmId | number): void {
    const id = realmId as RealmId;
    const realm = this._realms.get(id);
    if (!realm) return;

    realm.dispose();
    if (this._engine) {
      this._engine.multiverseUnregisterRealm(id);
    }
    this._realms.delete(id);
  }

  /**
   * Retrieves a registered realm connector by ID.
   */
  getRealm<T extends RealmConnector = RealmConnector>(realmId: RealmId | number): T | undefined {
    return this._realms.get(realmId as RealmId) as T | undefined;
  }

  /**
   * Creates an invocation linking a realm to a target with viewport parameters, returning InvocationId.
   */
  createInvocation(desc: InvocationDesc): InvocationId;
  createInvocation(invocationId: InvocationId | number, desc: InvocationDesc): InvocationId;
  createInvocation(
    arg1: InvocationId | number | InvocationDesc,
    arg2?: InvocationDesc
  ): InvocationId {
    let invocationId: InvocationId;
    let desc: InvocationDesc;

    if (typeof arg1 === 'number') {
      invocationId = arg1 as InvocationId;
      desc = arg2!;
    } else {
      invocationId = this._invocationIdAllocator.allocate('InvocationId');
      desc = arg1;
    }

    assertValidLogicalId(invocationId, 'InvocationId');
    if (this._invocations.has(invocationId)) {
      throw new Error(`Invocation ${invocationId} is already created.`);
    }

    if (this._engine) {
      this._engine.multiverseCreateInvocation(invocationId, desc);
    }
    this._invocations.add(invocationId);
    return invocationId;
  }

  /**
   * Destroys an existing invocation.
   */
  destroyInvocation(invocationId: InvocationId | number): void {
    const id = invocationId as InvocationId;
    if (!this._invocations.has(id)) return;
    if (this._engine) {
      this._engine.multiverseDestroyInvocation(id);
    }
    this._invocations.delete(id);
  }

  /**
   * Enables or disables an invocation.
   */
  setInvocationEnabled(invocationId: InvocationId | number, enabled: boolean): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationEnabled(invocationId as InvocationId, enabled);
    }
  }

  /**
   * Updates the responsive viewport rectangle of an invocation.
   */
  setInvocationViewport(invocationId: InvocationId | number, viewport: ViewportRect): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationViewport(invocationId as InvocationId, viewport);
    }
  }

  /**
   * Updates the post-process filter chain for an invocation.
   */
  setInvocationFilters(invocationId: InvocationId | number, filters: InvocationFilter[]): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationFilters(invocationId as InvocationId, filters);
    }
  }

  /**
   * Updates the clear color of an invocation.
   */
  setInvocationClearColor(
    invocationId: InvocationId | number,
    r: number,
    g: number,
    b: number,
    a: number,
    hasClear = true
  ): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationClearColor(
        invocationId as InvocationId,
        r,
        g,
        b,
        a,
        hasClear
      );
    }
  }

  /**
   * Updates the camera slot bound to an existing invocation.
   */
  setInvocationCameraSlot(
    invocationId: InvocationId | number,
    cameraSlot: number,
    hasSlot = true
  ): void {
    if (this._engine) {
      this._engine.multiverseSetInvocationCameraSlot(
        invocationId as InvocationId,
        cameraSlot,
        hasSlot
      );
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
  unbindTargetTexture(realmId: RealmId | number, slot: string): void {
    if (this._engine) {
      this._engine.multiverseUnbindTargetTexture(realmId as RealmId, slot);
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
   * Updates anti-aliasing configuration on a target.
   */
  setAntiAliasing(_targetId: TargetId | number, mode: AntiAliasingMode): void {
    if (this._engine) {
      this._engine.multiverseSetAntiAliasing(mode);
    }
  }

  /**
   * Steps all registered realms with the system context.
   */
  stepRealms(context: SystemContext): void {
    for (const realm of this._realms.values()) {
      if ('step' in realm && typeof (realm as any).step === 'function') {
        (realm as any).step(context);
      }
    }
  }

  /**
   * Synchronizes all realm states into the native/WASM core.
   */
  syncRealms(context?: SystemContext): void {
    for (const realm of this._realms.values()) {
      (realm as any).sync(context);
    }
  }

  /**
   * Synchronizes and steps all registered realms with system context.
   */
  syncAllRealms(context: SystemContext): void {
    for (const realm of this._realms.values()) {
      if ('step' in realm && typeof (realm as any).step === 'function') {
        (realm as any).step(context);
      }
      realm.sync(context);
    }
  }

  /**
   * Resolves responsive multiverse viewports and scheduling before dispatch.
   */
  resolve(): any {
    if (this._engine && typeof (this._engine as any).multiverseResolve === 'function') {
      return (this._engine as any).multiverseResolve();
    }
    return this.getSchedule() ?? { invocations: [] };
  }

  /**
   * Dispatches the native multiverse rendering pass for all active invocations.
   */
  dispatch(frameId?: number, dt?: number): void {
    if (this._engine) {
      (this._engine as any).multiverseDispatch(frameId, dt);
    }
  }

  /**
   * Queries the current active schedule of all realms, targets, and invocations.
   */
  getSchedule(): MultiverseSchedule | undefined {
    return (this._engine as any)?.multiverseGetSchedule?.();
  }

  /**
   * Releases all multiverse resources.
   */
  dispose(): void {
    for (const invocationId of this._invocations) {
      this.destroyInvocation(invocationId);
    }
    for (const realm of this._realms.values()) {
      realm.dispose();
    }
    for (const targetId of this._targets.keys()) {
      this.destroyTarget(targetId);
    }
    this._realms.clear();
    this._targets.clear();
    this._invocations.clear();
    this._engine = null;
  }
}
