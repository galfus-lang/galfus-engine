/**
 * Realm 2D component declarations.
 */
import type { Component } from '../ecs/component';
import type {
  Camera2DDesc,
  Light2DDesc,
  ParticleEmitter2DDesc,
  Shape2DDesc,
  Sprite2DDesc,
  Svg2DDesc
} from '@galfus/transport-types';

export interface Sprite2DComponent extends Component {
  readonly type: 'Sprite2D';
  readonly spriteId: number;
  desc: Sprite2DDesc;
  isDirty: boolean;
}

export function createSprite2D(spriteId: number, desc: Sprite2DDesc): Sprite2DComponent {
  return {
    type: 'Sprite2D',
    spriteId,
    desc,
    isDirty: true
  };
}

export interface Shape2DComponent extends Component {
  readonly type: 'Shape2D';
  readonly shapeId: number;
  desc: Shape2DDesc;
  isDirty: boolean;
}

export function createShape2D(shapeId: number, desc: Shape2DDesc): Shape2DComponent {
  return {
    type: 'Shape2D',
    shapeId,
    desc,
    isDirty: true
  };
}

export interface Light2DComponent extends Component {
  readonly type: 'Light2D';
  readonly lightId: number;
  desc: Light2DDesc;
  isDirty: boolean;
}

export function createLight2D(lightId: number, desc: Light2DDesc): Light2DComponent {
  return {
    type: 'Light2D',
    lightId,
    desc,
    isDirty: true
  };
}

export interface Camera2DComponent extends Component {
  readonly type: 'Camera2D';
  readonly cameraId: number;
  desc: Camera2DDesc;
  isDirty: boolean;
}

export function createCamera2D(cameraId: number, desc: Camera2DDesc): Camera2DComponent {
  return {
    type: 'Camera2D',
    cameraId,
    desc,
    isDirty: true
  };
}

export interface Svg2DComponent extends Component {
  readonly type: 'Svg2D';
  readonly svgId: number;
  desc: Svg2DDesc;
  isDirty: boolean;
}

export function createSvg2D(svgId: number, desc: Svg2DDesc): Svg2DComponent {
  return {
    type: 'Svg2D',
    svgId,
    desc,
    isDirty: true
  };
}

export interface ParticleEmitter2DComponent extends Component {
  readonly type: 'ParticleEmitter2D';
  readonly emitterId: number;
  desc: ParticleEmitter2DDesc;
  isDirty: boolean;
}

export function createParticleEmitter2D(
  emitterId: number,
  desc: ParticleEmitter2DDesc
): ParticleEmitter2DComponent {
  return {
    type: 'ParticleEmitter2D',
    emitterId,
    desc,
    isDirty: true
  };
}
