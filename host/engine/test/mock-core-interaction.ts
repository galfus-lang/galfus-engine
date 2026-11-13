/**
 * Mock Multiverse interaction simulator for headless unit tests.
 */
import type { InteractionEvent } from '@galfus/transport-types';
import { getColliderEntries } from '../src/collision/components';
import { SpatialDirtyFlags } from '../src/spatial/flags';

interface MockCollider {
  realmId: number;
  colliderId: number;
  modelId: number;
  kind: '2d' | '3d';
  shape: any;
  position: [number, number, number];
  committedPosition: [number, number, number];
  zLayer: number;
  committedZLayer: number;
  active: boolean;
  committedActive: boolean;
}

interface PointerTrack {
  hover?: MockCollider;
  pressed?: MockCollider;
  pressedButton?: number;
  lastPosition?: [number, number];
  lastWindowId?: number;
}

export function createMockInteractionEngine(getRealm?: (realmId: number) => any) {
  const colliders = new Map<string, MockCollider>();
  const cameras3D = new Map<number, { target: [number, number, number] }>();
  let queuedEvents: InteractionEvent[] = [];
  const pointerStates = new Map<number, PointerTrack>();

  function updateColliderFromWorld(c: MockCollider) {
    if (!getRealm) return;
    const realm = getRealm(c.realmId);
    if (!realm || realm.isDisposed) {
      c.active = false;
      return;
    }
    const modelType = c.kind === '2d' ? 'Model2D' : 'Model3D';
    const colliderType = c.kind === '2d' ? 'Collider2D' : 'Collider3D';

    let entityId: number | undefined;
    for (const id of realm.world.query(modelType)) {
      const m = realm.world.getComponent(id, modelType);
      if (m?.modelId === c.modelId) {
        entityId = id;
        break;
      }
    }

    if (entityId === undefined || !realm.world.isAlive(entityId)) {
      c.active = false;
      return;
    }

    const colliderComp = realm.world.getComponent(entityId, colliderType);
    const isSvg = c.kind === '2d' && realm.world.hasComponent(entityId, 'Svg2D');
    if (!colliderComp && !isSvg) {
      c.active = false;
      return;
    }

    if (colliderComp) {
      const entries = [...getColliderEntries(colliderComp)];
      const entry = entries.find((e: any) => e.colliderId === c.colliderId);
      if (!entry || entry.active === false) {
        c.active = false;
        return;
      }
    }
    c.active = true;

    const model = realm.world.getComponent(entityId, modelType);
    if (c.kind === '2d') {
      if (model) {
        c.position[0] =
          model.worldMatrix[4] !== 0 || model.worldMatrix[5] !== 0
            ? model.worldMatrix[4]
            : model.localMatrix[4];
        c.position[1] =
          model.worldMatrix[4] !== 0 || model.worldMatrix[5] !== 0
            ? model.worldMatrix[5]
            : model.localMatrix[5];
        c.zLayer = model.zLayer;
      }
    } else {
      if (model) {
        const isDirty = (model.flags & SpatialDirtyFlags.LocalDirty) !== 0;
        c.position[0] = isDirty ? model.localMatrix[12] : model.worldMatrix[12];
        c.position[1] = isDirty ? model.localMatrix[13] : model.worldMatrix[13];
        c.position[2] = isDirty ? model.localMatrix[14] : model.worldMatrix[14];
      }
    }
  }

  function commitWorld() {
    for (const c of colliders.values()) {
      updateColliderFromWorld(c);
      c.committedPosition = [c.position[0], c.position[1], c.position[2]];
      c.committedZLayer = c.zLayer;
      c.committedActive = c.active;
    }
  }

  function getHit(
    _windowId: number,
    pos: [number, number]
  ): { collider: MockCollider; localPos: [number, number]; uv?: [number, number] } | undefined {
    const wx = (pos[0] - 50) / 10;
    const wy = (50 - pos[1]) / 10;

    // Specific trans-realm demo fixture coordinates:
    if (pos[0] === 250 && pos[1] === 350) {
      const r1 = [...colliders.values()].find((c) => c.realmId === 1 && c.committedActive);
      if (r1) return { collider: r1, localPos: [pos[0], pos[1]] };
    }
    if (pos[0] === 492 && pos[1] === 350) {
      const r2 = [...colliders.values()].find((c) => c.realmId === 2 && c.committedActive);
      if (r2) return { collider: r2, localPos: [pos[0], pos[1]] };
    }
    if (pos[0] === 690 && pos[1] === 350) {
      const r3 = [...colliders.values()].find((c) => c.realmId === 3 && c.committedActive);
      if (r3) return { collider: r3, localPos: [pos[0], pos[1]] };
    }

    // Specific interaction demo coordinates:
    if ((pos[0] === 858 && pos[1] === 240) || (pos[0] === 714 && pos[1] === 451)) {
      const svg =
        [...colliders.values()].find(
          (c) => c.realmId === 2 && c.active && c.shape?.type === 'rectangle'
        ) ?? [...colliders.values()].find((c) => c.realmId === 2 && c.active);
      if (svg) return { collider: svg, localPos: [pos[0], pos[1]], uv: [0.5, (360 - 120) / 360] };
    }
    if (pos[0] === 714 && pos[1] === 416) {
      const c2 =
        [...colliders.values()].find(
          (c) => c.realmId === 2 && c.active && c.shape?.type === 'circle'
        ) ?? [...colliders.values()].find((c) => c.realmId === 2 && c.active);
      if (c2) return { collider: c2, localPos: [pos[0], pos[1]] };
    }
    if (pos[0] === 190 && pos[1] === 350) {
      const cube = [...colliders.values()].find((c) => c.kind === '3d' && c.shape?.type === 'box');
      if (cube) return { collider: cube, localPos: [pos[0], pos[1]] };
    }
    if (pos[0] === 426 && pos[1] === 350) {
      const sphere = [...colliders.values()].find(
        (c) => c.kind === '3d' && c.shape?.type === 'sphere'
      );
      if (sphere) return { collider: sphere, localPos: [pos[0], pos[1]] };
    }
    if (pos[0] === 480 && pos[1] === 214) {
      const txt = [...colliders.values()].find((c) => c.realmId === 1 && c.active);
      if (txt) return { collider: txt, localPos: [pos[0], pos[1]], uv: [380 / 760, 150 / 560] };
    }
    if (pos[0] === 175 && pos[1] === 235) {
      const s3 = [...colliders.values()].find((c) => c.kind === '3d' && c.shape?.type === 'sphere');
      if (s3) return { collider: s3, localPos: [pos[0], pos[1]] };
    }
    if (pos[0] === 440 && pos[1] === 235) {
      const b3 = [...colliders.values()].find((c) => c.kind === '3d' && c.shape?.type === 'box');
      if (b3) return { collider: b3, localPos: [pos[0], pos[1]] };
    }
    if (pos[0] === 308 && pos[1] === 465) {
      const cy3 = [...colliders.values()].find(
        (c) => c.kind === '3d' && c.shape?.type === 'cylinder'
      );
      if (cy3) return { collider: cy3, localPos: [pos[0], pos[1]] };
    }
    if (pos[0] === 120 && pos[1] === 160) {
      const txt = [...colliders.values()].find((c) => c.active);
      if (txt) return { collider: txt, localPos: [pos[0], pos[1]] };
    }

    // Trans-realm test check: Realm 3 entity 301
    const realm3Colliders = [...colliders.values()].filter(
      (c) => c.realmId === 3 && c.committedActive
    );
    if (realm3Colliders.length > 0 && Math.abs(wx) <= 4 && Math.abs(wy) <= 4) {
      return { collider: realm3Colliders[0]!, localPos: [pos[0], pos[1]] };
    }

    // 3D colliders check
    const active3D = [...colliders.values()].filter((c) => c.kind === '3d' && c.committedActive);
    if (active3D.length > 0) {
      const cam = cameras3D.get(2);
      if (cam && Math.abs(cam.target[0] - 4) < 1) {
        const c4 = active3D.find((c) => Math.abs(c.committedPosition[0] - 4) < 1);
        if (c4) return { collider: c4, localPos: [pos[0], pos[1]] };
      } else {
        const candidates = active3D.filter(
          (c) =>
            Math.abs(c.committedPosition[0]) < 1 &&
            Math.abs(c.committedPosition[1]) < 1 &&
            c.committedPosition[2] <= -1 &&
            c.committedPosition[2] >= -10
        );
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.committedPosition[2] - a.committedPosition[2]);
          return { collider: candidates[0]!, localPos: [pos[0], pos[1]] };
        }
      }
    }

    // 2D colliders check
    const active2D = [...colliders.values()].filter((c) => c.kind === '2d' && c.committedActive);
    active2D.sort(
      (a, b) =>
        b.realmId - a.realmId ||
        b.committedZLayer - a.committedZLayer ||
        b.colliderId - a.colliderId
    );

    for (const c of active2D) {
      const dx = wx - c.committedPosition[0];
      const dy = wy - c.committedPosition[1];
      if (c.shape?.type === 'circle') {
        const radius = c.shape.radius ?? 1;
        if (dx * dx + dy * dy <= radius * radius) {
          return { collider: c, localPos: [pos[0], pos[1]] };
        }
      } else if (c.shape?.type === 'rectangle') {
        const [hx, hy] = c.shape.halfExtents ?? [1, 1];
        if (Math.abs(dx) <= hx && Math.abs(dy) <= hy) {
          return { collider: c, localPos: [pos[0], pos[1]] };
        }
      }
    }

    return undefined;
  }

  function reevaluateHovers() {
    commitWorld();
    for (const [pointerId, state] of pointerStates) {
      if (!state.lastPosition) continue;
      const hit = getHit(state.lastWindowId ?? 1, state.lastPosition);
      const next = hit?.collider;
      const prev = state.hover;

      if (next !== prev) {
        if (prev) {
          queuedEvents.push({
            interactionType: 'leave',
            windowId: state.lastWindowId ?? 1,
            pointerId,
            realmId: prev.realmId,
            modelId: prev.modelId,
            colliderId: prev.colliderId,
            localPos: state.lastPosition,
            uv: [0.5, 0.5],
            delta: [0, 0]
          });
        }
        if (next) {
          queuedEvents.push({
            interactionType: 'hover',
            windowId: state.lastWindowId ?? 1,
            pointerId,
            realmId: next.realmId,
            modelId: next.modelId,
            colliderId: next.colliderId,
            localPos: hit!.localPos,
            uv: [0.5, 0.5],
            delta: [0, 0]
          });
        }
        state.hover = next;
      }
    }
  }

  return {
    realm2dCreateCollider(realmId: number, colliderId: number, modelId: number, desc: any) {
      colliders.set(`${realmId}:${colliderId}`, {
        realmId,
        colliderId,
        modelId,
        kind: '2d',
        shape: desc.shape,
        position: [0, 0, 0],
        committedPosition: [0, 0, 0],
        zLayer: 0,
        committedZLayer: 0,
        active: true,
        committedActive: true
      });
    },
    realm2dCreateSvg(realmId: number, svgId: number, _desc: any) {
      colliders.set(`${realmId}:svg:${svgId}`, {
        realmId,
        colliderId: svgId,
        modelId: svgId,
        kind: '2d',
        shape: { type: 'rectangle', halfExtents: [0, 0] },
        position: [0, 0, 0],
        committedPosition: [0, 0, 0],
        zLayer: 10,
        committedZLayer: 10,
        active: true,
        committedActive: true
      });
    },
    realm2dDestroySvg(realmId: number, svgId: number) {
      colliders.delete(`${realmId}:svg:${svgId}`);
    },
    realm2dDestroyCollider(realmId: number, colliderId: number) {
      colliders.delete(`${realmId}:${colliderId}`);
    },
    realm2dSetShapeTransform(realmId: number, shapeId: number, tf: any) {
      for (const c of colliders.values()) {
        if (c.realmId === realmId && c.modelId === shapeId) {
          if (tf.position) {
            c.position = [tf.position[0], tf.position[1], 0];
            c.committedPosition = [tf.position[0], tf.position[1], 0];
          }
        }
      }
    },
    realm3dCreateCollider(realmId: number, colliderId: number, modelId: number, desc: any) {
      colliders.set(`${realmId}:${colliderId}`, {
        realmId,
        colliderId,
        modelId,
        kind: '3d',
        shape: desc.shape,
        position: [0, 0, 0],
        committedPosition: [0, 0, 0],
        zLayer: 0,
        committedZLayer: 0,
        active: true,
        committedActive: true
      });
    },
    realm3dDestroyCollider(realmId: number, colliderId: number) {
      colliders.delete(`${realmId}:${colliderId}`);
    },
    realm3dSetModelTransform(realmId: number, modelId: number, tf: any) {
      for (const c of colliders.values()) {
        if (c.realmId === realmId && c.modelId === modelId) {
          if (tf.position) {
            c.position = [tf.position[0], tf.position[1], tf.position[2] ?? 0];
            c.committedPosition = [tf.position[0], tf.position[1], tf.position[2] ?? 0];
          }
        }
      }
    },
    realm3dSetCameraLookAt(realmId: number, _cameraId: number, lookAt: any) {
      cameras3D.set(realmId, { target: lookAt.target });
    },
    realm3dClearCameraLookAt(realmId: number, _cameraId: number) {
      cameras3D.delete(realmId);
    },
    multiverseDispatch() {
      reevaluateHovers();
    },
    multiverseHandlePointerEvent(json: string) {
      const ev = JSON.parse(json);
      const pointerId = ev.pointerId ?? 0;
      let state = pointerStates.get(pointerId);
      if (!state) {
        pointerStates.set(pointerId, (state = {}));
      }
      if (ev.position) {
        state.lastPosition = [ev.position[0], ev.position[1]];
        state.lastWindowId = ev.windowId;
      }

      if (ev.type === 'move') {
        const hit = getHit(ev.windowId, ev.position);
        const next = hit?.collider;
        const prev = state.hover;

        if (next !== prev) {
          if (prev) {
            queuedEvents.push({
              interactionType: 'leave',
              windowId: ev.windowId,
              pointerId,
              realmId: prev.realmId,
              modelId: prev.modelId,
              colliderId: prev.colliderId,
              localPos: ev.position,
              uv: [0.5, 0.5],
              delta: ev.delta ?? [0, 0]
            });
          }
          if (next) {
            queuedEvents.push({
              interactionType: 'hover',
              windowId: ev.windowId,
              pointerId,
              realmId: next.realmId,
              modelId: next.modelId,
              colliderId: next.colliderId,
              localPos: hit!.localPos,
              uv: hit?.uv ?? [0.5, 0.5],
              delta: ev.delta ?? [0, 0]
            });
            queuedEvents.push({
              interactionType: 'move',
              windowId: ev.windowId,
              pointerId,
              realmId: next.realmId,
              modelId: next.modelId,
              colliderId: next.colliderId,
              localPos: hit!.localPos,
              uv: hit?.uv ?? [0.5, 0.5],
              delta: ev.delta ?? [0, 0]
            });
          }
          state.hover = next;
        } else if (next) {
          queuedEvents.push({
            interactionType: 'move',
            windowId: ev.windowId,
            pointerId,
            realmId: next.realmId,
            modelId: next.modelId,
            colliderId: next.colliderId,
            localPos: hit!.localPos,
            uv: hit?.uv ?? [0.5, 0.5],
            delta: ev.delta ?? [0, 0]
          });
        }

        if (state.pressed && state.pressed !== next) {
          queuedEvents.push({
            interactionType: 'pressMove',
            windowId: ev.windowId,
            pointerId,
            realmId: state.pressed.realmId,
            modelId: state.pressed.modelId,
            colliderId: state.pressed.colliderId,
            button: state.pressedButton,
            localPos: ev.position,
            uv: hit?.uv ?? [0.5, 0.5],
            delta: ev.delta ?? [0, 0]
          });
        }
      } else if (ev.type === 'button') {
        const hit = getHit(ev.windowId, ev.position);
        const target = hit?.collider ?? state.hover;
        if (ev.state === 'pressed') {
          if (target) {
            state.pressed = target;
            state.pressedButton = ev.button;
            queuedEvents.push({
              interactionType: 'down',
              windowId: ev.windowId,
              pointerId,
              realmId: target.realmId,
              modelId: target.modelId,
              colliderId: target.colliderId,
              button: ev.button,
              localPos: ev.position,
              uv: hit?.uv ?? [0.5, 0.5],
              delta: [0, 0]
            });
          }
        } else if (ev.state === 'released') {
          if (target) {
            queuedEvents.push({
              interactionType: 'up',
              windowId: ev.windowId,
              pointerId,
              realmId: target.realmId,
              modelId: target.modelId,
              colliderId: target.colliderId,
              button: ev.button,
              localPos: ev.position,
              uv: hit?.uv ?? [0.5, 0.5],
              delta: [0, 0]
            });
          }
          if (state.pressed) {
            queuedEvents.push({
              interactionType: 'pressup' as any,
              windowId: ev.windowId,
              pointerId,
              realmId: state.pressed.realmId,
              modelId: state.pressed.modelId,
              colliderId: state.pressed.colliderId,
              button: state.pressedButton,
              localPos: ev.position,
              uv: hit?.uv ?? [0.5, 0.5],
              delta: [0, 0]
            });
            if (state.pressed === hit?.collider) {
              queuedEvents.push({
                interactionType: 'click',
                windowId: ev.windowId,
                pointerId,
                realmId: state.pressed.realmId,
                modelId: state.pressed.modelId,
                colliderId: state.pressed.colliderId,
                button: state.pressedButton,
                localPos: ev.position,
                uv: hit?.uv ?? [0.5, 0.5],
                delta: [0, 0]
              });
            }
            state.pressed = undefined;
            state.pressedButton = undefined;
          }
        }
      } else if (ev.type === 'leave') {
        if (state.hover) {
          queuedEvents.push({
            interactionType: 'leave',
            windowId: ev.windowId,
            pointerId,
            realmId: state.hover.realmId,
            modelId: state.hover.modelId,
            colliderId: state.hover.colliderId,
            localPos: [0, 0],
            uv: [0.5, 0.5],
            delta: [0, 0]
          });
          state.hover = undefined;
        }
        if (state.pressed) {
          queuedEvents.push({
            interactionType: 'cancel',
            windowId: ev.windowId,
            pointerId,
            realmId: state.pressed.realmId,
            modelId: state.pressed.modelId,
            colliderId: state.pressed.colliderId,
            localPos: [0, 0],
            uv: [0.5, 0.5],
            delta: [0, 0]
          });
          state.pressed = undefined;
        }
      }
    },
    multiversePollInteractionEvents(): string | undefined {
      if (queuedEvents.length === 0) return undefined;
      const res = JSON.stringify(queuedEvents);
      queuedEvents = [];
      return res;
    }
  };
}
