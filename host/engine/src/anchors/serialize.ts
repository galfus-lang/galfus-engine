import type { AnchorPresetDescriptor, AnchorStrategyParams } from './component';

export function serializeConstraint(constraint: unknown, dimension: '2d' | '3d'): string {
  if (typeof constraint === 'string') {
    if (constraint === 'translation') return JSON.stringify({ strategy: 'translationOnly' });
    if (constraint === 'rotation') return JSON.stringify({ strategy: 'rotationOnly' });
    if (constraint === 'lookAt') return JSON.stringify({ strategy: 'lookAt' });
    if (constraint === 'spring') return JSON.stringify({ strategy: 'spring' });
    if (constraint === 'rope') return JSON.stringify({ strategy: 'rope', maxLength: 1.0 });
    if (constraint === 'chain') return JSON.stringify({ strategy: 'chain', length: 1.0 });
    return JSON.stringify({ strategy: 'fixed' });
  }

  if (constraint && typeof constraint === 'object') {
    const obj = constraint as any;
    if (obj.script && typeof obj.script === 'string') {
      return JSON.stringify({ strategy: 'script', source: obj.script });
    }

    const desc: AnchorPresetDescriptor =
      typeof obj.strategy === 'object' && obj.strategy !== null ? obj.strategy : obj;
    const strategy = desc.strategy ?? 'fixed';
    const params: AnchorStrategyParams = {
      ...(typeof obj.strategy === 'object' ? obj.strategy.params : undefined),
      ...obj.params,
      ...(obj.offset ? { offset: obj.offset } : {})
    };

    const localAnchorOrigin = params.localAnchorOrigin;
    const localAnchorTarget = params.localAnchorTarget;

    if (strategy === 'translation') {
      return JSON.stringify({
        strategy: 'translationOnly',
        offset: params.offset ?? (dimension === '3d' ? [0, 0, 0] : [0, 0])
      });
    }
    if (strategy === 'spring') {
      return JSON.stringify({
        strategy: 'spring',
        stiffness: params.stiffness ?? 120,
        damping: params.damping ?? 14,
        restLength: params.restLength ?? 0,
        offset: params.offset ?? (dimension === '3d' ? [0, 0, 0] : [0, 0]),
        localAnchorOrigin,
        localAnchorTarget
      });
    }
    if (strategy === 'rope') {
      return JSON.stringify({
        strategy: 'rope',
        maxLength: params.maxLength ?? 1.0,
        damping: params.damping ?? 0,
        offset: params.offset ?? (dimension === '3d' ? [0, 0, 0] : [0, 0]),
        localAnchorOrigin,
        localAnchorTarget
      });
    }
    if (strategy === 'chain') {
      return JSON.stringify({
        strategy: 'chain',
        length: params.length ?? 1.0,
        alignRotation: params.alignRotation ?? true,
        offset: params.offset ?? (dimension === '3d' ? [0, 0, 0] : [0, 0]),
        localAnchorOrigin,
        localAnchorTarget
      });
    }
    if (strategy === 'hinge' || strategy === 'revolute') {
      return JSON.stringify({
        strategy: 'hinge',
        minAngle: params.minAngle ?? params.limits?.[0],
        maxAngle: params.maxAngle ?? params.limits?.[1],
        offset: params.offset ?? (dimension === '3d' ? [0, 0, 0] : [0, 0]),
        axis: params.axis ?? [0, 1, 0],
        localAnchorOrigin,
        localAnchorTarget,
        collideConnected: params.collideConnected ?? false
      });
    }
    if (strategy === 'angularSpring' || strategy === 'torsionSpring') {
      return JSON.stringify({
        strategy: 'angularSpring',
        targetAngle: params.targetAngle ?? 0,
        stiffness: params.angularStiffness ?? params.stiffness ?? 60,
        damping: params.angularDamping ?? params.damping ?? 6,
        minAngle: params.minAngle ?? params.limits?.[0],
        maxAngle: params.maxAngle ?? params.limits?.[1],
        offset: params.offset ?? (dimension === '3d' ? [0, 0, 0] : [0, 0]),
        axis: params.axis ?? [0, 1, 0],
        localAnchorOrigin,
        localAnchorTarget,
        collideConnected: params.collideConnected ?? false
      });
    }

    return JSON.stringify({
      strategy: 'fixed',
      offset: params.offset ?? (dimension === '3d' ? [0, 0, 0] : [0, 0]),
      localAnchorOrigin,
      localAnchorTarget
    });
  }

  return JSON.stringify({ strategy: 'fixed' });
}
