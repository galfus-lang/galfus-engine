import type { AnchorComponent, EcsWorld, EntityId } from '@galfus/engine';
import RAPIER from '@dimforge/rapier3d-compat';
import type { BodySync3D } from './sync-bodies';

interface Joint3DRecord {
  readonly originId: EntityId;
  readonly targetId: EntityId;
  readonly joint: RAPIER.ImpulseJoint;
  readonly signature: string;
}

function computeJointSignature3D(anchor: AnchorComponent): string {
  const p = anchor.params;
  return [
    anchor.targetEntityId,
    anchor.strategy,
    (anchor.distance ?? 0).toFixed(4),
    p?.maxLength ?? '',
    p?.length ?? '',
    p?.restLength ?? '',
    p?.stiffness ?? '',
    p?.damping ?? '',
    p?.collideConnected ? 1 : 0,
    p?.localAnchorOrigin?.join(',') ?? '',
    p?.localAnchorTarget?.join(',') ?? ''
  ].join('|');
}

export class JointSync3D {
  private readonly joints = new Map<EntityId, Joint3DRecord>();

  constructor(
    private readonly ecsWorld: EcsWorld,
    private rapierWorld: RAPIER.World,
    private readonly bodySync: BodySync3D
  ) {}

  setRapierWorld(rapierWorld: RAPIER.World): void {
    this.releaseAllManagedFlags();
    this.joints.clear();
    this.rapierWorld = rapierWorld;
  }

  releaseAllManagedFlags(): void {
    for (const [originId] of this.joints) {
      if (this.ecsWorld.isAlive(originId)) {
        const anchor = this.ecsWorld.getComponent<AnchorComponent>(originId, 'Anchor');
        if (anchor) {
          anchor.managedByPhysics = false;
        }
      }
    }
  }

  removeJointsForEntity(entityId: EntityId): void {
    const asOrigin = this.joints.get(entityId);
    if (asOrigin) {
      this._removeJointRecord(entityId, asOrigin);
    }
    for (const [originId, record] of Array.from(this.joints.entries())) {
      if (record.targetId === entityId) {
        this._removeJointRecord(originId, record);
      }
    }
  }

  syncBeforeStep(): void {
    // 1. Prune invalid or stale joints
    for (const [originId, record] of Array.from(this.joints.entries())) {
      if (!this.ecsWorld.isAlive(originId) || !this.ecsWorld.isAlive(record.targetId)) {
        this._removeJointRecord(originId, record);
        continue;
      }
      const anchor = this.ecsWorld.getComponent<AnchorComponent>(originId, 'Anchor');
      if (
        !anchor ||
        !anchor.active ||
        !this.bodySync.records.has(originId) ||
        !this.bodySync.records.has(anchor.targetEntityId)
      ) {
        this._removeJointRecord(originId, record);
        continue;
      }
      const sig = computeJointSignature3D(anchor);
      if (sig !== record.signature) {
        this._removeJointRecord(originId, record);
      }
    }

    // 2. Create joints for active Anchor + RigidBody3D pairs
    const anchoredEntities = this.ecsWorld.query('Anchor', 'RigidBody3D');
    for (const originId of anchoredEntities) {
      if (this.joints.has(originId)) continue;

      const anchor = this.ecsWorld.getComponent<AnchorComponent>(originId, 'Anchor')!;
      if (!anchor.active) {
        anchor.managedByPhysics = false;
        continue;
      }

      const originRecord = this.bodySync.records.get(originId);
      const targetRecord = this.bodySync.records.get(anchor.targetEntityId);
      if (!originRecord || !targetRecord) {
        anchor.managedByPhysics = false;
        continue;
      }

      const jointData = this._buildJointData(anchor, targetRecord.currPos, originRecord.currPos);
      if (!jointData) {
        anchor.managedByPhysics = false;
        continue;
      }

      const joint = this.rapierWorld.createImpulseJoint(
        jointData,
        targetRecord.body,
        originRecord.body,
        true
      );
      joint.setContactsEnabled(anchor.params?.collideConnected ?? false);
      anchor.managedByPhysics = true;

      this.joints.set(originId, {
        originId,
        targetId: anchor.targetEntityId,
        joint,
        signature: computeJointSignature3D(anchor)
      });
    }
  }

  private _removeJointRecord(originId: EntityId, record: Joint3DRecord): void {
    if (this.rapierWorld.impulseJoints.contains(record.joint.handle)) {
      this.rapierWorld.removeImpulseJoint(record.joint, true);
    }
    if (this.ecsWorld.isAlive(originId)) {
      const anchor = this.ecsWorld.getComponent<AnchorComponent>(originId, 'Anchor');
      if (anchor) {
        anchor.managedByPhysics = false;
      }
    }
    this.joints.delete(originId);
  }

  private _buildJointData(
    anchor: AnchorComponent,
    targetPos: Float32Array,
    originPos: Float32Array
  ): RAPIER.JointData | null {
    const p = anchor.params;
    const rawTarget = p?.localAnchorTarget;
    const rawOrigin = p?.localAnchorOrigin;

    const anchor1 = {
      x: rawTarget?.[0] ?? 0,
      y: rawTarget?.[1] ?? 0,
      z: rawTarget?.[2] ?? 0
    };
    const anchor2 = {
      x: rawOrigin?.[0] ?? 0,
      y: rawOrigin?.[1] ?? 0,
      z: rawOrigin?.[2] ?? 0
    };

    switch (anchor.strategy) {
      case 'rope': {
        const maxLength = Math.max(1e-4, p?.maxLength ?? anchor.distance ?? 1);
        return RAPIER.JointData.rope(maxLength, anchor1, anchor2);
      }
      case 'chain': {
        const length = Math.max(0, p?.length ?? anchor.distance ?? 1);
        if (!rawOrigin && !rawTarget && length > 0) {
          const dx = targetPos[0]! - originPos[0]!;
          const dy = targetPos[1]! - originPos[1]!;
          const dz = targetPos[2]! - originPos[2]!;
          const dist = Math.hypot(dx, dy, dz);
          if (dist > 1e-5) {
            const inv = length / dist;
            anchor2.x = dx * inv;
            anchor2.y = dy * inv;
            anchor2.z = dz * inv;
          } else {
            anchor2.y = length;
          }
        }
        return RAPIER.JointData.spherical(anchor1, anchor2);
      }
      case 'spring': {
        const restLength = Math.max(0, p?.restLength ?? anchor.distance ?? 1);
        const stiffness = p?.stiffness ?? 120;
        const damping = p?.damping ?? 8;
        return RAPIER.JointData.spring(restLength, stiffness, damping, anchor1, anchor2);
      }
      case 'static':
      case 'translation': {
        return RAPIER.JointData.fixed(anchor1, { x: 0, y: 0, z: 0, w: 1 }, anchor2, {
          x: 0,
          y: 0,
          z: 0,
          w: 1
        });
      }
      default:
        return null;
    }
  }
}
