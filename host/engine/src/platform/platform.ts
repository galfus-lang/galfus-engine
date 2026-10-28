/**
 * PlatformCoordinator groups platform services: windows, event pumping, and capabilities.
 */
import type { GalfusEngine, PlatformCapabilities, PlatformEvent } from '@galfus/transport-types';
import { WindowManager } from './window';

export class PlatformCoordinator {
  readonly window = new WindowManager();
  private _engine: GalfusEngine | null = null;

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
    this.window.bindEngine(engine);
  }

  /**
   * Pumps platform input events (window, keyboard, mouse, pointer).
   */
  pumpEvents(): PlatformEvent[] {
    if (this._engine) {
      return this._engine.platformPumpEvents();
    }
    return [];
  }

  /**
   * Queries hardware capabilities and platform feature support flags.
   */
  getCapabilities(): PlatformCapabilities | null {
    if (this._engine) {
      return this._engine.platformGetCapabilities();
    }
    return null;
  }

  /**
   * Disposes platform resources and closes active windows.
   */
  dispose(): void {
    this.window.dispose();
    this._engine = null;
  }
}
