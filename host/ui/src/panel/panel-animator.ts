import {
  parseBorderColor,
  parseBorderRadius,
  parseBorderWidth,
  parseColorToRgba
} from '../layout/quad';
import type { Panel } from './panel';

export interface PanelAnimationOptions {
  duration?: number;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  onComplete?: () => void;
}

export function ease(t: number, easing: string = 'linear'): number {
  switch (easing) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return t * (2 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default:
      return t;
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpQuad(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number
): [number, number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
}

export function getPanelAnimProperty(panel: Panel, prop: string): any {
  const style = panel.style;
  const rect = panel.rect;
  switch (prop) {
    case 'backgroundColor':
    case 'fill':
      return parseColorToRgba(style.fill, [0.06, 0.11, 0.18, 1]);
    case 'borderColor':
    case 'stroke':
      return parseBorderColor(style.stroke);
    case 'borderWidth':
    case 'strokeWidth':
      return parseBorderWidth(style.strokeWidth);
    case 'borderRadius':
    case 'radius':
      return parseBorderRadius(style.radius);
    case 'opacity':
      return style.opacity ?? 1;
    case 'x':
      return rect.x;
    case 'y':
      return rect.y;
    case 'width':
      return rect.width;
    case 'height':
      return rect.height;
    default:
      return 0;
  }
}

export function interpolateAnimProperty(prop: string, a: any, b: any, t: number): any {
  switch (prop) {
    case 'backgroundColor':
    case 'fill':
    case 'borderColor':
    case 'stroke':
    case 'borderWidth':
    case 'strokeWidth':
    case 'borderRadius':
    case 'radius': {
      const qa = Array.isArray(a) ? a : [a, a, a, a];
      const qb =
        prop.includes('Color') || prop === 'fill' || prop === 'stroke'
          ? parseColorToRgba(b)
          : parseBorderWidth(b);
      return lerpQuad(qa as any, qb as any, t);
    }
    default:
      return lerp(typeof a === 'number' ? a : 0, typeof b === 'number' ? b : 0, t);
  }
}

export function applyPanelAnimProperty(panel: Panel, prop: string, val: any): void {
  switch (prop) {
    case 'backgroundColor':
    case 'fill':
      panel.setBackgroundColor(val);
      break;
    case 'borderColor':
    case 'stroke':
      panel.setBorderColor(val);
      break;
    case 'borderWidth':
    case 'strokeWidth':
      panel.setBorderWidth(val);
      break;
    case 'borderRadius':
    case 'radius':
      panel.setBorderRadius(val);
      break;
    case 'opacity':
      panel.setOpacity(val);
      break;
    case 'width':
      panel.setSize(val, panel.rect.height);
      break;
    case 'height':
      panel.setSize(panel.rect.width, val);
      break;
    case 'x':
      panel.setPosition(val, panel.rect.y);
      break;
    case 'y':
      panel.setPosition(panel.rect.x, val);
      break;
  }
}

export function animatePanel(
  panel: Panel,
  property: string,
  targetValue: any,
  options: PanelAnimationOptions = {}
): Panel {
  const duration = options.duration ?? 200;
  const easing = options.easing ?? 'easeOut';
  if (duration <= 0) {
    applyPanelAnimProperty(panel, property, targetValue);
    options.onComplete?.();
    return panel;
  }

  const startVal = getPanelAnimProperty(panel, property);
  const startTime = Date.now();
  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / duration);
    const t = ease(progress, easing);
    const current = interpolateAnimProperty(property, startVal, targetValue, t);
    applyPanelAnimProperty(panel, property, current);
    if (progress >= 1) {
      clearInterval(interval);
      options.onComplete?.();
    }
  }, 16);

  return panel;
}
