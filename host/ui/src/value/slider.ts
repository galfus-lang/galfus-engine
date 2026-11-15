import type { InteractiveEvent } from '@galfus/engine';
import { makePanel, type UiOrientation } from '../components/controls';
import type { UiPanelComponent } from '../components/component';
import { UiValueControl, type UiValueOptions } from './base';
import { uiWindowPointToLocal } from '../text/coordinates';

export interface UiSliderOptions extends UiValueOptions<number> {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly orientation?: UiOrientation;
  readonly width?: number;
  readonly height?: number;
}
function bounds(min: number, max: number, step: number): void {
  if (
    ![min, max, step].every(Number.isFinite) ||
    min >= max ||
    step <= 0 ||
    !Number.isFinite(max - min) ||
    !Number.isFinite((max - min) / step) ||
    min + step === min
  )
    throw new RangeError('Slider bounds require a finite range and a representable positive step.');
}
function dimension(value: number): number {
  if (!Number.isFinite(value) || value <= 16)
    throw new RangeError('Slider dimensions must exceed 16 units.');
  return value;
}
function snap(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Slider value must be finite.');
  const clamped = Math.max(min, Math.min(max, value));
  const steps = Math.floor((max - min) / step);
  const snapped = Math.min(max, min + Math.min(steps, Math.round((clamped - min) / step)) * step);
  const result = Math.abs(max - clamped) < Math.abs(snapped - clamped) ? max : snapped;
  if (result === min || result === max) return result;
  const rounded = Number(result.toPrecision(15));
  return rounded < min || rounded > max ? result : rounded;
}
/** Finite, stepped numeric control. Pointer drag commits each distinct stepped value. */
export class UiSlider extends UiValueControl<number> {
  readonly track: UiPanelComponent;
  readonly thumb: UiPanelComponent;
  private min_: number;
  private max_: number;
  private step_: number;
  private orientation_: UiOrientation;
  private width_: number;
  private height_: number;
  private pressed?: { windowId: number; pointerId: number };
  constructor(parent: UiPanelComponent, options: UiSliderOptions = {}) {
    const min = options.min ?? 0,
      max = options.max ?? 100,
      step = options.step ?? 1;
    bounds(min, max, step);
    const orientation = options.orientation ?? 'horizontal';
    if (orientation !== 'horizontal' && orientation !== 'vertical')
      throw new Error('Invalid slider orientation.');
    const width = dimension(options.width ?? (orientation === 'horizontal' ? 220 : 32));
    const height = dimension(options.height ?? (orientation === 'horizontal' ? 32 : 180));
    const value = snap(options.value ?? min, min, max, step);
    if (options.tabIndex !== undefined && !Number.isSafeInteger(options.tabIndex))
      throw new RangeError('tabIndex must be a safe integer.');
    const panel = makePanel(parent, 'slider', options, {
      ...options.layout,
      width: { type: 'exact', value: width },
      height: { type: 'exact', value: height },
      isStack: true
    });
    super(panel, value, options);
    this.min_ = min;
    this.max_ = max;
    this.step_ = step;
    this.orientation_ = orientation;
    this.width_ = width;
    this.height_ = height;
    this.track = panel.addPanel({
      backgroundColor: [0.25, 0.34, 0.43, 1],
      borderRadius: [3, 3, 3, 3]
    });
    this.thumb = panel.addPanel({
      backgroundColor: [0.55, 0.82, 1, 1],
      borderRadius: [6, 6, 6, 6]
    });
    panel.setFocusable(options.tabIndex);
    for (const part of [panel, this.track, this.thumb]) {
      part.on('down', (event) => this.pointer(event, 'down'));
      part.on('pressmove', (event) => this.pointer(event, 'move'));
      part.on('pressup', (event) => this.pointer(event, 'end'));
      part.on('cancel', (event) => this.pointer(event, 'end'));
      part.on('scroll', (event) => this.scroll(event));
    }
    panel.onKeyboard((event) => {
      if (
        event.type !== 'input' ||
        event.state !== 'pressed' ||
        event.modifiers.ctrl ||
        event.modifiers.alt ||
        event.modifiers.superKey ||
        !this.canUserChange(event.windowId)
      )
        return;
      if (event.logicalKey === 'Home') this.setValue(this.min_);
      else if (event.logicalKey === 'End') this.setValue(this.max_);
      else if (event.logicalKey === 'ArrowRight' || event.logicalKey === 'ArrowUp')
        this.increment(1, 1);
      else if (event.logicalKey === 'ArrowLeft' || event.logicalKey === 'ArrowDown')
        this.increment(-1, 1);
      else if (event.logicalKey === 'PageUp') this.increment(1, 10);
      else if (event.logicalKey === 'PageDown') this.increment(-1, 10);
    });
    this.initialize();
  }
  get min(): number {
    return this.min_;
  }
  get max(): number {
    return this.max_;
  }
  get step(): number {
    return this.step_;
  }
  get orientation(): UiOrientation {
    return this.orientation_;
  }
  setBounds(min: number, max: number, step = this.step_): this {
    bounds(min, max, step);
    const root = this.panel.componentRoot,
      synced = root.syncState === 'synced';
    this.min_ = min;
    this.max_ = max;
    this.step_ = step;
    const previous = this.value;
    this.setValue(previous);
    this.syncView();
    if (synced && (root.syncState as string) === 'pending') root.flush();
    return this;
  }
  setOrientation(value: UiOrientation): this {
    if (value !== 'horizontal' && value !== 'vertical')
      throw new Error('Invalid slider orientation.');
    this.orientation_ = value;
    this.syncView();
    return this;
  }
  setSize(width: number, height: number): this {
    dimension(width);
    dimension(height);
    this.width_ = width;
    this.height_ = height;
    this.panel.setLayout({
      ...this.panel.layout,
      width: { type: 'exact', value: width },
      height: { type: 'exact', value: height }
    });
    this.syncView();
    return this;
  }
  protected normalize(value: number): number {
    return snap(value, this.min_, this.max_, this.step_);
  }
  private increment(direction: -1 | 1, count: number): void {
    let value = this.value;
    for (let i = 0; i < count; i++) {
      const units = (value - this.min_) / this.step_;
      if (direction > 0) {
        if (value >= this.max_) break;
        value = Math.min(this.max_, this.min_ + (Math.floor(units + 1e-9) + 1) * this.step_);
      } else {
        if (value <= this.min_) break;
        value = Math.max(this.min_, this.min_ + (Math.ceil(units - 1e-9) - 1) * this.step_);
      }
    }
    this.setValue(value);
  }
  protected syncView(): void {
    const horizontal = this.orientation_ === 'horizontal',
      ratio = (this.value_ - this.min_) / (this.max_ - this.min_);
    const track = horizontal
      ? { x: 8, y: this.height_ / 2 - 2, w: this.width_ - 16, h: 4 }
      : { x: this.width_ / 2 - 2, y: 8, w: 4, h: this.height_ - 16 };
    const thumb = horizontal
      ? { x: 2 + ratio * (this.width_ - 16), y: this.height_ / 2 - 6 }
      : { x: this.width_ / 2 - 6, y: 2 + (1 - ratio) * (this.height_ - 16) };
    const layout = (x: number, y: number, w: number, h: number) => ({
      width: { type: 'exact' as const, value: w },
      height: { type: 'exact' as const, value: h },
      positionOffset: [x, y] as [number, number]
    });
    const a = layout(track.x, track.y, track.w, track.h),
      b = layout(thumb.x, thumb.y, 12, 12);
    if (JSON.stringify(this.track.layout) !== JSON.stringify(a)) this.track.setLayout(a);
    if (JSON.stringify(this.thumb.layout) !== JSON.stringify(b)) this.thumb.setLayout(b);
  }
  private scroll(event: InteractiveEvent): void {
    if (!this.canUserChange(event.pointer.windowId)) return;
    const delta =
      event.scrollDelta ?? (event.pointer.type === 'scroll' ? event.pointer.delta : undefined);
    if (!delta) return;
    const [x, y] = 'pixels' in delta ? delta.pixels : delta.lines;
    const amount = y || x;
    if (!Number.isFinite(amount) || amount === 0) return;
    this.increment(amount > 0 ? 1 : -1, 1);
  }
  private pointer(event: InteractiveEvent, type: 'down' | 'move' | 'end'): void {
    const pointer = event.pointer;
    if (type === 'down') {
      if (
        pointer.type !== 'button' ||
        pointer.button !== 'primary' ||
        !this.canUserChange(pointer.windowId)
      )
        return;
      this.pressed = { windowId: pointer.windowId, pointerId: pointer.pointerId };
      this.requestFocus(pointer.windowId);
    } else if (
      !this.pressed ||
      this.pressed.windowId !== pointer.windowId ||
      this.pressed.pointerId !== pointer.pointerId
    )
      return;
    if (type === 'end') {
      this.pressed = undefined;
      return;
    }
    if (!this.canUserChange(pointer.windowId)) return;
    const root = this.panel.componentRoot;
    const rect = root.realm.getUiLayout(root.handle, this.panel.id).absoluteRect;
    const point =
      event.windowPosition &&
      uiWindowPointToLocal(root.getRuntime(), root, pointer.windowId, event.windowPosition);
    const viewport = root.realm.getUiLayout(root.handle, root.root.id).absoluteRect;
    const local =
      point ??
      (event.uv ? [event.uv[0] * viewport[2], (1 - event.uv[1]) * viewport[3]] : undefined);
    if (!local) return;
    const x = local[0]! - rect[0],
      y = local[1]! - rect[1];
    const t =
      this.orientation_ === 'horizontal' ? (x - 8) / (rect[2] - 16) : 1 - (y - 8) / (rect[3] - 16);
    this.setValue(this.min_ + Math.max(0, Math.min(1, t)) * (this.max_ - this.min_));
  }
}
