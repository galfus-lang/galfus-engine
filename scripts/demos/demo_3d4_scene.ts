/** Static identifiers, palettes, and positions for Demo 3D-4. */

export const TARGET_WINDOW = 1;
export const REALM_3D = 50;
export const INVOCATION_MAIN = 500;
export const CAMERA_ID = 1;

// Model, Geometry & Material IDs
export const MODEL_GROUND = 10;
export const MODEL_TORUS = 11;
export const MODEL_CAPSULE = 12;
export const MODEL_CYLINDER = 13;
export const MODEL_PYRAMID = 14;
export const MODEL_GLOW_CORE = 15;

export const GEOM_GROUND = 100;
export const GEOM_TORUS = 101;
export const GEOM_CAPSULE = 102;
export const GEOM_CYLINDER = 103;
export const GEOM_PYRAMID = 104;
export const GEOM_SPHERE = 105;

export const MAT_GROUND = 200;
export const MAT_TORUS = 201;
export const MAT_CAPSULE = 202;
export const MAT_CYLINDER = 203;
export const MAT_PYRAMID = 204;
export const MAT_GLOW_CORE = 205;

export const LIGHT_SUN = 300;
export const LIGHT_ORBIT_START = 301;
export const NUM_ORBIT_LIGHTS = 8;

export const LIGHT_PALETTE: [number, number, number][] = [
  [1.0, 0.25, 0.2],
  [0.2, 0.85, 1.0],
  [1.0, 0.8, 0.15],
  [0.85, 0.2, 0.95],
  [0.2, 1.0, 0.45],
  [0.3, 0.5, 1.0],
  [1.0, 0.5, 0.1],
  [0.9, 0.95, 1.0]
];

export const POS_TORUS: [number, number, number] = [-4.5, 1.5, 0.0];
export const POS_CAPSULE: [number, number, number] = [4.5, 1.5, 0.0];
export const POS_CYLINDER: [number, number, number] = [0.0, 1.5, -4.5];
export const POS_PYRAMID: [number, number, number] = [0.0, 1.2, 4.5];
export const POS_CORE: [number, number, number] = [0.0, 2.8, 0.0];
