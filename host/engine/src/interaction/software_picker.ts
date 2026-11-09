import type { PointerEvent } from '@galfus/transport-types';
import { vec3 } from '../math';
import type { MultiverseCoordinator } from '../multiverse/coordinator';
import type { PresentationConnection, WindowPresentation } from '../multiverse/presentation-graph';
import { Realm2D } from '../realm2d/realm';
import type { InteractiveListener } from './listener';
import { type CameraSnapshot2D, pointerToWorld2D, TargetSnapshot2D } from './snapshot2d';
import { type CameraSnapshot3D, pointerToRay3D, TargetSnapshot3D } from './snapshot3d';
import type { RealmState, TargetRecord } from './types_internal';

export interface PickHit {
  listener: InteractiveListener;
  localPos?: [number, number];
  uv: [number, number];
}

/** Fallback software picker for headless tests or platforms without native pick dispatch. */
export class SoftwarePicker {
  private readonly worldPoint: [number, number] = [0, 0];
  private readonly rayOrigin = vec3.create();
  private readonly rayDirection = vec3.create();

  constructor(private readonly multiverse: MultiverseCoordinator) {}

  pick(event: PointerEvent, realms: Map<number, RealmState>): PickHit | undefined {
    const view = this.multiverse.presentationGraph.getWindow(event.windowId);
    if (!view) return undefined;
    const visited = new Set<number>();
    const localPos: [number, number] = [0, 0];
    const uv: [number, number] = [0.5, 0.5];
    for (let r = view.rootTargetIds.length - 1; r >= 0; r--) {
      const rootId = view.rootTargetIds[r]!;
      visited.add(rootId);
      const hit = this.pickInTarget(view, rootId, event.position, 1, visited, localPos, uv, realms);
      visited.delete(rootId);
      if (hit) {
        return {
          listener: hit.listener,
          localPos: hit.transformed ? [localPos[0], localPos[1]] : undefined,
          uv: [uv[0], uv[1]]
        };
      }
    }
    return undefined;
  }

  private pickInTarget(
    view: WindowPresentation,
    targetId: number,
    position: [number, number],
    depth: number,
    visitedTargets: Set<number>,
    outLocalPos: [number, number],
    outUv: [number, number],
    realms: Map<number, RealmState>
  ): { listener: InteractiveListener; transformed: boolean } | undefined {
    const ids = view.getInvocations(targetId);
    for (let i = ids.length - 1; i >= 0; i--) {
      const invocation = view.getInvocation(ids[i]!)!;
      const realm = realms.get(invocation.realmId);
      if (!realm || realm.realm.isDisposed) continue;
      const slot = invocation.cameraSlot;
      const cameras = realm.realm instanceof Realm2D ? realm.cameras2D : realm.cameras3D;
      let camera: CameraSnapshot2D | CameraSnapshot3D | undefined;
      for (const item of cameras) {
        if (item.slot === (slot ?? 0) || (slot !== undefined && item.id === slot)) {
          camera = item;
          break;
        }
      }
      if (!camera) continue;
      let best: TargetRecord | undefined;
      let closest = Infinity;
      let maxDistance: number | undefined;
      const bestUv: [number, number] = [0.5, 0.5];
      const currentUv: [number, number] = [0.5, 0.5];

      if (realm.realm instanceof Realm2D) {
        if (
          !pointerToWorld2D(
            this.worldPoint,
            position[0],
            position[1],
            invocation.resolvedViewport,
            camera as CameraSnapshot2D
          )
        )
          continue;
      } else {
        maxDistance = pointerToRay3D(
          this.rayOrigin,
          this.rayDirection,
          position[0],
          position[1],
          invocation.resolvedViewport,
          camera as CameraSnapshot3D
        );
        if (maxDistance === undefined) continue;
      }

      for (const record of realm.records) {
        if (
          record.realm !== realm.realm ||
          record.realm.world.getComponent(record.entityId, record.model.type) !== record.model ||
          record.realm.world.getComponent(record.entityId, record.component.type) !==
            record.component
        )
          continue;

        if (record.snapshot instanceof TargetSnapshot3D && maxDistance !== undefined) {
          const distance = record.snapshot.distance(
            this.rayOrigin,
            this.rayDirection,
            maxDistance,
            currentUv
          );
          if (distance !== undefined && distance < closest) {
            closest = distance;
            best = record;
            bestUv[0] = currentUv[0];
            bestUv[1] = currentUv[1];
          }
        } else if (
          record.snapshot instanceof TargetSnapshot2D &&
          record.snapshot.contains(this.worldPoint, record.listener.target, currentUv)
        ) {
          const a = record.snapshot;
          const b = best?.snapshot as TargetSnapshot2D | undefined;
          const camera2d = camera as CameraSnapshot2D;
          const d = 10 - a.zLayer;
          if (d < camera2d.near || d > camera2d.far) continue;
          if (
            !b ||
            a.zLayer > b.zLayer ||
            (a.zLayer === b.zLayer &&
              (a.drawOrder > b.drawOrder ||
                (a.drawOrder === b.drawOrder && a.resourceId > b.resourceId)))
          ) {
            best = record;
            bestUv[0] = currentUv[0];
            bestUv[1] = currentUv[1];
          }
        }
      }

      if (best) {
        if (depth < 3) {
          let connection: PresentationConnection | undefined;
          for (const conn of view.connections) {
            if (conn.realmId === best.realm.realmId && conn.entityId === best.entityId) {
              connection = conn;
              break;
            }
          }
          if (connection && !visitedTargets.has(connection.sourceTargetId)) {
            const isCut = view.softCutEdges.some(
              ([src, dst]) => src === connection!.sourceTargetId && dst === targetId
            );
            if (!isCut) {
              const targetDesc = this.multiverse.getTarget(connection.sourceTargetId);
              const tw = targetDesc?.kind.type === 'texture' ? targetDesc.kind.width : 1;
              const th = targetDesc?.kind.type === 'texture' ? targetDesc.kind.height : 1;
              const nextPos: [number, number] = [bestUv[0] * tw, bestUv[1] * th];
              visitedTargets.add(connection.sourceTargetId);
              const innerPos: [number, number] = [0, 0];
              const innerUv: [number, number] = [0.5, 0.5];
              const inner = this.pickInTarget(
                view,
                connection.sourceTargetId,
                nextPos,
                depth + 1,
                visitedTargets,
                innerPos,
                innerUv,
                realms
              );
              visitedTargets.delete(connection.sourceTargetId);
              if (inner) {
                outLocalPos[0] = innerPos[0];
                outLocalPos[1] = innerPos[1];
                outUv[0] = innerUv[0];
                outUv[1] = innerUv[1];
                return { listener: inner.listener, transformed: true };
              }
            }
          }
        }
        outLocalPos[0] = position[0];
        outLocalPos[1] = position[1];
        outUv[0] = bestUv[0];
        outUv[1] = bestUv[1];
        return { listener: best.listener, transformed: depth > 1 };
      }
    }
    return undefined;
  }
}
