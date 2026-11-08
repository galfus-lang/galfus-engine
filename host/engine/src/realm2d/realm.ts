/**
 * High-level Realm2D manager combining an ECS World, Anchor solver, and core sync.
 */

import type {
  Camera2DDesc,
  GalfusEngine,
  Light2DDesc,
  Material2DDesc,
  ParticleEmitter2DDesc,
  Shadow2DConfigDesc,
  Shape2DDesc,
  Sprite2DDesc,
  Svg2DDesc,
  SvgElementRect,
  SvgTextLayout,
  TransitionConfig
} from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';
import type { Transform2DProps } from '../anchors/component';
import { HierarchyCoordinator } from '../anchors/hierarchy';
import { AnchorSolveSystem } from '../anchors/solver';
import type { AnimationCoordinator } from '../animation/coordinator';
import { Collider2DComponent, type ColliderOptions } from '../collision/components';
import { queryPoint2D, raycast2D } from '../collision/query2d';
import type { EntityId } from '../ecs/entity';
import type { SystemContext } from '../ecs/system';
import { EcsWorld } from '../ecs/world';
import type { RealmConnector, RealmId, RealmKind } from '../multiverse/realm';
import type { TransitionId } from '../types';
import {
  createCamera2D,
  createLight2D,
  createModel2D,
  createParticleEmitter2D,
  createShape2D,
  createSprite2D,
  createSvg2D,
  type ParticleEmitter2DComponent,
  type Svg2DComponent
} from './components';
import { Realm2DSyncSystem } from './sync';

const NON_GEOMETRIC_SVG_ATTRIBUTES = new Set([
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'color',
  'visibility',
  'display',
  'stop-color',
  'stop-opacity',
  'cursor',
  'pointer-events',
  'image-rendering',
  'shape-rendering',
  'text-rendering',
  'clip-path',
  'mask',
  'filter'
]);

export class Realm2D implements RealmConnector {
  readonly realmKind: RealmKind = '2d';
  readonly realmId: RealmId;
  readonly world = new EcsWorld();
  readonly solver = new AnchorSolveSystem();
  readonly syncSystem: Realm2DSyncSystem;
  readonly hierarchy: HierarchyCoordinator<'2d'>;

  private _engine: GalfusEngine | null = null;
  private _nextResourceLogicalId = 1;
  private _preRenderSteppedFrame = -1;
  private _disposed = false;
  private readonly _materials = new Map<number, Material2DDesc>();
  private readonly _svgCache = new Map<
    number,
    {
      rects: Map<string, Readonly<SvgElementRect> | null>;
      layouts: Map<string, Readonly<SvgTextLayout> | null>;
    }
  >();

  constructor(realmId: RealmId | number) {
    this.realmId = realmId as RealmId;
    assertValidLogicalId(this.realmId, 'RealmId');
    this.hierarchy = new HierarchyCoordinator(this.world, '2d');
    this.syncSystem = new Realm2DSyncSystem(this.realmId, this.solver.cache, (id) => {
      this.invalidateSvgCache(id);
    });
    this._registerInternalSystems();
  }

