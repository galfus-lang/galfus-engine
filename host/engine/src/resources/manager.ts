/**
 * ResourceManager manages allocation and GPU binding for shared textures.
 */
import type { GalfusEngine, GpuTextureDesc, TextureUpdateDesc } from '@galfus/transport-types';
import { IdAllocator, type TextureId } from '../types';

export class ResourceManager {
  private _engine: GalfusEngine | null = null;
  private readonly _idAllocator = new IdAllocator<TextureId>(1);
  private readonly _textures = new Set<TextureId>();

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
  }

  /**
   * Creates a shared GPU texture from raw byte data under a tracked logical TextureId.
   */
  createTexture(desc: GpuTextureDesc, data: Uint8Array): TextureId {
    const textureId = this._idAllocator.allocate('TextureId');
    if (this._engine) {
      this._engine.resourceCreateTexture(textureId, desc, data, data.byteLength);
    }
    this._textures.add(textureId);
    return textureId;
  }

  /**
   * Updates a sub-rectangle of an existing GPU texture.
   */
  updateTexture(textureId: TextureId, rect: TextureUpdateDesc, data: Uint8Array): void {
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
