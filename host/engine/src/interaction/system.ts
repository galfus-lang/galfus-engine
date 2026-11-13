import type {
  InteractionEvent,
  KeyboardEvent,
  PointerEvent,
  ScrollDelta,
  WindowEvent
} from '@galfus/transport-types';
import {
  type Collider2DComponent,
  type Collider3DComponent,
  getColliderEntries
} from '../collision/components';
import { DebugLatencyTracker } from '../debug/latency-tracker';
import type { Component } from '../ecs/component';
import type { MultiverseCoordinator } from '../multiverse/coordinator';
import type { Model2DComponent, Model2DUIComponent, Svg2DComponent } from '../realm2d/components';
import { Realm2D } from '../realm2d/realm';
import type { Model3DComponent } from '../realm3d/components';
import { Realm3D } from '../realm3d/realm';
import { InteractiveListener } from './listener';
import type { InteractiveEventType, InteractiveObserver, InteractiveTarget } from './types';
import type { PointerState, RealmState, TargetRecord } from './types_internal';

function toCorePointerEvent(event: PointerEvent): object | null {
  switch (event.type) {
    case 'move':
      return {
        type: 'move',
        windowId: event.windowId,
        pointerId: event.pointerId,
        position: event.position,
        delta: event.delta
      };
    case 'button': {
      let button = 0;
      if (typeof event.button === 'string') {
        if (event.button === 'secondary') button = 1;
        else if (event.button === 'auxiliary') button = 2;
        else if (event.button === 'back') button = 3;
        else if (event.button === 'forward') button = 4;
      } else {
        button = event.button.other;
      }
      return {
        type: 'button',
        windowId: event.windowId,
        pointerId: event.pointerId,
        position: event.position,
        button,
        state: event.state
      };
    }
    case 'scroll': {
      const delta: [number, number] =
        'pixels' in event.delta
          ? event.delta.pixels
          : [event.delta.lines[0] * 20, event.delta.lines[1] * 20];
      return {
        type: 'scroll',
        windowId: event.windowId,
        pointerId: event.pointerId,
        position: event.position,
        delta
      };
    }
    case 'leave':
    case 'cancel':
      return {
        type: 'leave',
        windowId: event.windowId,
        pointerId: event.pointerId
      };
    default:
      return null;
  }
}

/** Native pointer dispatch against the Multiverse interaction subsystem. */
export class InteractiveSystem {
  private readonly records = new Map<InteractiveListener, TargetRecord>();
  private readonly modelRecords = new Map<string, Set<TargetRecord>>();
  private readonly realms = new Map<number, RealmState>();
  private readonly pointers = new Map<number, Map<number, PointerState>>();
  private readonly observers = new Set<InteractiveObserver>();

  constructor(private readonly multiverse: MultiverseCoordinator) {}

  observe(observer: InteractiveObserver): () => void {
    this.observers.add(observer);
    return () => void this.observers.delete(observer);
  }

  usesRealm(realmId: number): boolean {
    return this.realms.has(realmId);
  }

  presentationOrder(listener: InteractiveListener, windowId: number): number | undefined {
    const record = this.records.get(listener);
    const view = this.multiverse.presentationGraph.getWindow(windowId);
    if (!record || !view || record.realm.isDisposed) return undefined;
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
          return order;
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
    } else if (input.type === 'svg') {
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
    } else if (input.type === 'ui') {
      if (!(realm instanceof Realm2D)) throw new Error('Interactive UI requires a Realm2D.');
      for (const id of realm.world.query('Model2DUI')) {
        const ui = realm.world.getComponent<Model2DUIComponent>(id, 'Model2DUI');
        if (ui?.uiId === input.uiId) {
          entityId = id;
          component = ui;
          break;
        }
      }
      if (entityId === undefined || !component) throw new Error('Interactive UI does not exist.');
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
    const record: TargetRecord = {
      listener,
      realm,
      entityId: entityId!,
      model,
      component: component!
    };
    this.records.set(listener, record);

    const modelKey = `${realmId}:${model.modelId}`;
    let mSet = this.modelRecords.get(modelKey);
    if (!mSet) this.modelRecords.set(modelKey, (mSet = new Set()));
    mSet.add(record);

    let state = this.realms.get(realmId);
    if (!state) {
      state = { realm, records: new Set() };
      this.realms.set(realmId, state);
    }
    state.records.add(record);
    return listener;
  }

