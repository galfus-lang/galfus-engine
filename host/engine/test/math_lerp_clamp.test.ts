import { describe, expect, it } from 'bun:test';
import { common, mat2d, mat4, quat, vec2, vec3, vec4 } from '../src/math/index';

describe('@galfus/engine > Math lerp & clamp extensions', () => {
  it('common: scalar lerp and clamp', () => {
    expect(common.lerp(10, 20, 0.5)).toBeCloseTo(15);
    expect(common.lerp(10, 20, 0)).toBeCloseTo(10);
    expect(common.lerp(10, 20, 1)).toBeCloseTo(20);

    expect(common.clamp(5, 0, 10)).toBe(5);
    expect(common.clamp(-5, 0, 10)).toBe(0);
    expect(common.clamp(15, 0, 10)).toBe(10);
  });

  it('vec2: lerp and clamp', () => {
    const a = vec2.fromValues(0, 10);
    const b = vec2.fromValues(10, 30);
    const out = vec2.create();

    vec2.lerp(out, a, b, 0.5);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(20);

    vec2.clamp(out, out, 2, 10);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(10);

    vec2.clamp(out, vec2.fromValues(-5, 25), vec2.fromValues(0, 0), vec2.fromValues(10, 20));
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(20);
  });

  it('vec3: lerp and clamp', () => {
    const a = vec3.fromValues(0, 10, 20);
    const b = vec3.fromValues(10, 20, 40);
    const out = vec3.create();

    vec3.lerp(out, a, b, 0.5);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(15);
    expect(out[2]).toBeCloseTo(30);

    vec3.clamp(out, out, 0, 20);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(15);
    expect(out[2]).toBeCloseTo(20);
  });

  it('vec4: lerp and clamp', () => {
    const a = vec4.fromValues(0, 10, 20, 30);
    const b = vec4.fromValues(10, 20, 30, 40);
    const out = vec4.create();

    vec4.lerp(out, a, b, 0.5);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(15);
    expect(out[2]).toBeCloseTo(25);
    expect(out[3]).toBeCloseTo(35);

    vec4.clamp(out, out, 10, 30);
    expect(out[0]).toBeCloseTo(10);
    expect(out[1]).toBeCloseTo(15);
    expect(out[2]).toBeCloseTo(25);
    expect(out[3]).toBeCloseTo(30);
  });

  it('quat: lerp (nlerp) and clamp', () => {
    const q1 = quat.create(); // [0, 0, 0, 1]
    const q2 = quat.fromValues(0, 1, 0, 0); // 180 deg Y
    const out = quat.create();

    quat.lerp(out, q1, q2, 0.5);
    // Length must be 1.0
    const len = Math.hypot(out[0], out[1], out[2], out[3]);
    expect(len).toBeCloseTo(1.0);
    expect(out[1]).toBeCloseTo(Math.SQRT1_2);
    expect(out[3]).toBeCloseTo(Math.SQRT1_2);

    quat.clamp(out, out, 0, 0.5);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[3]).toBeCloseTo(0.5);
  });

  it('mat2d: lerp and clamp', () => {
    const m1 = mat2d.fromValues(1, 0, 0, 1, 0, 0);
    const m2 = mat2d.fromValues(3, 2, 2, 3, 10, 20);
    const out = mat2d.create();

    mat2d.lerp(out, m1, m2, 0.5);
    expect(out[0]).toBeCloseTo(2);
    expect(out[1]).toBeCloseTo(1);
    expect(out[2]).toBeCloseTo(1);
    expect(out[3]).toBeCloseTo(2);
    expect(out[4]).toBeCloseTo(5);
    expect(out[5]).toBeCloseTo(10);

    mat2d.clamp(out, out, 0, 3);
    expect(out[4]).toBeCloseTo(3);
    expect(out[5]).toBeCloseTo(3);
  });

  it('mat4: lerp and clamp', () => {
    const m1 = mat4.create(); // identity
    const m2 = mat4.create();
    mat4.fromTranslation(m2, [10, 20, 30]);

    const out = mat4.create();
    mat4.lerp(out, m1, m2, 0.5);
    expect(out[12]).toBeCloseTo(5);
    expect(out[13]).toBeCloseTo(10);
    expect(out[14]).toBeCloseTo(15);

    mat4.clamp(out, out, 0, 8);
    expect(out[12]).toBeCloseTo(5);
    expect(out[13]).toBeCloseTo(8);
    expect(out[14]).toBeCloseTo(8);
  });
});
