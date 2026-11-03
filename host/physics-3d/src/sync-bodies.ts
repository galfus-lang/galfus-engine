import {
  type Collider3DComponent,
  type ColliderEntry,
  type ColliderShape3D,
  type EcsWorld,
  type EntityId,
  mat4,
  type Mat4,
  type Model3DComponent,
  quat,
  type Quat,
  SpatialDirtyFlags,
  vec3,
  type Vec3
} from '@galfus/engine';
import {
  packInteractionGroups,
  type PhysicsCollisionEvent,
  type RigidBody3DComponent
} from '@galfus/physics-types';
import RAPIER from '@dimforge/rapier3d-compat';

export interface Collider3DMeta {
  readonly entityId: EntityId;
  readonly colliderId: number;
  readonly sensor: boolean;
}

export interface Body3DRecord {
  readonly entityId: EntityId;
  readonly body: RAPIER.RigidBody;
  readonly colliderHandles: Map<number, number>;
  colliderSignature: string;
  readonly prevPos: Vec3;
  readonly currPos: Vec3;
  readonly lastSyncedPos: Vec3;
  readonly prevRot: Quat;
  readonly currRot: Quat;
  readonly lastSyncedRot: Quat;
  readonly scale: Vec3;
  hasStepped: boolean;
}

const SCRATCH_POS = vec3.create();
const SCRATCH_ROT = quat.create();
const SCRATCH_SCALE = vec3.create();
const SCRATCH_LERP_POS = vec3.create();
const SCRATCH_SLERP_ROT = quat.create();
const POSE_EPSILON = 1e-5;

function extractTRS3D(matrix: Mat4, outPos: Vec3, outRot: Quat, outScale: Vec3): void {
  mat4.getTranslation(outPos, matrix);
  mat4.getScaling(outScale, matrix);
  mat4.getRotation(outRot, matrix);
  quat.normalize(outRot, outRot);
}

function posDiffers3D(a: Vec3, b: Vec3): boolean {
  return (
    Math.abs(a[0] - b[0]) > POSE_EPSILON ||
    Math.abs(a[1] - b[1]) > POSE_EPSILON ||
    Math.abs(a[2] - b[2]) > POSE_EPSILON
  );
}

function rotDiffers3D(a: Quat, b: Quat): boolean {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 1 - dot > POSE_EPSILON;
}

function computeColliderSignature3D(
  shapes: readonly ColliderEntry<ColliderShape3D>[],
  friction: number,
  restitution: number,
  scale: Vec3
): string {
  if (shapes.length === 0) return '';
  let sig = `${friction.toFixed(4)}:${restitution.toFixed(4)}:${scale[0].toFixed(3)},${scale[1].toFixed(3)},${scale[2].toFixed(3)}|`;
  for (const entry of shapes) {
    sig += `${entry.colliderId}:${entry.active ? 1 : 0}:${entry.sensor ? 1 : 0}:${entry.layer}:${entry.mask}:${entry.shape.type}:`;
    if (entry.shape.type === 'sphere') {
      sig += `${entry.shape.radius}:`;
    } else {
      sig += `${entry.shape.halfExtents.join(',')}:`;
    }
    sig += `${entry.matrix[12]},${entry.matrix[13]},${entry.matrix[14]};`;
  }
  return sig;
}

export class BodySync3D {
  readonly records = new Map<EntityId, Body3DRecord>();
  readonly colliderMetaByHandle = new Map<number, Collider3DMeta>();

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
    // 1. Prune removed entities or entities whose RigidBody3D was removed
    for (const entityId of Array.from(this.records.keys())) {
      if (
        !this.ecsWorld.isAlive(entityId) ||
        !this.ecsWorld.hasComponent(entityId, 'RigidBody3D')
      ) {
        this.removeEntityBody(entityId);
      }
    }

