/**
 * Realm 2D synchronization system syncing ECS state with core GalfusEngine.
 */
import type { GalfusEngine, Transform2DDesc } from '@galfus/transport-types';
import type { AnchorMatrixCache } from '../anchors/cache';
import type { Transform2DComponent } from '../anchors/component';
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import type {
  Camera2DComponent,
  Light2DComponent,
  ParticleEmitter2DComponent,
  Shape2DComponent,
  Sprite2DComponent,
  Svg2DComponent
} from './components';

export class Realm2DSyncSystem {
  private readonly _syncedSprites = new Set<number>();
  private readonly _syncedShapes = new Set<number>();
  private readonly _syncedLights = new Set<number>();
  private readonly _syncedCameras = new Set<number>();
  private readonly _syncedSvgs = new Set<number>();
  private readonly _syncedEmitters = new Set<number>();

  constructor(
    readonly realmId: number,
    readonly cache: AnchorMatrixCache
  ) {}

  /**
   * Extracts a Transform2DDesc from the persistent cache and component metadata.
   */
  getResolvedTransform(world: EcsWorld, id: EntityId): Transform2DDesc {
    const mat = this.cache.getWorld2D(id);
    const tf = world.getComponent<Transform2DComponent>(id, 'Transform2D');

    if (mat) {
      const a = mat[0];
      const b = mat[1];
      const c = mat[2];
      const d = mat[3];
      const tx = mat[4];
      const ty = mat[5];

      const scaleX = Math.hypot(a, b);
      const scaleY = Math.hypot(c, d);
      const rotation = Math.atan2(b, a);

      return {
        position: [tx, ty],
        rotation,
        scale: [scaleX, scaleY],
        zLayer: tf?.zLayer ?? 0,
        drawOrder: tf?.drawOrder ?? 0
      };
    }

    if (tf) {
      return {
        position: [tf.position[0], tf.position[1]],
        rotation: tf.rotation,
        scale: [tf.scale[0], tf.scale[1]],
        zLayer: tf.zLayer,
        drawOrder: tf.drawOrder
      };
    }

    return { position: [0, 0] };
  }

  /**
   * Synchronizes all active 2D components to the engine driver.
   */
  sync(world: EcsWorld, engine: GalfusEngine): void {
    // 1. Sync Sprites
    const spriteEntities = world.query('Sprite2D');
    const currentSprites = new Set<number>();
    for (const id of spriteEntities) {
      const sprite = world.getComponent<Sprite2DComponent>(id, 'Sprite2D');
      if (!sprite) continue;
      currentSprites.add(sprite.spriteId);

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedSprites.has(sprite.spriteId) || sprite.isDirty) {
        engine.realm2dCreateSprite(this.realmId, sprite.spriteId, sprite.desc, tf);
        this._syncedSprites.add(sprite.spriteId);
        sprite.isDirty = false;
      } else {
        engine.realm2dSetSpriteTransform(this.realmId, sprite.spriteId, tf);
      }
    }
    // Cleanup destroyed sprites
    for (const spriteId of this._syncedSprites) {
      if (!currentSprites.has(spriteId)) {
        engine.realm2dDestroySprite(this.realmId, spriteId);
        this._syncedSprites.delete(spriteId);
      }
    }