  private _registerInternalSystems(): void {
    this.world.addSystem('preRender', this.solver.createSystem(), { kind: 'anchor' });
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  allocateResourceId(): number {
    const id = this._nextResourceLogicalId++;
    assertValidLogicalId(id, 'ResourceId');
    return id;
  }

  bindEngine(engine: GalfusEngine): void {
    if (this._disposed) return;
    this._engine = engine;
    engine.realm2dCreate(this.realmId);
  }

  preRender(context: SystemContext): void {
    if (this._disposed) return;
    this.world.stepPreRender(context);
    this._preRenderSteppedFrame = context.frameId;
  }

  sync(context: SystemContext): void {
    if (this._disposed) return;
    if (this._preRenderSteppedFrame !== context.frameId) {
      this.preRender(context);
    }
    if (this._engine) {
      this.syncSystem.sync(this.world, this._engine, this._materials);
    }
  }

  postRender(context: SystemContext): void {
    if (this._disposed) return;
    this.world.stepPostRender(context);
  }

  flush(): void {
    if (this._disposed) return;
    if (this._engine) {
      this.solver.solve(this.world, { time: 0, dt: 0, frameId: 0, engine: this._engine });
      this.syncSystem.sync(this.world, this._engine, this._materials);
    }
  }

  reset(): void {
    if (this._disposed) throw new Error('Cannot reset a disposed Realm2D.');
    this.world.reset();
    this.solver.cache.clear();
    this._materials.clear();
    this._svgCache.clear();
    this._preRenderSteppedFrame = -1;
    this._registerInternalSystems();
    if (this._engine) {
      this.syncSystem.dispose(this._engine);
      this._engine.realm2dDestroy(this.realmId);
      this._engine.realm2dCreate(this.realmId);
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.syncSystem.dispose(this._engine);
    if (this._engine) {
      this._engine.realm2dDestroy(this.realmId);
    }
    this._engine = null;
    this.world.reset();
    this.solver.cache.clear();
    this._materials.clear();
    this._svgCache.clear();
  }

  /** Adds a collider to an entity with a matching Model component. */
  addCollider(
    entityId: EntityId,
    shape: import('../collision/components').ColliderShape2D,
    options?: ColliderOptions
  ): number {
    if (!this.world.isAlive(entityId) || !this.world.hasComponent(entityId, 'Model2D'))
      throw new Error('Collider requires a live entity with Model2D.');
    const existing = this.world.getComponent<Collider2DComponent>(entityId, 'Collider2D');
    const component = existing ?? new Collider2DComponent();
    const id = this.allocateResourceId();
    component.add(id, shape, options);
    if (!existing) this.world.attachComponent(entityId, component);
    return id;
  }

  queryPoint(point: [number, number], mask = 0xffffffff) {
    if (this._disposed) throw new Error('Cannot query a disposed Realm2D.');
    this.solver.solve(this.world, { time: 0, dt: 0, frameId: 0 });
    return queryPoint2D(this.world, point, mask);
  }
  raycast(
    origin: [number, number],
    direction: [number, number],
    maxDistance: number,
    mask = 0xffffffff
  ) {
    if (this._disposed) throw new Error('Cannot query a disposed Realm2D.');
    this.solver.solve(this.world, { time: 0, dt: 0, frameId: 0 });
    return raycast2D(this.world, origin, direction, maxDistance, mask);
  }

  destroyEntity(entityId: EntityId): boolean {
    if (!this.world.isAlive(entityId)) return false;
    this.hierarchy.detach(entityId);
    this.hierarchy.handleTargetDestroyed(entityId);
    this.solver.cache.remove(entityId);
    return this.world.destroyEntity(entityId);
  }

  // ---------------------------------------------------------------------------
  // Fluent Entity Spawning Helpers
  // ---------------------------------------------------------------------------
  /**
   * Creates a pure 2D spatial node holding Model2DComponent without visual attachment.
   */
  createSpatialNode(transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const modelId = this.allocateResourceId();
    const model = createModel2D(modelId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    return entityId;
  }

  createSprite(desc: Sprite2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const spriteId = this.allocateResourceId();

    const model = createModel2D(spriteId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createSprite2D(spriteId, desc));
    return entityId;
  }

  createShape(desc: Shape2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const shapeId = this.allocateResourceId();

    const model = createModel2D(shapeId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createShape2D(shapeId, desc));
    return entityId;
  }

  createLight(desc: Light2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const lightId = this.allocateResourceId();
    const model = createModel2D(lightId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createLight2D(lightId, desc));
    return entityId;
  }

  createCamera(
    desc: Camera2DDesc,
    transform?: Transform2DProps
  ): { entityId: EntityId; cameraId: number } {
    const entityId = this.world.createEntity();
    const cameraId = this.allocateResourceId();
    const model = createModel2D(cameraId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createCamera2D(cameraId, desc));
    return { entityId, cameraId };
  }

  createSvg(desc: Svg2DDesc, transform?: Transform2DProps): { entityId: EntityId; svgId: number } {
    const entityId = this.world.createEntity();
    const svgId = this.allocateResourceId();

    const model = createModel2D(svgId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createSvg2D(svgId, desc));
    return { entityId, svgId };
  }

  // ---------------------------------------------------------------------------
  // SVG Dynamic Manipulation
  // ---------------------------------------------------------------------------
  /** Returns element bounds in the SVG viewport coordinate system. */
  getSvgElementRect(svgId: number, elementId: string): Readonly<SvgElementRect> | undefined {
    if (this._disposed || !this._engine) return undefined;
    if (!this.syncSystem.isSvgSynced(svgId)) this.flush();
    if (!this.syncSystem.isSvgSynced(svgId)) return undefined;
    const entries = this._svgCacheEntry(svgId).rects;
    if (!entries.has(elementId)) {
      const rect = this._engine.realm2dGetSvgElementRect(this.realmId, svgId, elementId).rect;
      entries.set(elementId, rect ? Object.freeze(rect) : null);
    }
    return entries.get(elementId) ?? undefined;
  }

  /** Returns cached raw shaping metrics in SVG viewport coordinates. */
  getSvgTextLayout(svgId: number, elementId: string): Readonly<SvgTextLayout> | undefined {
    if (this._disposed || !this._engine) return undefined;
    if (!this.syncSystem.isSvgSynced(svgId)) this.flush();
    if (!this.syncSystem.isSvgSynced(svgId)) return undefined;
    const entries = this._svgCacheEntry(svgId).layouts;
    if (!entries.has(elementId)) {
      const layout = this._engine.realm2dGetSvgTextLayout(this.realmId, svgId, elementId).layout;
      if (layout) {
        for (const cluster of layout.clusters) {
          Object.freeze(cluster.transform);
          Object.freeze(cluster);
        }
        Object.freeze(layout.clusters);
        Object.freeze(layout.chunks);
        Object.freeze(layout);
      }
      entries.set(elementId, layout ?? null);
    }
    return entries.get(elementId) ?? undefined;
  }

  /** @internal Invalidates cached SVG geometry after native animation updates. */
  invalidateSvgCache(svgId: number): void {
    this._svgCache.delete(svgId);
  }

  private _svgCacheEntry(svgId: number) {
    let entry = this._svgCache.get(svgId);
    if (!entry) {
      entry = { rects: new Map(), layouts: new Map() };
      this._svgCache.set(svgId, entry);
    }
    return entry;
  }

  private _resolveSvgId(svg: number | { svgId?: number; entityId?: EntityId }): number {
    if (typeof svg === 'number') {
      return this.world.getComponent<Svg2DComponent>(svg as EntityId, 'Svg2D')?.svgId ?? svg;
    }
    const resolved =
      svg.svgId ??
      (svg.entityId
        ? this.world.getComponent<Svg2DComponent>(svg.entityId, 'Svg2D')?.svgId
        : undefined);
    if (resolved === undefined) {
      throw new Error('Cannot resolve Svg2D ID: entity does not have a Svg2DComponent.');
    }
    return resolved;
  }

  setSvgSource(svg: number | { svgId?: number; entityId?: EntityId }, source: string): void {
    const svgId = this._resolveSvgId(svg);
    this.invalidateSvgCache(svgId);
    if (this._engine) {
      if (!this.syncSystem.isSvgSynced(svgId)) {
        this.flush();
      }
      this._engine.realm2dSetSvgSource(this.realmId, svgId, source);
    }
  }

  setSvgAttribute(
    svg: number | { svgId?: number; entityId?: EntityId },
    elementId: string,
    name: string,
    value: string
  ): void {
    const svgId = this._resolveSvgId(svg);
    const lowerName = name.toLowerCase();
    if (lowerName === 'viewbox' || elementId === '') {
      this.invalidateSvgCache(svgId);
    } else if (!NON_GEOMETRIC_SVG_ATTRIBUTES.has(lowerName)) {
      const entry = this._svgCache.get(svgId);
      if (entry) {
        entry.rects.delete(elementId);
        entry.layouts.delete(elementId);
      }
    }
    if (this._engine) {
      if (!this.syncSystem.isSvgSynced(svgId)) {
        this.flush();
      }
      this._engine.realm2dSetSvgAttribute(this.realmId, svgId, elementId, name, value);
    }
  }

  removeSvgAttribute(
    svg: number | { svgId?: number; entityId?: EntityId },
    elementId: string,
    name: string
  ): void {
    const svgId = this._resolveSvgId(svg);
    const lowerName = name.toLowerCase();
    if (lowerName === 'viewbox' || elementId === '') {
      this.invalidateSvgCache(svgId);
    } else if (!NON_GEOMETRIC_SVG_ATTRIBUTES.has(lowerName)) {
      const entry = this._svgCache.get(svgId);
      if (entry) {
        entry.rects.delete(elementId);
        entry.layouts.delete(elementId);
      }
    }
    if (this._engine) {
      if (!this.syncSystem.isSvgSynced(svgId)) {
        this.flush();
      }
      this._engine.realm2dRemoveSvgAttribute(this.realmId, svgId, elementId, name);
    }
  }

  setSvgText(
    svg: number | { svgId?: number; entityId?: EntityId },
    elementId: string,
    text: string
  ): void {
    const svgId = this._resolveSvgId(svg);
    const entry = this._svgCache.get(svgId);
    if (entry) {
      entry.rects.delete(elementId);
      entry.layouts.delete(elementId);
    }
    if (this._engine) {
      if (!this.syncSystem.isSvgSynced(svgId)) {
        this.flush();
      }
      this._engine.realm2dSetSvgText(this.realmId, svgId, elementId, text);
    }
  }

  // ---------------------------------------------------------------------------
  // 2D Polar Shadows, Fonts & Materials
  // ---------------------------------------------------------------------------
  setShadowConfig(config: Shadow2DConfigDesc): void {
    if (this._engine) {
      this._engine.realm2dSetShadowConfig(this.realmId, config);
    }
  }

  loadFontData(data: Uint8Array): string {
    if (!this._engine) {
      throw new Error('Cannot load font: Realm2D is not bound to an engine instance.');
    }
    const family = this._engine.realm2dLoadFontData(this.realmId, data, data.byteLength);
    this._svgCache.clear();
    return family;
  }

  /** Registers a material for upload during the next sync or flush. */
  createMaterial(desc: Material2DDesc): number {
    const materialId = this.allocateResourceId();
    this._materials.set(materialId, desc);
    return materialId;
  }

  /** Removes a material on the next sync or flush; entities referencing it are not destroyed. */
  destroyMaterial(materialId: number): void {
    this._materials.delete(materialId);
  }

  // ---------------------------------------------------------------------------
  // 2D Particle Emitters
  // ---------------------------------------------------------------------------
  createParticleEmitter(
    desc: ParticleEmitter2DDesc,
    transform?: Transform2DProps
  ): { entityId: EntityId; emitterId: number } {
    const entityId = this.world.createEntity();
    const emitterId = this.allocateResourceId();
    const model = createModel2D(emitterId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createParticleEmitter2D(emitterId, desc));
    return { entityId, emitterId };
  }

  particleEmitterBurst(
    emitter: number | { emitterId?: number; entityId?: EntityId },
    count: number
  ): void {
    const emitterId =
      typeof emitter === 'number'
        ? (this.world.getComponent<ParticleEmitter2DComponent>(
            emitter as EntityId,
            'ParticleEmitter2D'
          )?.emitterId ?? emitter)
        : (emitter.emitterId ??
          (emitter.entityId
            ? this.world.getComponent<ParticleEmitter2DComponent>(
                emitter.entityId,
                'ParticleEmitter2D'
              )?.emitterId
            : undefined));
    if (emitterId === undefined) {
      throw new Error(
        'Cannot resolve ParticleEmitter2D ID: entity does not have a ParticleEmitter2DComponent.'
      );
    }
    if (this._engine) {
      if (!this.syncSystem.isEmitterSynced(emitterId)) {
        this.flush();
      }
      this._engine.realm2dParticleEmitterBurst(this.realmId, emitterId, count);
    }
  }

  /**
   * Helper to animate a 2D model transform directly through ECS.
   */
  animateModel(
    entityId: EntityId,
    targetValue: unknown,
    config: TransitionConfig,
    animation: AnimationCoordinator
  ): TransitionId | undefined {
    return animation.animateEcsProperty(this.world, entityId, 'transform2d', targetValue, config);
  }

  /**
   * Helper to animate SVG opacity directly without manual target ID construction.
   */
  animateSvgOpacity(
    entityId: EntityId,
    initialOpacity: number,
    targetOpacity: number,
    duration: number,
    animation: AnimationCoordinator
  ): TransitionId | undefined {
    const svg = this.world.getComponent<Svg2DComponent>(entityId, 'Svg2D');
    if (!svg) return undefined;
    const transId = animation.createScalarTransition(initialOpacity, duration, 0, 0, {
      kind: 'svgOpacity',
      realmId: this.realmId,
      svgId: svg.svgId
    });
    animation.transitionToScalar(transId, targetOpacity, duration);
    return transId;
  }
}
