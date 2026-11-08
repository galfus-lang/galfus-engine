import type {
  KeyboardEvent,
  PointerButton,
  PointerEvent,
  ScrollDelta,
  WindowEvent
} from '@galfus/transport-types';
import type { Component } from '../ecs/component';
import type { MultiverseCoordinator } from '../multiverse/coordinator';
import type { PresentationConnection, WindowPresentation } from '../multiverse/presentation-graph';
import { Realm2D } from '../realm2d/realm';
import { Realm3D } from '../realm3d/realm';
import type { Model2DComponent, Svg2DComponent } from '../realm2d/components';
import type { Model3DComponent } from '../realm3d/components';
import {
  type Collider2DComponent,
  type Collider3DComponent,
  getColliderEntries
} from '../collision/components';
import { vec3 } from '../math';
import { DebugLatencyTracker } from '../debug/latency-tracker';
import { InteractiveListener } from './listener';
import {
  type CameraSnapshot2D,
  captureCameras2D,
  pointerToWorld2D,
  TargetSnapshot2D
} from './snapshot2d';
import {
  type CameraSnapshot3D,
  captureCameras3D,
  pointerToRay3D,
  TargetSnapshot3D
} from './snapshot3d';
import type { InteractiveEventType, InteractiveObserver, InteractiveTarget } from './types';

interface TargetRecord {
  listener: InteractiveListener;
  realm: Realm2D | Realm3D;
  entityId: number;
  model: Model2DComponent | Model3DComponent;
  component: Component;
  snapshot: TargetSnapshot2D | TargetSnapshot3D;
}
interface PointerState {
  event: PointerEvent;
  hover?: InteractiveListener;
  pressed: Map<PointerButton | number, InteractiveListener>;
  positions: Map<InteractiveListener, [number, number]>;
  uvs: Map<InteractiveListener, [number, number]>;
}
interface RealmState {
  realm: Realm2D | Realm3D;
  cameras2D: CameraSnapshot2D[];
  cameras3D: CameraSnapshot3D[];
  records: Set<TargetRecord>;
}

/** Host-side pointer dispatch against the most recently submitted presentation. */
export class InteractiveSystem {
  private readonly records = new Map<InteractiveListener, TargetRecord>();
  private readonly realms = new Map<number, RealmState>();
  private readonly pointers = new Map<number, Map<number, PointerState>>();
  private readonly observers = new Set<InteractiveObserver>();
  private readonly worldPoint: [number, number] = [0, 0];
  private readonly rayOrigin = vec3.create();
  private readonly rayDirection = vec3.create();

  constructor(private readonly multiverse: MultiverseCoordinator) {}

  /** Registers an external observer to receive interaction lifecycle callbacks. */
  observe(observer: InteractiveObserver): () => void {
    this.observers.add(observer);
    return () => void this.observers.delete(observer);
  }

  /** @internal */
  usesRealm(realmId: number): boolean {
    return this.realms.has(realmId);
  }

