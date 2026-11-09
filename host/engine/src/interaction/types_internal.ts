import type { PointerButton, PointerEvent } from '@galfus/transport-types';
import type { Component } from '../ecs/component';
import type { Model2DComponent } from '../realm2d/components';
import type { Realm2D } from '../realm2d/realm';
import type { Model3DComponent } from '../realm3d/components';
import type { Realm3D } from '../realm3d/realm';
import type { InteractiveListener } from './listener';
import type { CameraSnapshot2D, TargetSnapshot2D } from './snapshot2d';
import type { CameraSnapshot3D, TargetSnapshot3D } from './snapshot3d';

export interface TargetRecord {
  listener: InteractiveListener;
  realm: Realm2D | Realm3D;
  entityId: number;
  model: Model2DComponent | Model3DComponent;
  component: Component;
  snapshot: TargetSnapshot2D | TargetSnapshot3D;
}

export interface PointerState {
  event: PointerEvent;
  hover?: InteractiveListener;
  pressed: Map<PointerButton | number, InteractiveListener>;
  positions: Map<InteractiveListener, [number, number]>;
  uvs: Map<InteractiveListener, [number, number]>;
}

export interface RealmState {
  realm: Realm2D | Realm3D;
  cameras2D: CameraSnapshot2D[];
  cameras3D: CameraSnapshot3D[];
  records: Set<TargetRecord>;
}
