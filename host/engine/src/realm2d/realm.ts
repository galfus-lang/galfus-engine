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
  Svg2DDesc
} from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';
import type { AnimationCoordinator } from '../animation/coordinator';
import { AnchorSolveSystem } from '../anchors/solver';
import { HierarchyCoordinator } from '../anchors/hierarchy';
import type { Transform2DProps } from '../anchors/component';
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
  type Model2DComponent,
  type ParticleEmitter2DComponent,
  type Svg2DComponent
} from './components';
import { Realm2DSyncSystem } from './sync';

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

  constructor(realmId: RealmId | number) {
    this.realmId = realmId as RealmId;
    assertValidLogicalId(this.realmId, 'RealmId');
    this.hierarchy = new HierarchyCoordinator(this.world, '2d');
    this.syncSystem = new Realm2DSyncSystem(this.realmId, this.solver.cache);

    // Register anchor solver in preRender
    this.world.addSystem('preRender', this.solver.createSystem());
  }

  allocateResourceId(): number {
    const id = this._nextResourceLogicalId++;
    assertValidLogicalId(id, 'ResourceId');
    return id;
  }

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
    engine.realm2dCreate(this.realmId);
  }

  preRender(context: SystemContext): void {
    this.world.stepPreRender(context);
    this._preRenderSteppedFrame = context.frameId;
  }

  sync(context: SystemContext): void {
    if (this._preRenderSteppedFrame !== context.frameId) {
      this.preRender(context);
    }
    if (this._engine) {
      this.syncSystem.sync(this.world, this._engine);
    }
  }

  postRender(context: SystemContext): void {
    this.world.stepPostRender(context);
  }

  flush(): void {
    if (this._engine) {
      this.syncSystem.sync(this.world, this._engine);
    }
  }

  dispose(): void {
    this.syncSystem.dispose(this._engine);
    if (this._engine) {
      this._engine.realm2dDestroy(this.realmId);
    }
    this._engine = null;
    this.world.clear();
    this.solver.cache.clear();
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
  private _resolveSvgId(svg: number | { svgId?: number; entityId?: EntityId }): number {
    if (typeof svg === 'number') {
      return this.world.getComponent<Svg2DComponent>(svg as EntityId, 'Svg2D')?.svgId ?? svg;
    }
    return (
      svg.svgId ??
      (svg.entityId
        ? this.world.getComponent<Svg2DComponent>(svg.entityId, 'Svg2D')?.svgId
        : undefined) ??
      1
    );
  }

  setSvgSource(svg: number | { svgId?: number; entityId?: EntityId }, source: string): void {
    const svgId = this._resolveSvgId(svg);
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
    return this._engine.realm2dLoadFontData(this.realmId, data, data.byteLength);
  }

  createMaterial(desc: Material2DDesc): number {
    const materialId = this.allocateResourceId();
    if (this._engine) {
      this._engine.realm2dCreateMaterial(this.realmId, materialId, desc);
    }
    return materialId;
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
            : undefined) ??
          1);
    if (this._engine) {
      if (!this.syncSystem.isEmitterSynced(emitterId)) {
        this.flush();
      }
      this._engine.realm2dParticleEmitterBurst(this.realmId, emitterId, count);
    }
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
