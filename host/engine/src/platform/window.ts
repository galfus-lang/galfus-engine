/**
 * WindowManager coordinates native OS and browser canvas display surfaces.
 */
import type {
  GalfusEngine,
  PlatformCapabilities,
  WindowConfig,
  WindowState
} from '@galfus/transport-types';
import { IdAllocator, type WindowId } from '../types';

export type CursorGrabMode = 'none' | 'confined' | 'locked';

export type CursorIconName =
  'default' | 'pointer' | 'grab' | 'grabbing' | 'crosshair' | 'text' | 'move' | 'wait';

const CURSOR_GRAB_MAP: Record<CursorGrabMode, number> = {
  none: 0,
  confined: 1,
  locked: 2
};

const CURSOR_ICON_MAP: Record<CursorIconName, number> = {
  default: 0,
  pointer: 1,
  grab: 2,
  grabbing: 3,
  crosshair: 4,
  text: 5,
  move: 6,
  wait: 7
};

export interface WindowCreateOptions {
  title?: string;
  size?: [number, number];
  position?: [number, number];
  resizable?: boolean;
  decorations?: boolean;
  transparent?: boolean;
  initialState?: WindowState;
  canvasId?: string;
}

export class WindowManager {
  private _engine: GalfusEngine | null = null;
  private readonly _idAllocator = new IdAllocator<WindowId>(1);
  private readonly _openWindows = new Set<WindowId>();

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
  }

  /**
   * Creates an OS window or binds a browser canvas, returning a strongly-typed WindowId.
   */
  create(options: WindowCreateOptions = {}): WindowId {
    const windowId = this._idAllocator.allocate('WindowId');
    if (this._engine) {
      const config: WindowConfig = {
        id: windowId,
        title: options.title ?? 'Galfus Engine',
        size: options.size,
        position: options.position,
        resizable: options.resizable ?? true,
        decorations: options.decorations ?? true,
        transparent: options.transparent ?? false,
        initialState: options.initialState ?? 'windowed',
        canvasId: options.canvasId
      };
      this._engine.windowCreate(config);
    }
    this._openWindows.add(windowId);
    return windowId;
  }

  /**
   * Closes and destroys an open window surface.
   */
  close(windowId: WindowId): void {
    if (!this._openWindows.has(windowId)) return;
    if (this._engine) {
      this._engine.windowClose(windowId);
    }
    this._openWindows.delete(windowId);
  }

  /**
   * Updates the window title bar.
   */
  setTitle(windowId: WindowId, title: string): void {
    if (this._engine) {
      this._engine.windowSetTitle(windowId, title);
    }
  }

  /**
   * Retrieves the physical inner surface dimensions [width, height].
   */
  getSize(windowId: WindowId): [number, number] {
    if (this._engine && this._engine.platformGetWindowSize) {
      return this._engine.platformGetWindowSize(windowId);
    }
    return [0, 0];
  }

  /**
   * Explicitly updates the window / swapchain surface size in the Multiverse.
   */
  updateSize(windowId: WindowId, width: number, height: number): void {
    if (this._engine) {
      this._engine.multiverseUpdateWindowSize(windowId, width, height);
    }
  }

  /**
   * Updates cursor grab mode ('none' | 'confined' | 'locked').
   * 'locked' enables Pointer Lock for FPS and orbit cameras.
   */
  setCursorGrab(windowId: WindowId, mode: CursorGrabMode | number): void {
    const numericMode = typeof mode === 'string' ? (CURSOR_GRAB_MAP[mode] ?? 0) : mode;
    if (this._engine) {
      this._engine.windowSetCursorGrab(windowId, numericMode);
    }
  }

  /**
   * Updates cursor visual appearance icon ('default' | 'pointer' | 'grab' | 'grabbing' | 'crosshair' | 'text' | 'move' | 'wait').
   */
  setCursorIcon(windowId: WindowId, icon: CursorIconName | number): void {
    const numericIcon = typeof icon === 'string' ? (CURSOR_ICON_MAP[icon] ?? 0) : icon;
    if (this._engine) {
      this._engine.windowSetCursorIcon(windowId, numericIcon);
    }
  }

  /**
   * Sets the visual application icon of this window using raw image bytes (ICO, PNG, WebP, JPEG).
   * Follows payload-first convention: (windowId, data).
   */
  setIcon(windowId: WindowId, data: Uint8Array): void {
    if (this._engine && this._engine.windowSetIcon) {
      this._engine.windowSetIcon(windowId, data, data.byteLength);
    }
  }

  /**
   * Disposes and closes all active windows.
   */
  dispose(): void {
    if (this._engine) {
      for (const windowId of this._openWindows) {
        this._engine.windowClose(windowId);
      }
    }
    this._openWindows.clear();
  }
}
