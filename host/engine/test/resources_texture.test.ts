import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import { ResourceManager } from '../src/resources/index';
import type { GalfusEngine, GpuTextureDesc, TextureUpdateDesc } from '@galfus/transport-types';

describe('@galfus/engine > ResourceManager & Texture Auto-loading', () => {
  const alphaPngBytes = fs.readFileSync('.old/assets/alpha_test_texture.png');
  const normalJpegBytes = fs.readFileSync('.old/assets/normal_test_texture.png');

  it('ResourceManager.loadTexture: sends raw encoded image bytes directly to core engine', () => {
    const recordedCalls: Array<{ id: number; desc: GpuTextureDesc; dataLength: number }> = [];

    const mockEngine = {
      resourceCreateTexture: (id: number, desc: GpuTextureDesc, data: Uint8Array, len: number) => {
        recordedCalls.push({ id, desc, dataLength: len });
      },
      resourceDisposeTexture: () => {}
    } as unknown as GalfusEngine;

    const resources = new ResourceManager();
    resources.bindEngine(mockEngine);

    // 1. Load PNG albedo texture (defaults to sRGB)
    const texId1 = resources.loadTexture(alphaPngBytes, {
      label: 'hero_albedo'
    });
    expect(texId1).toBe(1 as any);
    expect(recordedCalls[0]?.desc).toEqual({
      label: 'hero_albedo',
      width: 0,
      height: 0,
      format: 'rgba8UnormSrgb'
    });
    expect(recordedCalls[0]?.dataLength).toBe(alphaPngBytes.byteLength);

    // 2. Load JPEG normal map (linear color space: srgb = false)
    const texId2 = resources.loadTexture(normalJpegBytes, {
      label: 'hero_normal',
      srgb: false
    });
    expect(texId2).toBe(2 as any);
    expect(recordedCalls[1]?.desc).toEqual({
      label: 'hero_normal',
      width: 0,
      height: 0,
      format: 'rgba8Unorm'
    });
    expect(recordedCalls[1]?.dataLength).toBe(normalJpegBytes.byteLength);
  });

  it('manages texture updates and lifecycle disposal', () => {
    const resources = new ResourceManager();
    const calls: string[] = [];

    const mockEngine = {
      resourceCreateTexture: (id: number) => calls.push(`createTex:${id}`),
      resourceUpdateTexture: (
        id: number,
        rect: TextureUpdateDesc,
        _data: Uint8Array,
        len: number
      ) => calls.push(`updateTex:${id}:${rect.width}x${rect.height}:${len}`),
      resourceDisposeTexture: (id: number) => calls.push(`disposeTex:${id}`)
    } as unknown as GalfusEngine;

    resources.bindEngine(mockEngine);

    const data = new Uint8Array([255, 0, 0, 255]);
    // Payload-first createTexture(data, desc)
    const texId = resources.createTexture(data, {
      width: 1,
      height: 1,
      format: 'rgba8Unorm'
    });
    expect(texId).toBe(1 as any);
    expect(calls).toContain('createTex:1');

    // Payload-first updateTexture(texId, data, rect)
    resources.updateTexture(texId, data, { x: 0, y: 0, width: 1, height: 1 });
    expect(calls).toContain('updateTex:1:1x1:4');

    resources.disposeTexture(texId);
    expect(calls).toContain('disposeTex:1');

    // Subsequent dispose should not double free
    resources.dispose();
  });
});
