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
import { createTransform2D, type Transform2DProps } from '../anchors/component';
import type { EntityId } from '../ecs/entity';
import type { SystemContext } from '../ecs/system';
import { EcsWorld } from '../ecs/world';
import type { RealmConnector, RealmId, RealmKind } from '../multiverse/realm';
import type { TransitionId } from '../types';
import {
  createCamera2D,
  createLight2D,
  createParticleEmitter2D,
  createShape2D,
  createSprite2D,
  createSvg2D,
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

  sync(context: SystemContext): void {
    // 1. Advance ECS world simulation
    this.world.step(context);

    // 2. Synchronize state with native core
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
  createSprite(desc: Sprite2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const spriteId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform2D(transform));
    this.world.attachComponent(entityId, createSprite2D(spriteId, desc));
    return entityId;
  }

  createShape(desc: Shape2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const shapeId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform2D(transform));
    this.world.attachComponent(entityId, createShape2D(shapeId, desc));
    return entityId;
  }

  createLight(desc: Light2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const lightId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform2D(transform));
    this.world.attachComponent(entityId, createLight2D(lightId, desc));
    return entityId;
  }

  createCamera(desc: Camera2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const cameraId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform2D(transform));
    this.world.attachComponent(entityId, createCamera2D(cameraId, desc));
    return entityId;
  }

  createSvg(desc: Svg2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const svgId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform2D(transform));
    this.world.attachComponent(entityId, createSvg2D(svgId, desc));
    return entityId;
  }

  // ---------------------------------------------------------------------------
  // SVG Dynamic Manipulation
  // ---------------------------------------------------------------------------
  setSvgSource(svgId: number, source: string): void {
    if (this._engine) {
      this._engine.realm2dSetSvgSource(this.realmId, svgId, source);
    }
  }

  setSvgAttribute(svgId: number, elementId: string, name: string, value: string): void {
    if (this._engine) {
      this._engine.realm2dSetSvgAttribute(this.realmId, svgId, elementId, name, value);
    }
  }

  removeSvgAttribute(svgId: number, elementId: string, name: string): void {
    if (this._engine) {
      this._engine.realm2dRemoveSvgAttribute(this.realmId, svgId, elementId, name);
    }
  }

  setSvgText(svgId: number, elementId: string, text: string): void {
    if (this._engine) {
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
  createParticleEmitter(desc: ParticleEmitter2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const emitterId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform2D(transform));
    this.world.attachComponent(entityId, createParticleEmitter2D(emitterId, desc));
    return entityId;
  }

  particleEmitterBurst(emitterId: number, count: number): void {
    if (this._engine) {
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
