export function extractKey(input: { physicalKey?: string; logicalKey?: any }): string {
  if (typeof input.logicalKey === 'string' && input.logicalKey.length > 0) {
    return input.logicalKey.toLowerCase();
  }
  const phys = String(input.physicalKey ?? '').toLowerCase();
  if (phys.startsWith('key') && phys.length === 4) return phys.slice(3);
  if (phys.startsWith('digit') && phys.length === 6) return phys.slice(5);
  return phys;
}

export function eulerToQuat(
  pitch: number,
  yaw: number,
  roll: number
): [number, number, number, number] {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);

  return [
    sp * cy * cr - cp * sy * sr,
    cp * sy * cr + sp * cy * sr,
    cp * cy * sr - sp * sy * cr,
    cp * cy * cr + sp * sy * sr
  ];
}

export function quatFromEuler(
  yaw: number,
  pitch: number,
  roll: number
): [number, number, number, number] {
  const cy = Math.cos(yaw * 0.5),
    sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5),
    sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5),
    sr = Math.sin(roll * 0.5);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy
  ];
}

export function quatFromLookAt(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number] = [0.0, 1.0, 0.0]
): [number, number, number, number] {
  let fx = target[0] - eye[0],
    fy = target[1] - eye[1],
    fz = target[2] - eye[2];
  const fLen = Math.hypot(fx, fy, fz);
  if (fLen < 1e-6) return [0, 0, 0, 1];
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  let sx = fy * up[2] - fz * up[1],
    sy = fz * up[0] - fx * up[2],
    sz = fx * up[1] - fy * up[0];
  const sLen = Math.hypot(sx, sy, sz);
  if (sLen < 1e-6) return [0, 0, 0, 1];
  sx /= sLen;
  sy /= sLen;
  sz /= sLen;

  const ux = sy * fz - sz * fy,
    uy = sz * fx - sx * fz,
    uz = sx * fy - sy * fx;
  const m00 = sx,
    m10 = sy,
    m20 = sz,
    m01 = ux,
    m11 = uy,
    m21 = uz,
    m02 = -fx,
    m12 = -fy,
    m22 = -fz;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
}
