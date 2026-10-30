/**
 * ResourceManager manages allocation and GPU binding for shared textures.
 */
import type { GalfusEngine, GpuTextureDesc, TextureUpdateDesc } from '@galfus/transport-types';
import { IdAllocator, type TextureId } from '../types';

export interface LoadTextureOptions {
  /** Debug label for the GPU texture resource */
  label?: string;
  /** Whether pixels represent sRGB color (defaults to true; set false for normal/data maps) */
  srgb?: boolean;
}

export class ResourceManager {
  private _engine: GalfusEngine | null = null;
  private readonly _idAllocator = new IdAllocator<TextureId>(1);
  private readonly _textures = new Set<TextureId>();

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
  }

  /**
   * Loads raw image bytes (PNG, JPEG, WebP, ICO) directly into a tracked GPU texture.
   * Auto-detection and decoding are handled natively inside the Galfus core.
   * Follows payload-first convention: (data, options?).
   *
   * @param data Encoded image file bytes (PNG, JPEG, WebP, ICO).
   * @param options Configuration options (sRGB color space, debug label).
   * @returns The allocated logical TextureId.
   */
  loadTexture(data: Uint8Array, options?: LoadTextureOptions): TextureId {
    const srgb = options?.srgb ?? true;
    return this.createTexture(data, {
      label: options?.label ?? 'image-texture',
      width: 0,
      height: 0,
      format: srgb ? 'rgba8UnormSrgb' : 'rgba8Unorm'
    });
  }

  /**
   * Creates a shared GPU texture from raw byte data under a tracked logical TextureId.
   * If `data` contains encoded image container bytes (PNG, JPEG, WebP, ICO), the Galfus core
   * automatically decodes it into RGBA8 and derives width/height.
   *
   * Follows payload-first convention: (data, desc).
   */
  createTexture(data: Uint8Array, desc: GpuTextureDesc): TextureId {
    const textureId = this._idAllocator.allocate('TextureId');
    if (this._engine) {
      this._engine.resourceCreateTexture(textureId, desc, data, data.byteLength);
    }
    this._textures.add(textureId);
    return textureId;
  }

  /**
   * Updates a sub-rectangle of an existing GPU texture.
   * Follows payload-first convention: (textureId, data, rect).
   */
  updateTexture(textureId: TextureId, data: Uint8Array, rect: TextureUpdateDesc): void {
    if (this._engine) {
      this._engine.resourceUpdateTexture(textureId, rect, data, data.byteLength);
    }
  }

  /**
   * Disposes a GPU texture and frees its logical ID.
   */
  disposeTexture(textureId: TextureId): void {
    if (!this._textures.has(textureId)) return;
    if (this._engine) {
      this._engine.resourceDisposeTexture(textureId);
    }
    this._textures.delete(textureId);
  }

  /**
   * Disposes all active textures.
   */
  dispose(): void {
    if (this._engine) {
      for (const textureId of this._textures) {
        this._engine.resourceDisposeTexture(textureId);
      }
    }
    this._textures.clear();
    this._engine = null;
  }
}
