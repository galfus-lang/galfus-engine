/** 3D Spatial math utilities and transform pack helpers. */

/** Packs position [x,y,z], rotation quaternion [x,y,z,w], and scale [x,y,z] into a 10-float buffer. */
export function packTransform3DFast(
  out: Float32Array,
  offset: number,
  pos: [number, number, number],
  rotQuat: [number, number, number, number],
  scale: [number, number, number]
): void {
  out[offset + 0] = pos[0];
  out[offset + 1] = pos[1];
  out[offset + 2] = pos[2];
  out[offset + 3] = rotQuat[0];
  out[offset + 4] = rotQuat[1];
  out[offset + 5] = rotQuat[2];
  out[offset + 6] = rotQuat[3];
  out[offset + 7] = scale[0];
  out[offset + 8] = scale[1];
  out[offset + 9] = scale[2];
}

/** Allocates a reusable 10-float buffer for single entity fast updates. */
export function createTransform3DBuffer(): Float32Array {
  return new Float32Array(10);
}