  private remove(listener: InteractiveListener): void {
    const record = this.records.get(listener);
    if (!record) return;
    this.records.delete(listener);

    const modelKey = `${record.realm.realmId}:${record.model.modelId}`;
    const mSet = this.modelRecords.get(modelKey);
    if (mSet) {
      mSet.delete(record);
      if (!mSet.size) this.modelRecords.delete(modelKey);
    }

    const realmState = this.realms.get(record.realm.realmId);
    realmState?.records.delete(record);
    for (const pointers of this.pointers.values()) {
      for (const pointer of pointers.values()) {
        pointer.positions.delete(listener);
        pointer.uvs.delete(listener);
        if (pointer.hover === listener) pointer.hover = undefined;
        for (const [button, pressed] of pointer.pressed) {
          if (pressed === listener) pointer.pressed.delete(button);
        }
      }
    }
    if (!realmState?.records.size) this.realms.delete(record.realm.realmId);
    if (!this.records.size) this.pointers.clear();
  }

  afterDispatch(): void {
    if (!this.records.size) {
      for (const observer of this.observers) observer.onAfterDispatch?.();
      return;
    }
    let removed: TargetRecord[] | undefined;
    for (const record of this.records.values()) {
      const { realm, entityId, component, model } = record;
      if (
        realm.isDisposed ||
        realm.world.getComponent(entityId, model.type) !== model ||
        realm.world.getComponent(entityId, component.type) !== component
      ) {
        (removed ??= []).push(record);
        continue;
      }
      if (record.listener.target.type === 'collider') {
        const cid = record.listener.target.colliderId;
        if (cid !== undefined) {
          const entries = [...getColliderEntries(component as any)];
          if (!entries.some((e: any) => e.colliderId === cid)) {
            (removed ??= []).push(record);
            continue;
          }
        }
      }
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
            if (pointer.hover === record.listener) {
              pointer.hover = undefined;
              this.emit(record.listener, 'leave', pointer);
            }
          }
        }
        record.listener.dispose();
      }
    }
    for (const observer of this.observers) observer.onAfterDispatch?.();
    const engine = this.multiverse.engine;
    if (engine && 'multiversePollInteractionEvents' in engine) {
      this.pollNativeEvents(engine);
    }
  }

  private pollNativeEvents(engine: NonNullable<MultiverseCoordinator['engine']>): void {
    const raw = engine.multiversePollInteractionEvents();
    if (!raw) return;
    const events = JSON.parse(raw) as InteractionEvent[];
    for (const ev of events) {
      const type: InteractiveEventType =
        ev.interactionType === 'pressMove'
          ? 'pressmove'
          : ev.interactionType === 'pressUp'
            ? 'pressup'
            : (ev.interactionType as any);
      let window = this.pointers.get(ev.windowId);
      if (!window) this.pointers.set(ev.windowId, (window = new Map()));
      let pointer = window.get(Number(ev.pointerId));
      if (!pointer) {
        window.set(
          Number(ev.pointerId),
          (pointer = {
            event: {
              kind: 'pointer',
              type: 'move',
              windowId: ev.windowId,
              pointerId: Number(ev.pointerId),
              pointerType: 'mouse',
              position: ev.localPos,
              delta: ev.delta,
              pressure: 0
            },
            pressed: new Map(),
            positions: new Map(),
            uvs: new Map()
          })
        );
      }
      const records = this.modelRecords.get(`${ev.realmId}:${ev.modelId}`);
      if (records) {
        for (const record of records) {
          let matches = false;
          if (record.listener.target.type === 'collider') {
            matches =
              record.listener.target.colliderId === undefined ||
              record.listener.target.colliderId === ev.colliderId;
          } else if (record.listener.target.type === 'svg') {
            const target = record.listener.target;
            const r2d = record.realm as any;
            const rect = r2d.getSvgElementRect?.(target.svgId, target.elementId);
            if (rect && rect.viewportWidth > 0 && rect.viewportHeight > 0) {
              const svgX = ev.uv[0] * rect.viewportWidth;
              const svgY = ev.uv[1] * rect.viewportHeight;
              matches =
                svgX >= rect.x &&
                svgX <= rect.x + rect.width &&
                svgY >= rect.y &&
                svgY <= rect.y + rect.height;
            } else {
              matches = true;
            }
          } else if (record.listener.target.type === 'ui') {
            const target = record.listener.target;
            const targetNumeric =
              typeof target.elementId === 'number' ? target.elementId : Number(target.elementId);
            matches =
              (!isNaN(targetNumeric) && ev.elementId === targetNumeric) ||
              (ev.elementId !== undefined && String(ev.elementId) === String(target.elementId));
          }
          if (matches) {
            pointer.positions.set(record.listener, ev.localPos);
            pointer.uvs.set(record.listener, ev.uv);
            if (type === 'hover') {
              pointer.hover = record.listener;
              DebugLatencyTracker.recordHover(
                DebugLatencyTracker.currentFrameId,
                record.listener.target
              );
            } else if (type === 'leave') {
              if (pointer.hover === record.listener) pointer.hover = undefined;
            } else if (type === 'down') {
              pointer.pressed.set(ev.button ?? 0, record.listener);
            } else if (type === 'pressup' || type === 'cancel') {
              pointer.pressed.delete(ev.button ?? 0);
            }
            const scrollDelta: ScrollDelta | undefined = ev.scrollDelta
              ? { pixels: [ev.scrollDelta[0], ev.scrollDelta[1]] }
              : undefined;
            this.emit(record.listener, type, pointer, scrollDelta, ev.elementId);
          }
        }
      }
    }
  }

  private emit(
    listener: InteractiveListener | undefined,
    type: InteractiveEventType,
    pointer: PointerState,
    scrollDelta?: ScrollDelta,
    elementId?: number
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
        elementId,
        scrollDelta
      });
    }
  }

  handleWindow(event: WindowEvent): void {
    for (const observer of this.observers) observer.onWindowEvent?.(event);
  }

  handleKeyboard(event: KeyboardEvent): void {
    for (const observer of this.observers) observer.onKeyboardEvent?.(event);
  }

  handle(event: PointerEvent): void {
    const engine = this.multiverse.engine;
    if (engine && 'multiverseHandlePointerEvent' in engine) {
      this.handleNativePointer(event, engine);
      return;
    }
    for (const observer of this.observers) observer.onPointerEvent?.(event);
  }

  private handleNativePointer(
    event: PointerEvent,
    engine: NonNullable<MultiverseCoordinator['engine']>
  ): void {
    let window = this.pointers.get(event.windowId);
    if (!window) this.pointers.set(event.windowId, (window = new Map()));
    let pointer = window.get(event.pointerId);
    if (!pointer) {
      window.set(
        event.pointerId,
        (pointer = { event, pressed: new Map(), positions: new Map(), uvs: new Map() })
      );
    }
    pointer.event = event;

    const coreInput = toCorePointerEvent(event);
    if (coreInput) {
      engine.multiverseHandlePointerEvent(JSON.stringify(coreInput));
      this.pollNativeEvents(engine);
    }

    if (event.type === 'leave' || event.type === 'cancel') {
      this.cancel(pointer);
      window.delete(event.pointerId);
      if (!window.size) this.pointers.delete(event.windowId);
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
    this.modelRecords.clear();
    for (const observer of [...this.observers]) observer.onDispose?.();
  }
}
