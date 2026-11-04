import {
  type Collider2DComponent,
  type ColliderEntry,
  type ColliderShape2D,
  type EcsWorld,
  type EntityId,
  mat2d,
  type Mat2d,
  type Model2DComponent,
  SpatialDirtyFlags,
  vec2,
  type Vec2
} from '@galfus/engine';
import {
  packInteractionGroups,
  type PhysicsCollisionEvent,
  type RigidBody2DComponent
} from '@galfus/physics-types';
import RAPIER from '@dimforge/rapier2d-compat';

export interface Collider2DMeta {
  readonly entityId: EntityId;
  readonly colliderId: number;
  readonly sensor: boolean;
}

export interface Body2DRecord {
  readonly entityId: EntityId;
  readonly body: RAPIER.RigidBody;
  readonly colliderHandles: Map<number, number>;
  colliderSignature: string;
  readonly prevPos: Vec2;
  readonly currPos: Vec2;
  readonly lastSyncedPos: Vec2;
  prevRot: number;
  currRot: number;
  lastSyncedRot: number;
  readonly scale: Vec2;
  hasStepped: boolean;
}

const SCRATCH_POS = vec2.create();
const SCRATCH_SCALE = vec2.create();
const SCRATCH_LERP_POS = vec2.create();
const POSE_EPSILON = 1e-5;

function extractTRS2D(matrix: Mat2d, outPos: Vec2, outScale: Vec2): number {
  outPos[0] = matrix[4];
  outPos[1] = matrix[5];
  const sx = Math.hypot(matrix[0], matrix[1]) || 1;
  const det = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  const sy = (Math.hypot(matrix[2], matrix[3]) || 1) * (det < 0 ? -1 : 1);
  outScale[0] = sx;
  outScale[1] = sy;
  return Math.atan2(matrix[1], matrix[0]);
}

function posDiffers2D(a: Vec2, b: Vec2): boolean {
  return Math.abs(a[0] - b[0]) > POSE_EPSILON || Math.abs(a[1] - b[1]) > POSE_EPSILON;
}

function shortestAngleDiff(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let diff = (to - from) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  return diff;
}

function rotDiffers2D(a: number, b: number): boolean {
  return Math.abs(shortestAngleDiff(a, b)) > POSE_EPSILON;
}

function computeColliderSignature2D(
  shapes: readonly ColliderEntry<ColliderShape2D>[],
  friction: number,
  restitution: number,
  scale: Vec2
): string {
  if (shapes.length === 0) return '';
  let sig = `${friction.toFixed(4)}:${restitution.toFixed(4)}:${scale[0].toFixed(3)},${scale[1].toFixed(3)}|`;
  for (const entry of shapes) {
    sig += `${entry.colliderId}:${entry.active ? 1 : 0}:${entry.sensor ? 1 : 0}:${entry.layer}:${entry.mask}:${entry.shape.type}:`;
    if (entry.shape.type === 'circle') {
      sig += `${entry.shape.radius}:`;
    } else if (entry.shape.type === 'rectangle') {
      sig += `${entry.shape.halfExtents.join(',')}:`;
    } else {
      sig += `${entry.shape.vertices.length}:`;
    }
    sig += `${entry.matrix[4]},${entry.matrix[5]};`;
  }
  return sig;
}

export class BodySync2D {
  readonly records = new Map<EntityId, Body2DRecord>();
  readonly colliderMetaByHandle = new Map<number, Collider2DMeta>();

  constructor(
    private readonly ecsWorld: EcsWorld,
    private rapierWorld: RAPIER.World
  ) {}

  setRapierWorld(rapierWorld: RAPIER.World): void {
    this.rapierWorld = rapierWorld;
    this.records.clear();
    this.colliderMetaByHandle.clear();
  }

