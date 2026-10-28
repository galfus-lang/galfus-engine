/**
 * ResourceManager manages allocation and GPU binding for shared textures and buffers.
 */
import type {
  BufferDesc,
  GalfusEngine,
  GpuTextureDesc,
  TextureUpdateDesc
} from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';

export class ResourceManager {
  private _engine: GalfusEngine | null = null;
  private _nextResourceId = 1;
  private readonly _textures = new Set<number>();
  private readonly _buffers = new Set<number>();

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
  }

  allocateResourceId(): number {
    const id = this._nextResourceId++;
    assertValidLogicalId(id, 'ResourceId');
    return id;
  }

  /**
   * Creates a shared GPU texture from raw byte data under a tracked logical ID.
   */
  createTexture(desc: GpuTextureDesc, data: Uint8Array): number {
    const textureId = this.allocateResourceId();
    if (this._engine) {
      this._engine.resourceCreateTexture(textureId, desc, data, data.byteLength);
    }
    this._textures.add(textureId);
    return textureId;
  }

  /**
   * Updates a sub-rectangle of an existing GPU texture.
   */
  updateTexture(textureId: number, rect: TextureUpdateDesc, data: Uint8Array): void {
    if (this._engine) {
      this._engine.resourceUpdateTexture(textureId, rect, data, data.byteLength);
    }
  }

  /**
   * Disposes a GPU texture and frees its logical ID.
   */
  disposeTexture(textureId: number): void {
    if (!this._textures.has(textureId)) return;
    if (this._engine) {
      this._engine.resourceDisposeTexture(textureId);
    }
    this._textures.delete(textureId);
  }

  /**
   * Creates a shared GPU buffer from raw byte data under a tracked logical ID.
   */
  createBuffer(desc: BufferDesc, data: Uint8Array): number {
    const bufferId = this.allocateResourceId();
    if (this._engine) {
      this._engine.resourceCreateBuffer(bufferId, desc, data, data.byteLength);
    }
    this._buffers.add(bufferId);
    return bufferId;
  }

  /**
   * Updates byte contents of an existing GPU buffer at a specified byte offset.
   */
  updateBuffer(bufferId: number, offset: number, data: Uint8Array): void {
    if (this._engine) {
      this._engine.resourceUpdateBuffer(bufferId, offset, data, data.byteLength);
    }
  }

  /**
   * Disposes a GPU buffer and frees its logical ID.
   */
  disposeBuffer(bufferId: number): void {
    if (!this._buffers.has(bufferId)) return;
    if (this._engine) {
      this._engine.resourceDisposeBuffer(bufferId);
    }
    this._buffers.delete(bufferId);
  }

  /**
   * Disposes all active textures and buffers.
   */
  dispose(): void {
    if (this._engine) {
      for (const textureId of this._textures) {
        this._engine.resourceDisposeTexture(textureId);
      }
      for (const bufferId of this._buffers) {
        this._engine.resourceDisposeBuffer(bufferId);
      }
    }
    this._textures.clear();
    this._buffers.clear();
    this._engine = null;
  }
}
