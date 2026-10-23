/** Static identifiers and tint presets for Demo 3D-7. */

export const TARGET_WINDOW = 1;
export const REALM_3D = 10;
export const INVOCATION_MAIN = 100;

export const CAMERA_ID = 1;

// Geometries
export const GEOM_PLANE_ID = 1;
export const GEOM_PEDESTAL_ID = 2;
export const GEOM_PILLAR_ID = 3;
export const GEOM_MIRROR_QUAD_ID = 4;
export const GEOM_GEM_ID = 5;
export const GEOM_FRAME_H_ID = 6;
export const GEOM_FRAME_V_ID = 7;
export const GEOM_SECRET_OBELISK_ID = 8;

// Materials
export const MAT_FLOOR_ID = 1;
export const MAT_PEDESTAL_ID = 2;
export const MAT_PILLAR_ID = 3;
export const MAT_MIRROR_PORTAL_ID = 4;
export const MAT_GEM_ID = 5;
export const MAT_FRAME_ID = 6;
export const MAT_SECRET_CHAMBER_ID = 7;
export const MAT_PARTICLE_ID = 8;
export const MAT_SECRET_PARTICLE_ID = 9;

// Models
export const MODEL_FLOOR_ID = 1;
export const MODEL_PEDESTAL_ID = 2;
export const MODEL_PILLAR_FL_ID = 3;
export const MODEL_PILLAR_FR_ID = 4;
export const MODEL_PILLAR_BL_ID = 5;
export const MODEL_PILLAR_BR_ID = 6;
export const MODEL_GEM_ID = 7;
export const MODEL_MIRROR_PORTAL_ID = 8;
export const MODEL_FRAME_TOP_ID = 9;
export const MODEL_FRAME_BOTTOM_ID = 10;
export const MODEL_FRAME_LEFT_ID = 11;
export const MODEL_FRAME_RIGHT_ID = 12;
export const MODEL_SECRET_OBELISK_ID = 13;
export const MODEL_SECRET_FLOOR_ID = 14;

// Lights
export const LIGHT_DIR_ID = 1;
export const LIGHT_POINT_CENTER_ID = 2;
export const LIGHT_POINT_SECRET_ID = 3;

// Emitters & Portal
export const EMITTER_FOUNTAIN_ID = 1;
export const EMITTER_SECRET_OBELISK_ID = 2;
export const PORTAL_GATEWAY_ID = 1;

export interface MirrorTint {
  name: string;
  color: [number, number, number, number];
}

export const MIRROR_TINTS: MirrorTint[] = [
  { name: 'Pure Silver', color: [0.96, 0.98, 1.0, 1.0] },
  { name: 'Warm Gold', color: [1.0, 0.88, 0.65, 1.0] },
  { name: 'Obsidian Dark', color: [0.45, 0.48, 0.55, 1.0] },
  { name: 'Mystic Cyan', color: [0.65, 0.95, 1.0, 1.0] }
];