    // 2. Create or update active RigidBody3D entities
    const entities = this.ecsWorld.query('RigidBody3D');
    for (const entityId of entities) {
      const rb = this.ecsWorld.getComponent<RigidBody3DComponent>(entityId, 'RigidBody3D')!;
      const model = this.ecsWorld.getComponent<Model3DComponent>(entityId, 'Model3D');
      if (model) {
        extractTRS3D(model.localMatrix, SCRATCH_POS, SCRATCH_ROT, SCRATCH_SCALE);
      } else {
        vec3.set(SCRATCH_POS, 0, 0, 0);
        quat.identity(SCRATCH_ROT);
        vec3.set(SCRATCH_SCALE, 1, 1, 1);
      }

      let record = this.records.get(entityId);
      if (!record) {
        record = this._createBodyRecord(entityId, rb, SCRATCH_POS, SCRATCH_ROT, SCRATCH_SCALE);
        this.records.set(entityId, record);
      } else {
        vec3.copy(record.scale, SCRATCH_SCALE);
        if (rb.isDirty) {
          this._applyBodyDescUpdates(record.body, rb);
          rb.isDirty = false;
        }
        if (
          model &&
          (posDiffers3D(SCRATCH_POS, record.lastSyncedPos) ||
            rotDiffers3D(SCRATCH_ROT, record.lastSyncedRot))
        ) {
          if (rb.desc.type === 'kinematicPosition') {
            record.body.setNextKinematicTranslation({
              x: SCRATCH_POS[0],
              y: SCRATCH_POS[1],
              z: SCRATCH_POS[2]
            });
            record.body.setNextKinematicRotation({
              x: SCRATCH_ROT[0],
              y: SCRATCH_ROT[1],
              z: SCRATCH_ROT[2],
              w: SCRATCH_ROT[3]
            });
          } else {
            record.body.setTranslation(
              { x: SCRATCH_POS[0], y: SCRATCH_POS[1], z: SCRATCH_POS[2] },
              true
            );
            record.body.setRotation(
              { x: SCRATCH_ROT[0], y: SCRATCH_ROT[1], z: SCRATCH_ROT[2], w: SCRATCH_ROT[3] },
              true
            );
            vec3.copy(record.prevPos, SCRATCH_POS);
            quat.copy(record.prevRot, SCRATCH_ROT);
          }
          vec3.copy(record.currPos, SCRATCH_POS);
          vec3.copy(record.lastSyncedPos, SCRATCH_POS);
          quat.copy(record.currRot, SCRATCH_ROT);
          quat.copy(record.lastSyncedRot, SCRATCH_ROT);
        }
      }

      const colliderComp = this.ecsWorld.getComponent<Collider3DComponent>(entityId, 'Collider3D');
      const shapes = colliderComp ? colliderComp.getShapes() : [];
      const sig = computeColliderSignature3D(
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
      const rb = this.ecsWorld.getComponent<RigidBody3DComponent>(entityId, 'RigidBody3D');
      if (!rb) continue;

      vec3.copy(record.prevPos, record.currPos);
      quat.copy(record.prevRot, record.currRot);

      const t = record.body.translation();
      const r = record.body.rotation();
      vec3.set(record.currPos, t.x, t.y, t.z);
      quat.set(record.currRot, r.x, r.y, r.z, r.w);
      quat.normalize(record.currRot, record.currRot);

      const lv = record.body.linvel();
      const av = record.body.angvel();
      rb.desc.linearVelocity[0] = lv.x;
      rb.desc.linearVelocity[1] = lv.y;
      rb.desc.linearVelocity[2] = lv.z;
      rb.desc.angularVelocity[0] = av.x;
      rb.desc.angularVelocity[1] = av.y;
      rb.desc.angularVelocity[2] = av.z;

      const model = this.ecsWorld.getComponent<Model3DComponent>(entityId, 'Model3D');
      if (!model) continue;

      const isSleeping = record.body.isSleeping();
      if (!isSleeping || !record.hasStepped) {
        record.hasStepped = true;
        mat4.fromRotationTranslationScale(
          model.localMatrix,
          record.currRot,
          record.currPos,
          record.scale
        );
        model.flags |= SpatialDirtyFlags.LocalDirty | SpatialDirtyFlags.WorldDirty;
        vec3.copy(record.lastSyncedPos, record.currPos);
        quat.copy(record.lastSyncedRot, record.currRot);
      }
    }
  }

