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

export interface InvocationUpdateProps {
  viewport?: ViewportRect;
  zIndex?: number;
  cameraSlot?: number | null;
  filters?: InvocationFilter[];
  enabled?: boolean;
  clearColor?: [number, number, number, number] | null;
  antiAliasing?: AntiAliasingMode | null;
}

export class MultiverseCoordinator {
  private _engine: GalfusEngine | null = null;
  private readonly _targetIdAllocator = new IdAllocator<TargetId>(1);
  private readonly _invocationIdAllocator = new IdAllocator<InvocationId>(1);
  private readonly _realms = new Map<RealmId, RealmConnector>();
  private readonly _targets = new Map<TargetId, TargetDesc>();
  private readonly _invocations = new Map<InvocationId, InvocationDesc>();
  private readonly _dirtyInvocations = new Map<InvocationId, InvocationUpdateProps>();
  private readonly _invocationRealms = new Map<InvocationId, RealmId>();

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
   * Unregisters and disposes a realm connector, removing any dependent invocations.
   */
  unregisterRealm(realmId: RealmId | number): void {
    const id = realmId as RealmId;
    const realm = this._realms.get(id);
    if (!realm) return;

    // Automatically destroy all invocations associated with this realm
    for (const [invId, rId] of this._invocationRealms) {
      if (rId === id) {
        this.destroyInvocation(invId);
      }
    }

    realm.dispose();
    if (this._engine && realm.realmKind !== '2d' && realm.realmKind !== '3d') {
      this._engine.multiverseUnregisterRealm?.(id);
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
   * Returns all registered realm connectors.
   */
  getRealms(): Iterable<RealmConnector> {
    return this._realms.values();
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

    const storedDesc: InvocationDesc = {
      ...desc,
      viewport: desc.viewport ? { ...desc.viewport } : { width: { vw: 100 }, height: { vh: 100 } },
      filters: desc.filters ? [...desc.filters] : []
    };

    if (this._engine) {
      this._engine.multiverseCreateInvocation(invocationId, storedDesc);
    }
    this._invocations.set(invocationId, storedDesc);
    this._invocationRealms.set(invocationId, desc.realmId as RealmId);
    return invocationId;
  }

  /**
   * Retrieves the current stored presentation descriptor of an invocation.
   */
  getInvocation(invocationId: InvocationId | number): InvocationDesc | undefined {
    return this._invocations.get(invocationId as InvocationId);
  }

  /**
   * Updates an invocation's presentation descriptor (viewport, filters, clearColor, etc.).
   * Preserves realmId and targetId as strictly immutable.
   * Multiple calls within the same frame are coalesced into a single ABI update before dispatch.
   */
  updateInvocation(
    invocationId: InvocationId | number,
    patch: Partial<InvocationUpdateProps>
  ): void {
    const id = invocationId as InvocationId;
    const inv = this._invocations.get(id);
    if (!inv) {
      throw new Error(`Cannot update non-existent invocation ${id}.`);
    }
    if ('realmId' in patch || 'targetId' in patch) {
      throw new Error('Cannot mutate realmId or targetId of an existing invocation.');
    }

    if (patch.viewport !== undefined) inv.viewport = { ...patch.viewport };
    if (patch.zIndex !== undefined) inv.zIndex = patch.zIndex;
    if (patch.cameraSlot !== undefined) inv.cameraSlot = patch.cameraSlot ?? undefined;
    if (patch.filters !== undefined) inv.filters = [...patch.filters];
    if (patch.enabled !== undefined) inv.enabled = patch.enabled;
    if (patch.clearColor !== undefined) inv.clearColor = patch.clearColor ?? undefined;
    if (patch.antiAliasing !== undefined) inv.antiAliasing = patch.antiAliasing ?? undefined;

    const existing = this._dirtyInvocations.get(id) ?? {};
    this._dirtyInvocations.set(id, { ...existing, ...patch });
  }

  /**
   * Flushes all coalesced dirty invocation updates to the native engine driver.
   */
  flushUpdates(): void {
    if (!this._engine || this._dirtyInvocations.size === 0) return;
    for (const [id, patch] of this._dirtyInvocations) {
      if (!this._invocations.has(id)) continue;
      const inv = this._invocations.get(id)!;
      if (
        patch.viewport !== undefined &&
        inv.viewport &&
        this._engine.multiverseSetInvocationViewport
      ) {
        this._engine.multiverseSetInvocationViewport(id, inv.viewport);
      }
      if (patch.enabled !== undefined && this._engine.multiverseSetInvocationEnabled) {
        this._engine.multiverseSetInvocationEnabled(id, inv.enabled ?? true);
      }
      if (patch.filters !== undefined && this._engine.multiverseSetInvocationFilters) {
        this._engine.multiverseSetInvocationFilters(id, inv.filters ?? []);
      }
      if (patch.clearColor !== undefined && this._engine.multiverseSetInvocationClearColor) {
        const [r, g, b, a] = inv.clearColor ?? [0, 0, 0, 0];
        this._engine.multiverseSetInvocationClearColor(id, r, g, b, a, !!inv.clearColor);
      }
      if (patch.cameraSlot !== undefined && this._engine.multiverseSetInvocationCameraSlot) {
        this._engine.multiverseSetInvocationCameraSlot(
          id,
          inv.cameraSlot ?? 0,
          inv.cameraSlot !== undefined && inv.cameraSlot !== null
        );
      }
    }
    this._dirtyInvocations.clear();
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
    this._dirtyInvocations.delete(id);
    this._invocations.delete(id);
    this._invocationRealms.delete(id);
  }

  /**
   * Enables or disables an invocation.
   */
  setInvocationEnabled(invocationId: InvocationId | number, enabled: boolean): void {
    this.updateInvocation(invocationId, { enabled });
  }

  /**
   * Updates the responsive viewport rectangle of an invocation.
   */
  setInvocationViewport(invocationId: InvocationId | number, viewport: ViewportRect): void {
    this.updateInvocation(invocationId, { viewport });
  }

  /**
   * Updates the post-process filter chain for an invocation.
   */
  setInvocationFilters(invocationId: InvocationId | number, filters: InvocationFilter[]): void {
    this.updateInvocation(invocationId, { filters });
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
    this.updateInvocation(invocationId, { clearColor: hasClear ? [r, g, b, a] : null });
  }

  /**
   * Updates the camera slot bound to an existing invocation.
   */
  setInvocationCameraSlot(
    invocationId: InvocationId | number,
    cameraSlot: number,
    hasSlot = true
  ): void {
    this.updateInvocation(invocationId, { cameraSlot: hasSlot ? cameraSlot : null });
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
   * Steps all registered realms through pre-render stages (input, update, preRender).
   */
  stepRealmsPreRender(context: SystemContext): void {
    for (const realm of this._realms.values()) {
      if (typeof realm.preRender === 'function') {
        realm.preRender(context);
      } else if ('step' in realm && typeof (realm as any).step === 'function') {
        (realm as any).step(context);
      }
    }
  }

  /**
   * Steps all registered realms through post-render stage (postRender) after dispatch.
   */
  stepRealmsPostRender(context: SystemContext): void {
    for (const realm of this._realms.values()) {
      if (typeof realm.postRender === 'function') {
        realm.postRender(context);
      }
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
    this.flushUpdates();
    if (this._engine && typeof (this._engine as any).multiverseResolve === 'function') {
      return (this._engine as any).multiverseResolve();
    }
    return this.getSchedule() ?? { invocations: [] };
  }

  /**
   * Dispatches the native multiverse rendering pass for all active invocations.
   */
  dispatch(frameId?: number, dt?: number): void {
    this.flushUpdates();
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
   * Resets all invocations, targets, and realms.
   */
  reset(): void {
    for (const invocationId of [...this._invocations.keys()]) {
      this.destroyInvocation(invocationId);
    }
    for (const realm of [...this._realms.values()]) {
      this.unregisterRealm(realm.realmId);
    }
    for (const targetId of [...this._targets.keys()]) {
      this.destroyTarget(targetId);
    }
    this._realms.clear();
    this._targets.clear();
    this._invocations.clear();
    this._dirtyInvocations.clear();
    this._invocationRealms.clear();
  }

  /**
   * Releases all multiverse resources.
   */
  dispose(): void {
    this.reset();
    this._engine = null;
  }
}
