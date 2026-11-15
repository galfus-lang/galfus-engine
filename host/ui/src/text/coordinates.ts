import type { Camera2DComponent, Model2DComponent, MultiverseRuntime } from '@galfus/engine';
import type { ComponentRoot } from '../components/root';

/** Resolve the unrounded affine projection for a direct UI presentation. */
function uiProjection(
  runtime: MultiverseRuntime,
  root: ComponentRoot,
  windowId: number
): ((x: number, y: number) => [number, number]) | undefined {
  const view = runtime.multiverse.presentationGraph.getWindow(windowId);
  if (!view) return undefined;
  const matches = view.rootTargetIds
    .flatMap((target) => view.getInvocations(target))
    .map((id) => view.getInvocation(id))
    .filter((invocation) => invocation?.realmId === root.realm.realmId);
  if (matches.length !== 1) return undefined;
  const invocation = matches[0]!;
  const [vx, vy, vw, vh] = invocation.resolvedViewport;
  if (vw <= 0 || vh <= 0) return undefined;
  const model = root.realm.world.getComponent<Model2DComponent>(root.entityId, 'Model2D');
  if (!model) return undefined;
  const rootRect = root.realm.getUiLayout(root.handle, root.root.id).absoluteRect;
  let camera: Camera2DComponent | undefined;
  let cameraModel: Model2DComponent | undefined;
  const slot = invocation.cameraSlot ?? 0;
  for (const entity of root.realm.world.query('Camera2D')) {
    const candidate = root.realm.world.getComponent<Camera2DComponent>(entity, 'Camera2D');
    if (
      !candidate ||
      candidate.desc.active === false ||
      ((candidate.desc.cameraSlot ?? 0) !== slot && candidate.cameraId !== slot)
    )
      continue;
    camera = candidate;
    cameraModel = root.realm.world.getComponent<Model2DComponent>(entity, 'Model2D');
    break;
  }
  if (!camera && invocation.cameraSlot !== undefined) return undefined;
  const scale = camera?.desc.orthoScale ?? vh;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  const cm = cameraModel?.worldMatrix;
  const angle = cm ? Math.atan2(cm[1], cm[0]) : 0;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const m = model.worldMatrix;
  const project = (x: number, y: number): [number, number] => {
    const lx = x - rootRect[2] / 2;
    const ly = rootRect[3] / 2 - y;
    const dx = m[0] * lx + m[2] * ly + m[4] - (cm?.[4] ?? 0);
    const dy = m[1] * lx + m[3] * ly + m[5] - (cm?.[5] ?? 0);
    const cx = cos * dx + sin * dy;
    const cy = -sin * dx + cos * dy;
    return [vx + vw / 2 + (cx * vh) / scale, vy + vh / 2 - (cy * vh) / scale];
  };
  return project;
}

/** Maps a window point into UI-local coordinates, including points outside the model. */
export function uiWindowPointToLocal(
  runtime: MultiverseRuntime,
  root: ComponentRoot,
  windowId: number,
  point: readonly [number, number]
): [number, number] | undefined {
  const project = uiProjection(runtime, root, windowId);
  if (!project) return undefined;
  const origin = project(0, 0),
    px = project(1, 0),
    py = project(0, 1);
  const a = px[0] - origin[0],
    b = px[1] - origin[1],
    c = py[0] - origin[0],
    d = py[1] - origin[1];
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return undefined;
  const x = point[0] - origin[0],
    y = point[1] - origin[1];
  return [(d * x - c * y) / determinant, (a * y - b * x) / determinant];
}

/** Maps a UI-local rectangle to physical pixels of a single direct presentation. */
export function uiTextRectToWindow(
  runtime: MultiverseRuntime,
  root: ComponentRoot,
  windowId: number,
  rect: readonly [number, number, number, number]
): [number, number, number, number] | undefined {
  const project = uiProjection(runtime, root, windowId);
  if (!project) return undefined;
  const [x, y, width, height] = rect;
  const points = [
    project(x, y),
    project(x + width, y),
    project(x, y + height),
    project(x + width, y + height)
  ];
  const left = Math.min(...points.map((p) => p[0]));
  const top = Math.min(...points.map((p) => p[1]));
  const right = Math.max(...points.map((p) => p[0]));
  const bottom = Math.max(...points.map((p) => p[1]));
  return [
    Math.floor(left),
    Math.floor(top),
    Math.max(1, Math.ceil(right) - Math.floor(left)),
    Math.max(1, Math.ceil(bottom) - Math.floor(top))
  ];
}