  /** Returns the first directly presented invocation order for a registered, visible target. */
  presentationOrder(listener: InteractiveListener, windowId: number): number | undefined {
    const record = this.records.get(listener);
    const view = this.multiverse.presentationGraph.getWindow(windowId);
    const state = this.realms.get(listener.realmId);
    if (!record?.snapshot.valid || !view || !state || record.realm.isDisposed) return undefined;
    if (
      record.realm.world.getComponent(record.entityId, record.model.type) !== record.model ||
      record.realm.world.getComponent(record.entityId, record.component.type) !== record.component
    )
      return undefined;
    let order = 0;
    const visited = new Set<number>();
    const traverse = (targetId: number, depth: number): number | undefined => {
      if (depth > 3 || visited.has(targetId)) return undefined;
      visited.add(targetId);
      for (const id of view.getInvocations(targetId)) {
        const invocation = view.getInvocation(id);
        if (invocation?.realmId === listener.realmId) {
          const cameras = record.realm instanceof Realm2D ? state.cameras2D : state.cameras3D;
          const slot = invocation.cameraSlot;
          for (const camera of cameras) {
            if (camera.slot === (slot ?? 0) || (slot !== undefined && camera.id === slot))
              return order;
          }
        }
        order++;
        if (depth < 3) {
          for (const conn of view.connections) {
            if (conn.realmId === invocation?.realmId && !visited.has(conn.sourceTargetId)) {
              const isCut = view.softCutEdges.some(
                ([src, dst]) => src === conn.sourceTargetId && dst === targetId
              );
              if (!isCut) {
                const found = traverse(conn.sourceTargetId, depth + 1);
                if (found !== undefined) return found;
              }
            }
          }
        }
      }
      return undefined;
    };
    for (const targetId of view.rootTargetIds) {
      const found = traverse(targetId, 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  /** @internal Current hit for an already processed pointer event. */
  hovered(windowId: number, pointerId: number): InteractiveListener | undefined {
    return this.pointers.get(windowId)?.get(pointerId)?.hover;
  }

  interactive(realmId: number, input: InteractiveTarget): InteractiveListener {
    const realm = this.multiverse.getRealm(realmId);
    if (!(realm instanceof Realm2D || realm instanceof Realm3D) || realm.isDisposed)
      throw new Error(`Interactive realm ${realmId} is not registered.`);
    let entityId: number | undefined;
    let component: Component | undefined;
    let resolvedColliderId: number | undefined;
    if (input.type === 'collider') {
      entityId = input.entityId;
      const colliderType = realm instanceof Realm2D ? 'Collider2D' : 'Collider3D';
      const collider = realm.world.getComponent<Collider2DComponent | Collider3DComponent>(
        entityId,
        colliderType
      );
      if (!collider) throw new Error(`Interactive entity requires a ${colliderType} component.`);
      let count = 0;
      let matches = false;
      for (const entry of getColliderEntries(collider as Collider2DComponent)) {
        count++;
        resolvedColliderId = entry.colliderId;
        if (entry.colliderId === input.colliderId) matches = true;
      }
      if (input.colliderId === undefined && count !== 1)
        throw new Error('Specify colliderId when an entity does not have exactly one collider.');
      if (input.colliderId !== undefined && !matches)
        throw new Error('Interactive collider does not exist.');
      component = collider;
    } else {
      if (!(realm instanceof Realm2D)) throw new Error('Interactive SVG requires a Realm2D.');
      for (const id of realm.world.query('Svg2D')) {
        const svg = realm.world.getComponent<Svg2DComponent>(id, 'Svg2D');
        if (svg?.svgId === input.svgId) {
          entityId = id;
          component = svg;
          break;
        }
      }
      if (entityId === undefined || !component) throw new Error('Interactive SVG does not exist.');
    }
    const modelType = realm instanceof Realm2D ? 'Model2D' : 'Model3D';
    const model = realm.world.getComponent<Model2DComponent | Model3DComponent>(
      entityId!,
      modelType
    );
    if (!model) throw new Error(`Interactive target requires a ${modelType} component.`);
    const target: InteractiveTarget = Object.freeze(
      input.type === 'collider'
        ? { ...input, colliderId: input.colliderId ?? resolvedColliderId }
        : { ...input }
    );
    const listener = new InteractiveListener(realmId, target, (value) => this.remove(value));
    const previous = this.realms.get(realmId);
    if (previous && previous.realm !== realm) {
      for (const old of previous.records) old.listener.dispose();
    }
    const record = {
      listener,
      realm,
      entityId: entityId!,
      model,
      component: component!,
      snapshot: realm instanceof Realm2D ? new TargetSnapshot2D() : new TargetSnapshot3D()
    };
    this.records.set(listener, record);
    let state = this.realms.get(realmId);
    if (!state) {
      state = { realm, cameras2D: [], cameras3D: [], records: new Set() };
      this.realms.set(realmId, state);
    }
    state.records.add(record);
    return listener;
  }

  private remove(listener: InteractiveListener): void {
    const record = this.records.get(listener);
    if (!record) return;
    this.records.delete(listener);
    const realmState = this.realms.get(record.realm.realmId);
    realmState?.records.delete(record);
    for (const pointers of this.pointers.values())
      for (const pointer of pointers.values()) {
        pointer.positions.delete(listener);
        pointer.uvs.delete(listener);
        if (pointer.hover === listener) pointer.hover = undefined;
        for (const [button, pressed] of pointer.pressed)
          if (pressed === listener) pointer.pressed.delete(button);
      }
    if (!realmState?.records.size) this.realms.delete(record.realm.realmId);
    if (!this.records.size) this.pointers.clear();
  }

  /** Captures state only after a successful dispatch. */
  afterDispatch(): void {
    if (!this.records.size) {
      for (const observer of this.observers) observer.onAfterDispatch?.();
      return;
    }
    let removed: TargetRecord[] | undefined;
    for (const state of this.realms.values())
      if (!state.realm.isDisposed) {
        if (state.realm instanceof Realm2D) captureCameras2D(state.realm, state.cameras2D);
        else captureCameras3D(state.realm, state.cameras3D);
      }
    for (const record of this.records.values()) {
      const { realm, entityId, component, model, snapshot, listener } = record;
      if (
        realm.isDisposed ||
        realm.world.getComponent(entityId, model.type) !== model ||
        realm.world.getComponent(entityId, component.type) !== component
      ) {
        snapshot.valid = false;
        (removed ??= []).push(record);
        continue;
      }
      if (snapshot instanceof TargetSnapshot2D && realm instanceof Realm2D)
        snapshot.capture(realm, entityId, listener.target);
      else if (
        snapshot instanceof TargetSnapshot3D &&
        realm instanceof Realm3D &&
        listener.target.type === 'collider'
      )
        snapshot.capture(realm, entityId, listener.target.colliderId);
      if (listener.target.type === 'collider' && !snapshot.exists) (removed ??= []).push(record);
    }
    if (removed) {
      for (const record of removed) {
        for (const pointers of this.pointers.values()) {
          for (const pointer of pointers.values()) {
            let pressed = false;
            for (const [button, listener] of pointer.pressed) {
              if (listener === record.listener) {
                pointer.pressed.delete(button);
                pressed = true;
              }
            }
            if (pressed) this.emit(record.listener, 'cancel', pointer);
          }
        }
      }
    }
    for (const pointers of this.pointers.values())
      for (const pointer of pointers.values()) this.updateHover(pointer);
    if (removed) for (const record of removed) record.listener.dispose();
    for (const observer of this.observers) observer.onAfterDispatch?.();
  }

  private pick(event: PointerEvent):
    | {
        listener: InteractiveListener;
        localPos?: [number, number];
        uv: [number, number];
      }
    | undefined {
    const view = this.multiverse.presentationGraph.getWindow(event.windowId);
    if (!view) return;
    const visited = new Set<number>();
    const localPos: [number, number] = [0, 0];
    const uv: [number, number] = [0.5, 0.5];
    for (let r = view.rootTargetIds.length - 1; r >= 0; r--) {
      const rootId = view.rootTargetIds[r]!;
      visited.add(rootId);
      const hit = this.pickInTarget(view, rootId, event.position, 1, visited, localPos, uv);
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
    outUv: [number, number]
  ): { listener: InteractiveListener; transformed: boolean } | undefined {
    const ids = view.getInvocations(targetId);
    for (let i = ids.length - 1; i >= 0; i--) {
      const invocation = view.getInvocation(ids[i]!)!;
      const realm = this.realms.get(invocation.realmId);
      if (!realm || realm.realm.isDisposed) continue;
      const slot = invocation.cameraSlot;
      const cameras = realm.realm instanceof Realm2D ? realm.cameras2D : realm.cameras3D;
      let camera: CameraSnapshot2D | CameraSnapshot3D | undefined;
      for (const item of cameras)
        if (item.slot === (slot ?? 0) || (slot !== undefined && item.id === slot)) {
          camera = item;
          break;
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
          const a = record.snapshot,
            b = best?.snapshot as TargetSnapshot2D | undefined;
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
                innerUv
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

  private emit(
    listener: InteractiveListener | undefined,
    type: InteractiveEventType,
    pointer: PointerState,
    scrollDelta?: ScrollDelta
  ): void {
    if (listener?.hasListeners(type)) {
      const localPos = pointer.positions.get(listener);
      const uv = pointer.uvs.get(listener);
      const ev = pointer.event;
      const p =
        localPos && (localPos[0] !== ev.position[0] || localPos[1] !== ev.position[1])
          ? { ...ev, position: [localPos[0], localPos[1]] as [number, number] }
          : ev;
      listener.emit({
        type,
        realmId: listener.realmId,
        target: listener.target,
        pointer: p,
        uv: uv ? [uv[0], uv[1]] : undefined,
        scrollDelta
      });
    }
  }

  private prunePointerCache(pointer: PointerState, listener: InteractiveListener): void {
    for (const pressed of pointer.pressed.values()) {
      if (pressed === listener) return;
    }
    pointer.positions.delete(listener);
    pointer.uvs.delete(listener);
  }

  private updateHover(pointer: PointerState): void {
    const hit = this.pick(pointer.event);
    const next = hit?.listener;
    if (hit) {
      pointer.uvs.set(hit.listener, hit.uv);
      if (hit.localPos) pointer.positions.set(hit.listener, hit.localPos);
      else pointer.positions.delete(hit.listener);
    }
    if (next === pointer.hover) return;
    const previous = pointer.hover;
    pointer.hover = next;
    if (previous) {
      this.emit(previous, 'leave', pointer);
      this.prunePointerCache(pointer, previous);
    }
    if (next && pointer.hover === next) {
      DebugLatencyTracker.recordHover(DebugLatencyTracker.currentFrameId, next.target);
      this.emit(next, 'hover', pointer);
    }
  }

  handleWindow(event: WindowEvent): void {
    for (const observer of this.observers) observer.onWindowEvent?.(event);
  }

  handleKeyboard(event: KeyboardEvent): void {
    for (const observer of this.observers) observer.onKeyboardEvent?.(event);
  }

  handle(event: PointerEvent): void {
    if (this.records.size) {
      let window = this.pointers.get(event.windowId);
      if (!window) this.pointers.set(event.windowId, (window = new Map()));
      let pointer = window.get(event.pointerId);
      if (!pointer)
        window.set(
          event.pointerId,
          (pointer = { event, pressed: new Map(), positions: new Map(), uvs: new Map() })
        );
      pointer.event = event;
      if (event.type === 'leave' || event.type === 'cancel') {
        this.cancel(pointer);
        window.delete(event.pointerId);
        if (!window.size) this.pointers.delete(event.windowId);
      } else {
        this.updateHover(pointer);
        if (event.type === 'move') {
          this.emit(pointer.hover, 'move', pointer);
          this.emitPressed(pointer, 'pressmove');
        } else if (event.type === 'scroll') {
          this.emit(pointer.hover, 'scroll', pointer, event.delta);
        } else if (event.type === 'button') {
          const button = typeof event.button === 'string' ? event.button : event.button.other;
          if (event.state === 'pressed') {
            if (pointer.hover) pointer.pressed.set(button, pointer.hover);
            this.emit(pointer.hover, 'down', pointer);
          } else {
            const pressed = pointer.pressed.get(button);
            pointer.pressed.delete(button);
            this.emit(pointer.hover, 'up', pointer);
            this.emit(pressed, 'pressup', pointer);
            if (pressed && pressed === pointer.hover) this.emit(pressed, 'click', pointer);
            if (pressed && pressed !== pointer.hover) this.prunePointerCache(pointer, pressed);
          }
        }
      }
    }
    for (const observer of this.observers) observer.onPointerEvent?.(event);
  }

  private cancel(pointer: PointerState): void {
    this.emitPressed(pointer, 'cancel');
    pointer.pressed.clear();
    this.emit(pointer.hover, 'leave', pointer);
    pointer.positions.clear();
    pointer.uvs.clear();
    pointer.hover = undefined;
  }

  /** Delivers once per listener even when several pointer buttons are pressed. */
  private emitPressed(pointer: PointerState, type: 'pressmove' | 'cancel'): void {
    const seen = new Set<InteractiveListener>();
    for (const listener of pointer.pressed.values()) {
      if (!seen.has(listener)) {
        seen.add(listener);
        this.emit(listener, type, pointer);
      }
    }
  }

  windowClosed(windowId: number): void {
    const window = this.pointers.get(windowId);
    if (window) {
      this.pointers.delete(windowId);
      for (const pointer of window.values()) this.cancel(pointer);
    }
    for (const observer of this.observers) observer.onWindowClosed?.(windowId);
  }

  dispose(): void {
    for (const id of [...this.pointers.keys()]) this.windowClosed(id);
    for (const listener of [...this.records.keys()]) listener.dispose();
    this.realms.clear();
    for (const observer of [...this.observers]) observer.onDispose?.();
  }
}
