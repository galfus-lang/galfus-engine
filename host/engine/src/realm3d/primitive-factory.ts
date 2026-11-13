/**
 * Primitive factory helper functions for Realm3D.
 */

import type { Model3DDesc } from '@galfus/transport-types';
import type { Transform3DProps } from '../anchors/component';
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import type { Model3DComponent, Primitive3DKind } from './components';

export interface PrimitiveRealmContext {
  createGeometry(primitive: Primitive3DKind): { geometryId: number };
  createModel(desc: Model3DDesc, transform?: Transform3DProps): EntityId;
  world: EcsWorld;
}

export function createPrimitiveModel(
  ctx: PrimitiveRealmContext,
  primitive: Primitive3DKind,
  materialId: number,
  transform?: Transform3DProps,
  meshDesc?: Partial<Model3DDesc>
): { entityId: EntityId; geometryId: number; modelId: number } {
  const { geometryId } = ctx.createGeometry(primitive);
  const entityId = ctx.createModel({ geometryId, materialId, ...meshDesc }, transform);
  const model = ctx.world.getComponent<Model3DComponent>(entityId, 'Model3D')!;
  return { entityId, geometryId, modelId: model.modelId };
}

export function createCube(
  ctx: PrimitiveRealmContext,
  size: number,
  matId: number,
  t?: Transform3DProps,
  m?: Partial<Model3DDesc>
) {
  return createPrimitiveModel(ctx, { kind: 'cube', size }, matId, t, m);
}

export function createPlane(
  ctx: PrimitiveRealmContext,
  w: number,
  d: number,
  matId: number,
  t?: Transform3DProps,
  m?: Partial<Model3DDesc>
) {
  return createPrimitiveModel(ctx, { kind: 'plane', width: w, depth: d }, matId, t, m);
}

export function createSphere(
  ctx: PrimitiveRealmContext,
  r: number,
  rg: number,
  s: number,
  matId: number,
  t?: Transform3DProps,
  m?: Partial<Model3DDesc>
) {
  return createPrimitiveModel(
    ctx,
    { kind: 'sphere', radius: r, rings: rg, sectors: s },
    matId,
    t,
    m
  );
}

export function createCylinder(
  ctx: PrimitiveRealmContext,
  r: number,
  h: number,
  s: number,
  matId: number,
  t?: Transform3DProps,
  m?: Partial<Model3DDesc>
) {
  return createPrimitiveModel(
    ctx,
    { kind: 'cylinder', radius: r, height: h, sectors: s },
    matId,
    t,
    m
  );
}

export function createCapsule(
  ctx: PrimitiveRealmContext,
  r: number,
  ch: number,
  rg: number,
  s: number,
  matId: number,
  t?: Transform3DProps,
  m?: Partial<Model3DDesc>
) {
  return createPrimitiveModel(
    ctx,
    { kind: 'capsule', radius: r, cylinderHeight: ch, rings: rg, sectors: s },
    matId,
    t,
    m
  );
}

export function createPyramid(
  ctx: PrimitiveRealmContext,
  w: number,
  d: number,
  h: number,
  matId: number,
  t?: Transform3DProps,
  m?: Partial<Model3DDesc>
) {
  return createPrimitiveModel(ctx, { kind: 'pyramid', width: w, depth: d, height: h }, matId, t, m);
}

export function createTorus(
  ctx: PrimitiveRealmContext,
  majR: number,
  minR: number,
  majS: number,
  minS: number,
  matId: number,
  t?: Transform3DProps,
  m?: Partial<Model3DDesc>
) {
  return createPrimitiveModel(
    ctx,
    {
      kind: 'torus',
      majorRadius: majR,
      minorRadius: minR,
      majorSegments: majS,
      minorSegments: minS
    },
    matId,
    t,
    m
  );
}

export function createCustomGeometry(
  ctx: PrimitiveRealmContext,
  top: number,
  vData: Uint8Array,
  idx: Uint32Array,
  matId: number,
  t?: Transform3DProps,
  m?: Partial<Model3DDesc>
) {
  return createPrimitiveModel(
    ctx,
    { kind: 'custom', topology: top, vertexData: vData, indices: idx },
    matId,
    t,
    m
  );
}

export function registerPrimitiveMethods(proto: any): void {
  proto.createPrimitive = function (primitive: any, matId: any, t?: any, mesh?: any) {
    return createPrimitiveModel(this, primitive, matId, t, mesh);
  };
  proto.createCube = function (size: any, mat: any, t?: any, m?: any) {
    return createCube(this, size, mat, t, m);
  };
  proto.createPlane = function (w: any, d: any, mat: any, t?: any, m?: any) {
    return createPlane(this, w, d, mat, t, m);
  };
  proto.createSphere = function (r: any, rg: any, s: any, mat: any, t?: any, m?: any) {
    return createSphere(this, r, rg, s, mat, t, m);
  };
  proto.createCylinder = function (r: any, h: any, s: any, mat: any, t?: any, m?: any) {
    return createCylinder(this, r, h, s, mat, t, m);
  };
  proto.createCapsule = function (r: any, ch: any, rg: any, s: any, mat: any, t?: any, m?: any) {
    return createCapsule(this, r, ch, rg, s, mat, t, m);
  };
  proto.createPyramid = function (w: any, d: any, h: any, mat: any, t?: any, m?: any) {
    return createPyramid(this, w, d, h, mat, t, m);
  };
  proto.createTorus = function (
    majR: any,
    minR: any,
    majS: any,
    minS: any,
    mat: any,
    t?: any,
    m?: any
  ) {
    return createTorus(this, majR, minR, majS, minS, mat, t, m);
  };
  proto.createCustomGeometry = function (
    top: any,
    vData: any,
    idx: any,
    mat: any,
    t?: any,
    m?: any
  ) {
    return createCustomGeometry(this, top, vData, idx, mat, t, m);
  };
}

declare module './realm' {
  interface Realm3D {
    createPrimitive(
      primitive: Primitive3DKind,
      matId: number,
      t?: Transform3DProps,
      mesh?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
    createCube(
      size: number,
      mat: number,
      t?: Transform3DProps,
      m?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
    createPlane(
      w: number,
      d: number,
      mat: number,
      t?: Transform3DProps,
      m?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
    createSphere(
      r: number,
      rg: number,
      s: number,
      mat: number,
      t?: Transform3DProps,
      m?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
    createCylinder(
      r: number,
      h: number,
      s: number,
      mat: number,
      t?: Transform3DProps,
      m?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
    createCapsule(
      r: number,
      ch: number,
      rg: number,
      s: number,
      mat: number,
      t?: Transform3DProps,
      m?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
    createPyramid(
      w: number,
      d: number,
      h: number,
      mat: number,
      t?: Transform3DProps,
      m?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
    createTorus(
      majR: number,
      minR: number,
      majS: number,
      minS: number,
      mat: number,
      t?: Transform3DProps,
      m?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
    createCustomGeometry(
      top: number,
      vData: Uint8Array,
      idx: Uint32Array,
      mat: number,
      t?: Transform3DProps,
      m?: Partial<Model3DDesc>
    ): { entityId: EntityId; geometryId: number; modelId: number };
  }
}
