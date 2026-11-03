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
import {
  PresentationGraph,
  type PresentationGraphView,
  type PresentationSurface
} from './presentation-graph';
import { PresentationLinks } from './presentation-links';
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
  private readonly _presentation = new PresentationGraph();
  private readonly _presentationLinks = new PresentationLinks();
  private readonly _boundTargets = new Set<TargetId>();
  private readonly _boundRealms = new Set<RealmId>();
  private readonly _boundInvocations = new Set<InvocationId>();
  private readonly _boundBindings = new Map<RealmId, Map<string, number>>();

  get presentationGraph(): PresentationGraphView {
    return this._presentation.view;
  }

  get engine(): GalfusEngine | null {
    return this._engine;
  }

  /**
   * Binds the coordinator to the active native or WASM GalfusEngine driver.
   */
  bindEngine(engine: GalfusEngine): void {
    if (this._engine && this._engine !== engine)
      throw new Error('Multiverse is already bound to another engine.');
    this._engine = engine;
    for (const [targetId, desc] of this._targets) {
      if (this._boundTargets.has(targetId)) continue;
      if (desc.kind.type === 'window') {
        engine.multiverseAttachWindow?.(desc.kind.windowId);
      }
      engine.multiverseCreateTarget(targetId, desc);
      this._boundTargets.add(targetId);
    }
    for (const [id, realm] of this._realms) {
      if (this._boundRealms.has(id)) continue;
      realm.bindEngine(engine);
      this._boundRealms.add(id);
    }
    for (const [id, desc] of this._invocations) {
      if (this._boundInvocations.has(id)) continue;
      engine.multiverseCreateInvocation(id, desc);
      this._boundInvocations.add(id);
      this._dirtyInvocations.delete(id);
    }
    for (const binding of this._presentationLinks.getBindings()) {
      const realmId = binding.realmId as RealmId;
      if (this._boundBindings.get(realmId)?.get(binding.slot) === binding.sourceTargetId) continue;
      engine.multiverseBindTargetTexture(binding);
      this._recordBoundBinding(binding);
    }
  }

  private _recordBoundBinding(binding: TargetTextureBinding): void {
    const realmId = binding.realmId as RealmId;
    let slots = this._boundBindings.get(realmId);
    if (!slots) {
      slots = new Map();
      this._boundBindings.set(realmId, slots);
    }
    slots.set(binding.slot, binding.sourceTargetId);
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

    const storedDesc = structuredClone(desc);
    if (this._engine) {
      if (desc.kind.type === 'window') {
        this._engine.multiverseAttachWindow?.(desc.kind.windowId);
      }
      this._engine.multiverseCreateTarget(targetId, storedDesc);
      this._boundTargets.add(targetId);
    }
    this._targets.set(targetId, storedDesc);
    this._targetIdAllocator.markUsed(targetId, 'TargetId');
    return targetId;
  }

  /**
   * Destroys a render target.
   */
  destroyTarget(targetId: TargetId | number): void {
    const id = targetId as TargetId;
    if (!this._targets.has(id)) return;
    if (this._engine && this._boundTargets.has(id)) {
      this._engine.multiverseDestroyTarget(id);
    }
    for (const [invId, inv] of this._invocations) {
      if (inv.targetId === id) this._forgetInvocation(invId);
    }
    for (const binding of this._presentationLinks.getBindingsForTarget(id)) {
      this._presentationLinks.unbind(binding.realmId, binding.slot);
      this._boundBindings.get(binding.realmId as RealmId)?.delete(binding.slot);
    }
    this._boundTargets.delete(id);
    this._targets.delete(id);
  }

  /**
   * Retrieves a registered target description by ID.
   */
  getTarget(targetId: TargetId | number): Readonly<TargetDesc> | undefined {
    return this._targets.get(targetId as TargetId);
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

    if (this._engine) {
      realm.bindEngine(this._engine);
      this._boundRealms.add(realmId);
    }
    this._realms.set(realmId, realm);
  }

  /**
   * Unregisters and disposes a realm connector, removing any dependent invocations.
   */
  unregisterRealm(realmId: RealmId | number): void {
    const id = realmId as RealmId;
    const realm = this._realms.get(id);
    if (!realm) return;

    for (const [invId, inv] of this._invocations) {
      if (inv.realmId === id) this.destroyInvocation(invId);
    }

    realm.dispose();
    if (
      this._engine &&
      this._boundRealms.has(id) &&
      realm.realmKind !== '2d' &&
      realm.realmKind !== '3d'
    ) {
      this._engine.multiverseUnregisterRealm?.(id);
    }
    for (const binding of this._presentationLinks.getBindingsForRealm(id))
      this._presentationLinks.unbind(id, binding.slot);
    this._boundBindings.delete(id);
    this._boundRealms.delete(id);
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
    if (!this._realms.has(desc.realmId as RealmId))
      throw new Error(`Realm ${desc.realmId} is not registered.`);
    if (!this._targets.has(desc.targetId as TargetId))
      throw new Error(`Target ${desc.targetId} is not registered.`);

    const storedDesc: InvocationDesc = structuredClone(desc);
    storedDesc.viewport ??= { width: { vw: 100 }, height: { vh: 100 } };
    storedDesc.filters ??= [];

    if (this._engine) {
      this._engine.multiverseCreateInvocation(invocationId, storedDesc);
      this._boundInvocations.add(invocationId);
    }
    this._invocations.set(invocationId, storedDesc);
    this._invocationIdAllocator.markUsed(invocationId, 'InvocationId');
    return invocationId;
  }

  /**
   * Retrieves the current stored presentation descriptor of an invocation.
   */
  getInvocation(invocationId: InvocationId | number): InvocationDesc | undefined {
    const desc = this._invocations.get(invocationId as InvocationId);
    return desc ? structuredClone(desc) : undefined;
  }

  /**
   * Updates an invocation's presentation descriptor (viewport, filters, clearColor, etc.).
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
    if (
      patch.zIndex !== undefined &&
      (!Number.isInteger(patch.zIndex) || patch.zIndex < -2147483648 || patch.zIndex > 2147483647)
    ) {
      throw new Error('Invocation zIndex must be a signed 32-bit integer.');
    }

    if (patch.viewport !== undefined) inv.viewport = structuredClone(patch.viewport);
    if (patch.zIndex !== undefined) inv.zIndex = patch.zIndex;
    if (patch.cameraSlot !== undefined) inv.cameraSlot = patch.cameraSlot ?? undefined;
    if (patch.filters !== undefined) inv.filters = structuredClone(patch.filters);
    if (patch.enabled !== undefined) inv.enabled = patch.enabled;
    if (patch.clearColor !== undefined)
      inv.clearColor = patch.clearColor ? [...patch.clearColor] : undefined;
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
      if (patch.zIndex !== undefined && this._engine.multiverseSetInvocationZIndex) {
        this._engine.multiverseSetInvocationZIndex(id, inv.zIndex ?? 0);
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
    const desc = this._invocations.get(id);
    if (!desc) return;
    if (this._engine && this._boundInvocations.has(id)) {
      this._engine.multiverseDestroyInvocation(id);
    }
    this._forgetInvocation(id);
  }

  private _forgetInvocation(id: InvocationId): void {
    this._dirtyInvocations.delete(id);
    this._invocations.delete(id);
    this._boundInvocations.delete(id);
  }

  /**
   * Binds an output target texture to a realm input slot (e.g. portal or render-to-texture).
   */
  bindTargetTexture(binding: TargetTextureBinding): void {
    const target = this._targets.get(binding.sourceTargetId as TargetId);
    if (!target || target.kind.type !== 'texture')
      throw new Error('Texture binding requires a registered texture target.');
    if (!this._realms.has(binding.realmId as RealmId))
      throw new Error(`Realm ${binding.realmId} is not registered.`);
    if (this._engine) {
      this._engine.multiverseBindTargetTexture(binding);
      this._recordBoundBinding(binding);
    }
    this._presentationLinks.bind(binding);
  }

  /**
   * Unbinds a target texture from a realm input slot.
   */
  unbindTargetTexture(realmId: RealmId | number, slot: string): void {
    if (this._engine && this._boundBindings.get(realmId as RealmId)?.has(slot)) {
      this._engine.multiverseUnbindTargetTexture(realmId as RealmId, slot);
    }
    this._boundBindings.get(realmId as RealmId)?.delete(slot);
    this._presentationLinks.unbind(realmId, slot);
  }

  /** @internal Called only after a surface-to-texture mapping has been verified. */
  connectPresentationSurface(surface: PresentationSurface): void {
    assertValidLogicalId(surface.entityId, 'EntityId');
    this._presentationLinks.connectSurface(surface);
  }
  /** @internal Removes a verified surface mapping. */
  disconnectPresentationSurface(surface: PresentationSurface): void {
    this._presentationLinks.disconnectSurface(surface);
  }
  /** @internal Called after the platform window has actually closed. */
  windowClosed(windowId: number): void {
    this._presentation.windowClosed(windowId);
  }
  /** @internal Called when a platform window becomes available. */
  windowOpened(windowId: number): void {
    this._presentation.windowOpened(windowId);
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
   * Synchronizes all realm states into the native/WASM core.
   */
  syncRealms(context?: SystemContext): void {
    for (const realm of this._realms.values()) {
      (realm as any).sync(context);
    }
  }

  /**
   * Resolves responsive multiverse viewports and scheduling before dispatch.
   */
  resolve(): any {
    this.flushUpdates();
    this._purgeDeadPresentationSurfaces();
    if (this._engine && typeof (this._engine as any).multiverseResolve === 'function') {
      return (this._engine as any).multiverseResolve();
    }
    return this.getSchedule() ?? { invocations: [] };
  }

  private _purgeDeadPresentationSurfaces(): void {
    this._presentationLinks.purgeDeadSurfaces((realmId, entityId) => {
      const realm = this._realms.get(realmId as RealmId);
      if (!realm || (realm as any).isDisposed) return false;
      return (realm as any).world?.isAlive(entityId) ?? true;
    });
  }

  /**
   * Dispatches the native multiverse rendering pass for all active invocations.
   */
  dispatch(frameId?: number, dt?: number): void {
    if (!this._engine) return;
    const schedule = this.resolve();
    this._presentation.stage(schedule, this._targets, this._presentationLinks.snapshot());
    try {
      this._engine.multiverseDispatch(frameId ?? 0, dt ?? 0);
      this._presentation.commit();
    } catch (error) {
      this._presentation.discard();
      throw error;
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
    this._presentation.clear();
    this._presentationLinks.clear();
    this._boundTargets.clear();
    this._boundRealms.clear();
    this._boundInvocations.clear();
    this._boundBindings.clear();
  }

  /**
   * Releases all multiverse resources.
   */
  dispose(): void {
    this.reset();
    this._presentation.dispose();
    this._engine = null;
  }
}