  removeEntityBody(entityId: EntityId): boolean {
    const record = this.records.get(entityId);
    if (!record) return false;
    for (const handle of record.colliderHandles.values()) {
      this.colliderMetaByHandle.delete(handle);
    }
    if (this.rapierWorld.bodies.contains(record.body.handle)) {
      this.rapierWorld.removeRigidBody(record.body);
    }
    this.records.delete(entityId);
    return true;
  }

  syncBeforeStep(): void {
    // 1. Prune removed entities or entities whose RigidBody2D was removed
    for (const entityId of Array.from(this.records.keys())) {
      if (
        !this.ecsWorld.isAlive(entityId) ||
        !this.ecsWorld.hasComponent(entityId, 'RigidBody2D')
      ) {
        this.removeEntityBody(entityId);
      }
    }

    // 2. Create or update active RigidBody2D entities
    const entities = this.ecsWorld.query('RigidBody2D');
    for (const entityId of entities) {
      const rb = this.ecsWorld.getComponent<RigidBody2DComponent>(entityId, 'RigidBody2D')!;
      const model = this.ecsWorld.getComponent<Model2DComponent>(entityId, 'Model2D');
      let rot = 0;
      if (model) {
        rot = extractTRS2D(model.localMatrix, SCRATCH_POS, SCRATCH_SCALE);
      } else {
        vec2.set(SCRATCH_POS, 0, 0);
        vec2.set(SCRATCH_SCALE, 1, 1);
      }

      let record = this.records.get(entityId);
      if (!record) {
        record = this._createBodyRecord(entityId, rb, SCRATCH_POS, rot, SCRATCH_SCALE);
        this.records.set(entityId, record);
      } else {
        vec2.copy(record.scale, SCRATCH_SCALE);
        if (rb.isDirty) {
          this._applyBodyDescUpdates(record.body, rb);
          rb.isDirty = false;
        }
        if (
          model &&
          (posDiffers2D(SCRATCH_POS, record.lastSyncedPos) ||
            rotDiffers2D(rot, record.lastSyncedRot))
        ) {
          if (rb.desc.type === 'kinematicPosition') {
            record.body.setNextKinematicTranslation({ x: SCRATCH_POS[0], y: SCRATCH_POS[1] });
            record.body.setNextKinematicRotation(rot);
          } else {
            record.body.setTranslation({ x: SCRATCH_POS[0], y: SCRATCH_POS[1] }, true);
            record.body.setRotation(rot, true);
            vec2.copy(record.prevPos, SCRATCH_POS);
            record.prevRot = rot;
          }
          vec2.copy(record.currPos, SCRATCH_POS);
          vec2.copy(record.lastSyncedPos, SCRATCH_POS);
          record.currRot = rot;
          record.lastSyncedRot = rot;
        }
      }

      const colliderComp = this.ecsWorld.getComponent<Collider2DComponent>(entityId, 'Collider2D');
      const shapes = colliderComp ? colliderComp.getShapes() : [];
      const sig = computeColliderSignature2D(
        shapes,
        rb.desc.friction,
        rb.desc.restitution,
        record.scale
      );
      if (sig !== record.colliderSignature) {
        this._rebuildColliders(record, rb, shapes);
        record.colliderSignature = sig;
      }
    }
  }

  syncAfterStep(): void {
    for (const [entityId, record] of this.records) {
      const rb = this.ecsWorld.getComponent<RigidBody2DComponent>(entityId, 'RigidBody2D');
      if (!rb) continue;

      vec2.copy(record.prevPos, record.currPos);
      record.prevRot = record.currRot;

      const t = record.body.translation();
      const r = record.body.rotation();
      vec2.set(record.currPos, t.x, t.y);
      record.currRot = r;

      const lv = record.body.linvel();
      rb.desc.linearVelocity[0] = lv.x;
      rb.desc.linearVelocity[1] = lv.y;
      rb.desc.angularVelocity = record.body.angvel();

      const model = this.ecsWorld.getComponent<Model2DComponent>(entityId, 'Model2D');
      if (!model) continue;

      const isSleeping = record.body.isSleeping();
      if (!isSleeping || !record.hasStepped) {
        record.hasStepped = true;
        mat2d.fromRotationTranslationScale(
          model.localMatrix,
          record.currPos,
          record.currRot,
          record.scale
        );
        model.flags |= SpatialDirtyFlags.LocalDirty | SpatialDirtyFlags.WorldDirty;
        vec2.copy(record.lastSyncedPos, record.currPos);
        record.lastSyncedRot = record.currRot;
      }
    }
  }

