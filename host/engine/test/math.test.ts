import { describe, expect, it } from 'bun:test';
import { mat2d, mat4, quat, vec2, vec3, vec4 } from '../src/math/index';

describe('@galfus/engine-core > Math', () => {
  it('vec2: creates, performs arithmetic, dot, cross, distance and transformMat2d', () => {
    const v1 = vec2.fromValues(1, 2);
    const v2 = vec2.fromValues(3, 4);
    const out = vec2.create();

    vec2.add(out, v1, v2);
    expect(out[0]).toBe(4);
    expect(out[1]).toBe(6);

    expect(vec2.dot(v1, v2)).toBe(11);
    expect(vec2.distance(v1, v2)).toBeCloseTo(Math.hypot(2, 2));

    const m = mat2d.create();
    mat2d.fromTranslation(m, [10, 20]);
    vec2.transformMat2d(out, v1, m);
    expect(out[0]).toBe(11);
    expect(out[1]).toBe(22);
  });

  it('mat2d: creates, combines rotation, translation and scaling', () => {
    const m = mat2d.create();
    mat2d.fromRotationTranslationScale(m, [10, 20], Math.PI / 2, [2, 3]);

    const pt = vec2.fromValues(1, 0);
    const outPt = vec2.create();
    vec2.transformMat2d(outPt, pt, m);

    // Rotating (1, 0) by 90 deg and scaling by 2 gives (0, 2) + translation (10, 20) = (10, 22)
    expect(outPt[0]).toBeCloseTo(10);
    expect(outPt[1]).toBeCloseTo(22);

    const inv = mat2d.create();
    expect(mat2d.invert(inv, m)).not.toBeNull();

    const identityResult = mat2d.create();
    mat2d.multiply(identityResult, m, inv);
    expect(mat2d.equals(identityResult, mat2d.create())).toBe(true);
  });

  it('vec3: creates, scales, normalizes and transforms with quat', () => {
    const v = vec3.fromValues(0, 1, 0);
    const q = quat.create();
    quat.setAxisAngle(q, [0, 0, 1], Math.PI / 2); // 90 deg around Z

    const rotated = vec3.create();
    vec3.transformQuat(rotated, v, q);

    // Rotating (0, 1, 0) around Z by 90 deg counter-clockwise yields (-1, 0, 0)
    expect(rotated[0]).toBeCloseTo(-1);
    expect(rotated[1]).toBeCloseTo(0);
    expect(rotated[2]).toBeCloseTo(0);
  });

  it('mat4: creates, composes transforms and inverts', () => {
    const m = mat4.create();
    const q = quat.create();
    quat.fromEuler(q, 0, 90, 0);
    mat4.fromRotationTranslationScale(m, q, [5, 10, 15], [2, 2, 2]);

    const trans = vec3.create();
    mat4.getTranslation(trans, m);
    expect(trans[0]).toBeCloseTo(5);
    expect(trans[1]).toBeCloseTo(10);
    expect(trans[2]).toBeCloseTo(15);

    const scale = vec3.create();
    mat4.getScaling(scale, m);
    expect(scale[0]).toBeCloseTo(2);
    expect(scale[1]).toBeCloseTo(2);
    expect(scale[2]).toBeCloseTo(2);

    const inv = mat4.create();
    expect(mat4.invert(inv, m)).not.toBeNull();

    const identityCheck = mat4.create();
    mat4.multiply(identityCheck, m, inv);
    expect(mat4.equals(identityCheck, mat4.create())).toBe(true);
  });

  it('vec4: arithmetic and mat4 transformation', () => {
    const v = vec4.fromValues(1, 2, 3, 1);
    const m = mat4.create();
    mat4.fromTranslation(m, [10, 20, 30]);

    const out = vec4.create();
    vec4.transformMat4(out, v, m);
    expect(out[0]).toBe(11);
    expect(out[1]).toBe(22);
    expect(out[2]).toBe(33);
    expect(out[3]).toBe(1);
  });
});
