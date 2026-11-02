import type { PointerButton, PointerEvent } from '@galfus/transport-types';
import type { Component } from '../ecs/component';
import type { MultiverseCoordinator } from '../multiverse/coordinator';
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
import type { InteractiveEventType, InteractiveTarget } from './types';

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
  private readonly worldPoint: [number, number] = [0, 0];
  private readonly rayOrigin = vec3.create();
  private readonly rayDirection = vec3.create();

  constructor(private readonly multiverse: MultiverseCoordinator) {}

  /** @internal */
  usesRealm(realmId: number): boolean {
    return this.realms.has(realmId);
  }

  interactive(realmId: number, input: InteractiveTarget): InteractiveListener {
    let realm: Realm2D | Realm3D | undefined;
    for (const candidate of this.multiverse.getRealms())
      if (
        candidate.realmId === realmId &&
        (candidate instanceof Realm2D || candidate instanceof Realm3D)
      ) {
        realm = candidate;
        break;
      }
    if (!realm || realm.isDisposed)
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
    if (!state)
      this.realms.set(
        realmId,
        (state = { realm, cameras2D: [], cameras3D: [], records: new Set() })
      );
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
        if (pointer.hover === listener) pointer.hover = undefined;
        for (const [button, pressed] of pointer.pressed)
          if (pressed === listener) pointer.pressed.delete(button);
      }
    if (!realmState?.records.size) this.realms.delete(record.realm.realmId);
    if (!this.records.size) this.pointers.clear();
  }

  /** Captures state only after a successful dispatch. */
  afterDispatch(): void {
    if (!this.records.size) return;
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
    }
    for (const pointers of this.pointers.values())
      for (const pointer of pointers.values()) this.updateHover(pointer);
  }

  private pick(event: PointerEvent): InteractiveListener | undefined {
    const view = this.multiverse.presentationGraph.getWindow(event.windowId);
    if (!view) return;
    for (let r = view.rootTargetIds.length - 1; r >= 0; r--) {
      const ids = view.getInvocations(view.rootTargetIds[r]!);
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
        if (realm.realm instanceof Realm2D) {
          if (
            !pointerToWorld2D(
              this.worldPoint,
              event.position[0],
              event.position[1],
              invocation.resolvedViewport,
              camera as CameraSnapshot2D
            )
          )
            continue;
        } else {
          maxDistance = pointerToRay3D(
            this.rayOrigin,
            this.rayDirection,
            event.position[0],
            event.position[1],
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
              maxDistance
            );
            if (distance !== undefined && distance < closest) {
              closest = distance;
              best = record;
            }
          } else if (
            record.snapshot instanceof TargetSnapshot2D &&
            record.snapshot.contains(this.worldPoint, record.listener.target)
          ) {
            const a = record.snapshot,
              b = best?.snapshot as TargetSnapshot2D | undefined;
            const camera2d = camera as CameraSnapshot2D;
            const depth = 10 - a.zLayer;
            if (depth < camera2d.near || depth > camera2d.far) continue;
            if (
              !b ||
              a.zLayer > b.zLayer ||
              (a.zLayer === b.zLayer &&
                (a.drawOrder > b.drawOrder ||
                  (a.drawOrder === b.drawOrder && a.resourceId > b.resourceId)))
            )
              best = record;
          }
        }
        if (best) return best.listener;
      }
    }
  }

  private emit(
    listener: InteractiveListener | undefined,
    type: InteractiveEventType,
    pointer: PointerEvent
  ): void {
    listener?.emit({ type, realmId: listener.realmId, target: listener.target, pointer });
  }
  private updateHover(pointer: PointerState): void {
    const next = this.pick(pointer.event);
    if (next === pointer.hover) return;
    const previous = pointer.hover;
    pointer.hover = next;
    this.emit(previous, 'leave', pointer.event);
    if (pointer.hover === next) this.emit(next, 'hover', pointer.event);
  }

  handle(event: PointerEvent): void {
    if (!this.records.size) return;
    let window = this.pointers.get(event.windowId);
    if (!window) this.pointers.set(event.windowId, (window = new Map()));
    let pointer = window.get(event.pointerId);
    if (!pointer) window.set(event.pointerId, (pointer = { event, pressed: new Map() }));
    pointer.event = event;
    if (event.type === 'leave' || event.type === 'cancel') {
      this.cancel(pointer);
      window.delete(event.pointerId);
      if (!window.size) this.pointers.delete(event.windowId);
      return;
    }
    this.updateHover(pointer);
    if (event.type === 'move') this.emit(pointer.hover, 'move', event);
    if (event.type === 'button') {
      const button = typeof event.button === 'string' ? event.button : event.button.other;
      if (event.state === 'pressed') {
        if (pointer.hover) pointer.pressed.set(button, pointer.hover);
        this.emit(pointer.hover, 'down', event);
      } else {
        const pressed = pointer.pressed.get(button);
        pointer.pressed.delete(button);
        this.emit(pointer.hover, 'up', event);
        if (pressed && pressed === pointer.hover) this.emit(pressed, 'click', event);
      }
    }
  }
  private cancel(pointer: PointerState): void {
    for (const listener of new Set(pointer.pressed.values()))
      this.emit(listener, 'cancel', pointer.event);
    pointer.pressed.clear();
    this.emit(pointer.hover, 'leave', pointer.event);
    pointer.hover = undefined;
  }
  windowClosed(windowId: number): void {
    const window = this.pointers.get(windowId);
    if (!window) return;
    this.pointers.delete(windowId);
    for (const pointer of window.values()) this.cancel(pointer);
  }
  dispose(): void {
    for (const id of this.pointers.keys()) this.windowClosed(id);
    for (const listener of this.records.keys()) listener.dispose();
    this.realms.clear();
  }
}