  interpolate(alpha: number): void {
    const t = Math.min(1, Math.max(0, alpha));
    for (const [entityId, record] of this.records) {
      if (record.body.isSleeping() || !record.hasStepped) continue;
      const model = this.ecsWorld.getComponent<Model2DComponent>(entityId, 'Model2D');
      if (!model) continue;

      if (
        !posDiffers2D(record.prevPos, record.currPos) &&
        !rotDiffers2D(record.prevRot, record.currRot)
      ) {
        continue;
      }

      vec2.lerp(SCRATCH_LERP_POS, record.prevPos, record.currPos, t);
      const interpRot = record.prevRot + shortestAngleDiff(record.prevRot, record.currRot) * t;
      mat2d.fromRotationTranslationScale(
        model.localMatrix,
        SCRATCH_LERP_POS,
        interpRot,
        record.scale
      );
      model.flags |= SpatialDirtyFlags.LocalDirty | SpatialDirtyFlags.WorldDirty;
      vec2.copy(record.lastSyncedPos, SCRATCH_LERP_POS);
      record.lastSyncedRot = interpRot;
    }
  }

  drainCollisionEvents(
    eventQueue: RAPIER.EventQueue,
    emit: (event: PhysicsCollisionEvent) => void
  ): void {
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      const metaA = this.colliderMetaByHandle.get(handle1);
      const metaB = this.colliderMetaByHandle.get(handle2);
      if (!metaA || !metaB) return;

      const isSensor = metaA.sensor || metaB.sensor;
      const type = isSensor
        ? started
          ? 'sensorEnter'
          : 'sensorExit'
        : started
          ? 'collisionStart'
          : 'collisionEnd';

      emit({
        type,
        entityA: metaA.entityId,
        entityB: metaB.entityId,
        colliderIdA: metaA.colliderId,
        colliderIdB: metaB.colliderId,
        sensor: isSensor
      });
    });
  }

  private _createBodyRecord(
    entityId: EntityId,
    rb: RigidBody2DComponent,
    pos: Vec2,
    rot: number,
    scale: Vec2
  ): Body2DRecord {
    const desc = rb.desc;
    let bodyDesc: RAPIER.RigidBodyDesc;
    switch (desc.type) {
      case 'fixed':
        bodyDesc = RAPIER.RigidBodyDesc.fixed();
        break;
      case 'kinematicPosition':
        bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        break;
      case 'kinematicVelocity':
        bodyDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased();
        break;
      default:
        bodyDesc = RAPIER.RigidBodyDesc.dynamic();
        break;
    }

    const mass = Math.max(0.0001, desc.mass);
    bodyDesc
      .setTranslation(pos[0], pos[1])
      .setRotation(rot)
      .setGravityScale(desc.gravityScale)
      .setLinearDamping(desc.linearDamping)
      .setAngularDamping(desc.angularDamping)
      .setCcdEnabled(desc.ccd)
      .setLinvel(desc.linearVelocity[0], desc.linearVelocity[1])
      .setAngvel(desc.angularVelocity);

    if (desc.type === 'dynamic') {
      bodyDesc.setAdditionalMassProperties(mass, { x: 0, y: 0 }, mass * 0.4);
    }

    if (desc.lockTranslations) {
      bodyDesc.lockTranslations();
    }
    if (desc.lockRotations) {
      bodyDesc.lockRotations();
    }

    const body = this.rapierWorld.createRigidBody(bodyDesc);
    if (desc.type === 'dynamic') {
      body.recomputeMassPropertiesFromColliders();
    }
    rb.isDirty = false;

    return {
      entityId,
      body,
      colliderHandles: new Map(),
      colliderSignature: '',
      prevPos: vec2.copy(vec2.create(), pos),
      currPos: vec2.copy(vec2.create(), pos),
      lastSyncedPos: vec2.copy(vec2.create(), pos),
      prevRot: rot,
      currRot: rot,
      lastSyncedRot: rot,
      scale: vec2.copy(vec2.create(), scale),
      hasStepped: false
    };
  }

  private _applyBodyDescUpdates(body: RAPIER.RigidBody, rb: RigidBody2DComponent): void {
    const desc = rb.desc;
    body.setGravityScale(desc.gravityScale, true);
    body.setLinearDamping(desc.linearDamping);
    body.setAngularDamping(desc.angularDamping);
    body.enableCcd(desc.ccd);
    body.setEnabledTranslations(!desc.lockTranslations, !desc.lockTranslations, true);
    body.lockRotations(desc.lockRotations, true);
  }

  private _rebuildColliders(
    record: Body2DRecord,
    rb: RigidBody2DComponent,
    shapes: readonly ColliderEntry<ColliderShape2D>[]
  ): void {
    for (const handle of record.colliderHandles.values()) {
      this.colliderMetaByHandle.delete(handle);
      const col = this.rapierWorld.getCollider(handle);
      if (col) {
        this.rapierWorld.removeCollider(col, false);
      }
    }
    record.colliderHandles.clear();

    const sx = Math.abs(record.scale[0]) || 1;
    const sy = Math.abs(record.scale[1]) || 1;

    for (const entry of shapes) {
      if (!entry.active) continue;
      let colDesc: RAPIER.ColliderDesc | null = null;
      if (entry.shape.type === 'rectangle') {
        const [hx, hy] = entry.shape.halfExtents;
        colDesc = RAPIER.ColliderDesc.cuboid(hx * sx, hy * sy);
      } else if (entry.shape.type === 'circle') {
        colDesc = RAPIER.ColliderDesc.ball(entry.shape.radius * Math.max(sx, sy));
      } else {
        const flat = new Float32Array(entry.shape.vertices.length * 2);
        let maxX = 0.01;
        let maxY = 0.01;
        for (let i = 0; i < entry.shape.vertices.length; i++) {
          const vx = entry.shape.vertices[i]![0] * sx;
          const vy = entry.shape.vertices[i]![1] * sy;
          flat[i * 2] = vx;
          flat[i * 2 + 1] = vy;
          maxX = Math.max(maxX, Math.abs(vx));
          maxY = Math.max(maxY, Math.abs(vy));
        }
        colDesc = RAPIER.ColliderDesc.convexHull(flat) ?? RAPIER.ColliderDesc.cuboid(maxX, maxY);
      }

      const m = entry.matrix;
      const localRot = Math.atan2(m[1] ?? 0, m[0] ?? 1);

      colDesc
        .setTranslation((m[4] ?? 0) * sx, (m[5] ?? 0) * sy)
        .setRotation(localRot)
        .setDensity(0)
        .setSensor(entry.sensor)
        .setFriction(rb.desc.friction)
        .setRestitution(rb.desc.restitution)
        .setCollisionGroups(packInteractionGroups(entry.layer, entry.mask))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setActiveCollisionTypes(
          RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
        );

      const collider = this.rapierWorld.createCollider(colDesc, record.body);
      record.colliderHandles.set(entry.colliderId, collider.handle);
      this.colliderMetaByHandle.set(collider.handle, {
        entityId: record.entityId,
        colliderId: entry.colliderId,
        sensor: entry.sensor
      });
    }
  }
}