    // 2. Sync Shapes
    const shapeEntities = world.query('Shape2D');
    const currentShapes = new Set<number>();
    for (const id of shapeEntities) {
      const shape = world.getComponent<Shape2DComponent>(id, 'Shape2D');
      if (!shape) continue;
      currentShapes.add(shape.shapeId);

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedShapes.has(shape.shapeId) || shape.isDirty) {
        engine.realm2dCreateShape(this.realmId, shape.shapeId, shape.desc, tf);
        this._syncedShapes.add(shape.shapeId);
        shape.isDirty = false;
      } else {
        engine.realm2dSetShapeTransform(this.realmId, shape.shapeId, tf);
      }
    }
    for (const shapeId of this._syncedShapes) {
      if (!currentShapes.has(shapeId)) {
        engine.realm2dDestroyShape(this.realmId, shapeId);
        this._syncedShapes.delete(shapeId);
      }
    }

    // 3. Sync Lights
    const lightEntities = world.query('Light2D');
    const currentLights = new Set<number>();
    for (const id of lightEntities) {
      const light = world.getComponent<Light2DComponent>(id, 'Light2D');
      if (!light) continue;
      currentLights.add(light.lightId);

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedLights.has(light.lightId) || light.isDirty) {
        engine.realm2dCreateLight(this.realmId, light.lightId, light.desc, tf);
        this._syncedLights.add(light.lightId);
        light.isDirty = false;
      } else {
        engine.realm2dSetLightTransform(this.realmId, light.lightId, tf);
      }
    }
    for (const lightId of this._syncedLights) {
      if (!currentLights.has(lightId)) {
        engine.realm2dDestroyLight(this.realmId, lightId);
        this._syncedLights.delete(lightId);
      }
    }

    // 4. Sync Cameras
    const cameraEntities = world.query('Camera2D');
    for (const id of cameraEntities) {
      const camera = world.getComponent<Camera2DComponent>(id, 'Camera2D');
      if (!camera) continue;

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedCameras.has(camera.cameraId) || camera.isDirty) {
        engine.realm2dCreateCamera(this.realmId, camera.cameraId, camera.desc, tf);
        this._syncedCameras.add(camera.cameraId);
        camera.isDirty = false;
      } else {
        engine.realm2dSetCameraTransform(this.realmId, camera.cameraId, tf);
      }
    }

    // 5. Sync SVGs
    const svgEntities = world.query('Svg2D');
    const currentSvgs = new Set<number>();
    for (const id of svgEntities) {
      const svg = world.getComponent<Svg2DComponent>(id, 'Svg2D');
      if (!svg) continue;
      currentSvgs.add(svg.svgId);

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedSvgs.has(svg.svgId) || svg.isDirty) {
        engine.realm2dCreateSvg(this.realmId, svg.svgId, svg.desc, tf);
        this._syncedSvgs.add(svg.svgId);
        svg.isDirty = false;
      } else {
        engine.realm2dSetSvgTransform(this.realmId, svg.svgId, tf);
      }
    }
    for (const svgId of this._syncedSvgs) {
      if (!currentSvgs.has(svgId)) {
        engine.realm2dDestroySvg(this.realmId, svgId);
        this._syncedSvgs.delete(svgId);
      }
    }

    // 6. Sync Particle Emitters
    const emitterEntities = world.query('ParticleEmitter2D');
    const currentEmitters = new Set<number>();
    for (const id of emitterEntities) {
      const emitter = world.getComponent<ParticleEmitter2DComponent>(id, 'ParticleEmitter2D');
      if (!emitter) continue;
      currentEmitters.add(emitter.emitterId);

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedEmitters.has(emitter.emitterId) || emitter.isDirty) {
        engine.realm2dCreateParticleEmitter(this.realmId, emitter.emitterId, emitter.desc, tf);
        this._syncedEmitters.add(emitter.emitterId);
        emitter.isDirty = false;
      } else {
        engine.realm2dSetParticleEmitterTransform(this.realmId, emitter.emitterId, tf);
      }
    }
    for (const emitterId of this._syncedEmitters) {
      if (!currentEmitters.has(emitterId)) {
        engine.realm2dDestroyParticleEmitter(this.realmId, emitterId);
        this._syncedEmitters.delete(emitterId);
      }
    }
  }

  isSvgSynced(svgId: number): boolean {
    return this._syncedSvgs.has(svgId);
  }

  isEmitterSynced(emitterId: number): boolean {
    return this._syncedEmitters.has(emitterId);
  }

  /**
   * Disposes all tracked IDs on the engine when the realm is destroyed.
   */
  dispose(engine: GalfusEngine | null): void {
    if (engine) {
      for (const id of this._syncedSprites) engine.realm2dDestroySprite(this.realmId, id);
      for (const id of this._syncedShapes) engine.realm2dDestroyShape(this.realmId, id);
      for (const id of this._syncedLights) engine.realm2dDestroyLight(this.realmId, id);
      for (const id of this._syncedCameras) engine.realm2dDestroyCamera(this.realmId, id);
      for (const id of this._syncedSvgs) engine.realm2dDestroySvg(this.realmId, id);
      for (const id of this._syncedEmitters) engine.realm2dDestroyParticleEmitter(this.realmId, id);
    }
    this._syncedSprites.clear();
    this._syncedShapes.clear();
    this._syncedLights.clear();
    this._syncedCameras.clear();
    this._syncedSvgs.clear();
    this._syncedEmitters.clear();
  }
}