  interpolate(alpha: number): void {
    const t = Math.min(1, Math.max(0, alpha));
    for (const [entityId, record] of this.records) {
      if (record.body.isSleeping() || !record.hasStepped) continue;
      const model = this.ecsWorld.getComponent<Model3DComponent>(entityId, 'Model3D');
      if (!model) continue;

      if (
        !posDiffers3D(record.prevPos, record.currPos) &&
        !rotDiffers3D(record.prevRot, record.currRot)
      ) {
        continue;
      }

      vec3.lerp(SCRATCH_LERP_POS, record.prevPos, record.currPos, t);
      quat.slerp(SCRATCH_SLERP_ROT, record.prevRot, record.currRot, t);
      mat4.fromRotationTranslationScale(
        model.localMatrix,
        SCRATCH_SLERP_ROT,
        SCRATCH_LERP_POS,
        record.scale
      );
      model.flags |= SpatialDirtyFlags.LocalDirty | SpatialDirtyFlags.WorldDirty;
      vec3.copy(record.lastSyncedPos, SCRATCH_LERP_POS);
      quat.copy(record.lastSyncedRot, SCRATCH_SLERP_ROT);
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
    rb: RigidBody3DComponent,
    pos: Vec3,
    rot: Quat,
    scale: Vec3
  ): Body3DRecord {
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
    const inertia = mass * 0.4;
    bodyDesc
      .setTranslation(pos[0], pos[1], pos[2])
      .setRotation({ x: rot[0], y: rot[1], z: rot[2], w: rot[3] })
      .setGravityScale(desc.gravityScale)
      .setLinearDamping(desc.linearDamping)
      .setAngularDamping(desc.angularDamping)
      .setCcdEnabled(desc.ccd)
      .setLinvel(desc.linearVelocity[0], desc.linearVelocity[1], desc.linearVelocity[2])
      .setAngvel({
        x: desc.angularVelocity[0],
        y: desc.angularVelocity[1],
        z: desc.angularVelocity[2]
      });

    if (desc.type === 'dynamic') {
      bodyDesc.setAdditionalMassProperties(
        mass,
        { x: 0, y: 0, z: 0 },
        { x: inertia, y: inertia, z: inertia },
        { x: 0, y: 0, z: 0, w: 1 }
      );
    }

    if (desc.lockTranslations) {
      bodyDesc.lockTranslations();
    }
    if (desc.lockRotations) {
      bodyDesc.lockRotations();
    } else {
      bodyDesc.enabledRotations(
        desc.enabledRotations[0],
        desc.enabledRotations[1],
        desc.enabledRotations[2]
      );
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
      prevPos: vec3.copy(vec3.create(), pos),
      currPos: vec3.copy(vec3.create(), pos),
      lastSyncedPos: vec3.copy(vec3.create(), pos),
      prevRot: quat.copy(quat.create(), rot),
      currRot: quat.copy(quat.create(), rot),
      lastSyncedRot: quat.copy(quat.create(), rot),
      scale: vec3.copy(vec3.create(), scale),
      hasStepped: false
    };
  }

  private _applyBodyDescUpdates(body: RAPIER.RigidBody, rb: RigidBody3DComponent): void {
    const desc = rb.desc;
    body.setGravityScale(desc.gravityScale, true);
    body.setLinearDamping(desc.linearDamping);
    body.setAngularDamping(desc.angularDamping);
    body.enableCcd(desc.ccd);
    body.setEnabledTranslations(
      !desc.lockTranslations,
      !desc.lockTranslations,
      !desc.lockTranslations,
      true
    );
    const rx = !desc.lockRotations && desc.enabledRotations[0];
    const ry = !desc.lockRotations && desc.enabledRotations[1];
    const rz = !desc.lockRotations && desc.enabledRotations[2];
    body.setEnabledRotations(rx, ry, rz, true);
  }

  private _rebuildColliders(
    record: Body3DRecord,
    rb: RigidBody3DComponent,
    shapes: readonly ColliderEntry<ColliderShape3D>[]
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
    const sz = Math.abs(record.scale[2]) || 1;
    const localRot = quat.create();

    for (const entry of shapes) {
      if (!entry.active) continue;
      let colDesc: RAPIER.ColliderDesc;
      if (entry.shape.type === 'box') {
        const [hx, hy, hz] = entry.shape.halfExtents;
        colDesc = RAPIER.ColliderDesc.cuboid(hx * sx, hy * sy, hz * sz);
      } else if (entry.shape.type === 'sphere') {
        const maxScale = Math.max(sx, sy, sz);
        colDesc = RAPIER.ColliderDesc.ball(entry.shape.radius * maxScale);
      } else {
        const [hx, hy] = entry.shape.halfExtents;
        colDesc = RAPIER.ColliderDesc.cuboid(hx * sx, hy * sy, 0.01);
      }

      const m = entry.matrix;
      mat4.getRotation(localRot, m as unknown as Mat4);
      quat.normalize(localRot, localRot);

      colDesc
        .setTranslation((m[12] ?? 0) * sx, (m[13] ?? 0) * sy, (m[14] ?? 0) * sz)
        .setRotation({ x: localRot[0], y: localRot[1], z: localRot[2], w: localRot[3] })
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
