import { makePanel, UiControl, type UiControlOptions } from '../components/controls';
import type { UiPanelComponent } from '../components/component';
import type { UiSystem } from '../system';
import type { UiStyle } from '../style/theme';

export interface UiProgressOptions extends UiControlOptions {
  readonly min?: number;
  readonly max?: number;
  /** Null denotes an indeterminate indicator. */
  readonly value?: number | null;
  readonly width?: number;
  readonly height?: number;
  readonly fillStyle?: UiStyle;
  readonly onChange?: (value: number | null) => void;
}
function validateBounds(min: number, max: number): void {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || !Number.isFinite(max - min))
    throw new RangeError('Progress bounds require a finite min < max.');
}
function normalize(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new RangeError('Progress value must be finite or null.');
  return Math.max(min, Math.min(max, value));
}
/** Non-interactive determined or animated indeterminate progress indicator. */
export class UiProgressBar extends UiControl {
  readonly fill: UiPanelComponent;
  private min_: number;
  private max_: number;
  private value_: number | null;
  private width_: number;
  private height_: number;
  private phase = 0;
  private readonly callbacks = new Set<(value: number | null) => void>();
  private readonly stopTick: () => void;
  constructor(ui: UiSystem, parent: UiPanelComponent, options: UiProgressOptions = {}) {
    if (!ui.ownsComponentRoot(parent.componentRoot))
      throw new Error('Progress parent must belong to this UiSystem.');
    const min = options.min ?? 0,
      max = options.max ?? 100;
    validateBounds(min, max);
    const value = normalize(options.value === undefined ? min : options.value, min, max);
    const width = options.width ?? 240,
      height = options.height ?? 18;
    if (![width, height].every((v) => Number.isFinite(v) && v > 4))
      throw new RangeError('Progress dimensions must exceed four units.');
    const panel = makePanel(parent, 'progressBar', options, {
      ...options.layout,
      width: { type: 'exact', value: width },
      height: { type: 'exact', value: height },
      isStack: true
    });
    super(panel);
    panel.setProperties({ clip: true });
    this.min_ = min;
    this.max_ = max;
    this.value_ = value;
    this.width_ = width;
    this.height_ = height;
    this.fill = panel.addPanel({ clip: true });
    this.fill.setComponentStyle('progressFill');
    if (options.fillStyle) this.fill.setStyle(options.fillStyle);
    if (options.onChange) this.callbacks.add(options.onChange);
    this.updateVisual();
    this.stopTick = ui.getRuntime().on('tick', ({ dt }) => {
      if (
        this.value_ !== null ||
        !this.isAttached ||
        this.panel.componentRoot.syncState !== 'synced'
      )
        return;
      this.phase = (this.phase + Math.max(0, dt) * 0.65) % 1.3;
      this.updateVisual();
      if ((this.panel.componentRoot.syncState as string) === 'pending')
        this.panel.componentRoot.flush();
    });
    const root = panel.componentRoot;
    const stop = root.onSyncState((state) => {
      if (state === 'disposed' || (state === 'synced' && !this.isAttached)) {
        this.stopTick();
        this.callbacks.clear();
        stop();
      } else if (state === 'synced' && this.isAttached) {
        this.updateVisual();
        if ((root.syncState as string) === 'pending') root.flush();
      }
    });
  }
  get value(): number | null {
    return this.value_;
  }
  get min(): number {
    return this.min_;
  }
  get max(): number {
    return this.max_;
  }
  get indeterminate(): boolean {
    return this.value_ === null;
  }
  onChange(callback: (value: number | null) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  setValue(value: number | null, emit = true): this {
    if (!this.isAttached) throw new Error('Progress indicator is not attached.');
    const next = normalize(value, this.min_, this.max_);
    if (next === this.value_) return this;
    const root = this.panel.componentRoot,
      synced = root.syncState === 'synced';
    this.value_ = next;
    this.updateVisual();
    if (synced && (root.syncState as string) === 'pending') root.flush();
    if (emit) for (const callback of [...this.callbacks]) callback(next);
    return this;
  }
  setBounds(min: number, max: number): this {
    if (!this.isAttached) throw new Error('Progress bar is disposed.');
    validateBounds(min, max);
    const root = this.panel.componentRoot,
      synced = root.syncState === 'synced';
    this.min_ = min;
    this.max_ = max;
    if (this.value_ !== null) this.setValue(this.value_);
    this.updateVisual();
    if (synced && (root.syncState as string) === 'pending') root.flush();
    return this;
  }
  setSize(width: number, height: number): this {
    if (!this.isAttached) throw new Error('Progress bar is disposed.');
    if (![width, height].every((v) => Number.isFinite(v) && v > 4))
      throw new RangeError('Progress dimensions must exceed four units.');
    this.width_ = width;
    this.height_ = height;
    this.panel.setLayout({
      ...this.panel.layout,
      width: { type: 'exact', value: width },
      height: { type: 'exact', value: height }
    });
    this.updateVisual();
    return this;
  }
  private updateVisual(): void {
    if (!this.isAttached) return;
    const ratio = this.value_ === null ? 0.3 : (this.value_ - this.min_) / (this.max_ - this.min_);
    const innerWidth = this.width_ - 4;
    const x = this.value_ === null ? 2 + innerWidth * (this.phase - 0.3) : 2;
    const layout = {
      width: { type: 'exact' as const, value: innerWidth * ratio },
      height: { type: 'exact' as const, value: this.height_ - 4 },
      positionOffset: [x, 2] as [number, number]
    };
    if (JSON.stringify(this.fill.layout) !== JSON.stringify(layout)) this.fill.setLayout(layout);
    if (this.fill.visible !== ratio > 0) this.fill.setVisible(ratio > 0);
  }
}
