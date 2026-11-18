use glam::{Quat, Vec2, Vec3};
use serde::{Deserialize, Serialize};

/// 2D spatial pose holding position, rotation angle (radians), and scale.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pose2D {
    pub position: Vec2,
    pub rotation: f32,
    pub scale: Vec2,
}

impl Default for Pose2D {
    fn default() -> Self {
        Self {
            position: Vec2::ZERO,
            rotation: 0.0,
            scale: Vec2::ONE,
        }
    }
}

impl Pose2D {
    pub fn new(position: Vec2, rotation: f32, scale: Vec2) -> Self {
        Self {
            position,
            rotation,
            scale,
        }
    }

    pub fn from_position(position: Vec2) -> Self {
        Self {
            position,
            ..Default::default()
        }
    }
}

/// 3D spatial pose holding position, orientation quaternion, and scale.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pose3D {
    pub position: Vec3,
    pub rotation: Quat,
    pub scale: Vec3,
}

impl Default for Pose3D {
    fn default() -> Self {
        Self {
            position: Vec3::ZERO,
            rotation: Quat::IDENTITY,
            scale: Vec3::ONE,
        }
    }
}

impl Pose3D {
    pub fn new(position: Vec3, rotation: Quat, scale: Vec3) -> Self {
        Self {
            position,
            rotation,
            scale,
        }
    }

    pub fn from_position(position: Vec3) -> Self {
        Self {
            position,
            ..Default::default()
        }
    }
}

/// 2D hierarchy constraint presets and custom scripting options.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "strategy", rename_all = "camelCase")]
pub enum HierarchyConstraint2D {
    /// Fully rigid attachment: child follows parent translation and rotation.
    #[serde(rename_all = "camelCase")]
    Fixed {
        #[serde(default)]
        offset: [f32; 2],
        #[serde(default)]
        rotation_offset: f32,
        #[serde(default)]
        local_anchor_origin: Option<[f32; 2]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 2]>,
    },
    /// Inherits parent translation only, preserving child rotation.
    #[serde(rename_all = "camelCase")]
    TranslationOnly {
        #[serde(default)]
        offset: [f32; 2],
    },
    /// Inherits parent rotation only, preserving child translation.
    #[serde(rename_all = "camelCase")]
    RotationOnly {
        #[serde(default)]
        rotation_offset: f32,
    },
    /// Continuously rotates child to point towards parent position.
    LookAt,
    /// Damped harmonic oscillator constraint.
    #[serde(rename_all = "camelCase")]
    Spring {
        #[serde(default = "default_spring_stiffness")]
        stiffness: f32,
        #[serde(default = "default_spring_damping")]
        damping: f32,
        #[serde(default)]
        rest_length: f32,
        #[serde(default)]
        offset: [f32; 2],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 2]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 2]>,
    },
    /// Distance slack constraint: origin moves freely up to `max_length`.
    #[serde(rename_all = "camelCase")]
    Rope {
        max_length: f32,
        #[serde(default)]
        damping: f32,
        #[serde(default)]
        offset: [f32; 2],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 2]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 2]>,
    },
    /// Rigid distance link constraint.
    #[serde(rename_all = "camelCase")]
    Chain {
        length: f32,
        #[serde(default = "default_true")]
        align_rotation: bool,
        #[serde(default)]
        offset: [f32; 2],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 2]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 2]>,
    },
    /// Rotational hinge with optional angle limits.
    #[serde(rename_all = "camelCase")]
    Hinge {
        min_angle: Option<f32>,
        max_angle: Option<f32>,
        #[serde(default)]
        offset: [f32; 2],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 2]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 2]>,
        #[serde(default)]
        collide_connected: bool,
    },
    /// Torsional / angular spring constraint.
    #[serde(rename_all = "camelCase")]
    AngularSpring {
        #[serde(default)]
        target_angle: f32,
        #[serde(default = "default_angular_stiffness")]
        stiffness: f32,
        #[serde(default = "default_angular_damping")]
        damping: f32,
        min_angle: Option<f32>,
        max_angle: Option<f32>,
        #[serde(default)]
        offset: [f32; 2],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 2]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 2]>,
        #[serde(default)]
        collide_connected: bool,
    },
    /// Custom constraint evaluated per frame using the Rhai scripting engine.
    #[serde(rename_all = "camelCase")]
    Script { source: String },
}

impl Default for HierarchyConstraint2D {
    fn default() -> Self {
        Self::Fixed {
            offset: [0.0, 0.0],
            rotation_offset: 0.0,
            local_anchor_origin: None,
            local_anchor_target: None,
        }
    }
}

/// 3D hierarchy constraint presets and custom scripting options.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "strategy", rename_all = "camelCase")]
pub enum HierarchyConstraint3D {
    /// Fully rigid attachment: child follows parent translation and rotation.
    #[serde(rename_all = "camelCase")]
    Fixed {
        #[serde(default)]
        offset: [f32; 3],
        rotation_offset: Option<[f32; 4]>,
        #[serde(default)]
        local_anchor_origin: Option<[f32; 3]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 3]>,
    },
    /// Inherits parent translation only, preserving child rotation.
    #[serde(rename_all = "camelCase")]
    TranslationOnly {
        #[serde(default)]
        offset: [f32; 3],
    },
    /// Inherits parent rotation only, preserving child translation.
    #[serde(rename_all = "camelCase")]
    RotationOnly { rotation_offset: Option<[f32; 4]> },
    /// Continuously rotates child to point towards parent position.
    #[serde(rename_all = "camelCase")]
    LookAt {
        #[serde(default = "default_up_vector")]
        up: [f32; 3],
    },
    /// Damped harmonic oscillator constraint.
    #[serde(rename_all = "camelCase")]
    Spring {
        #[serde(default = "default_spring_stiffness")]
        stiffness: f32,
        #[serde(default = "default_spring_damping")]
        damping: f32,
        #[serde(default)]
        rest_length: f32,
        #[serde(default)]
        offset: [f32; 3],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 3]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 3]>,
    },
    /// Distance slack constraint: origin moves freely up to `max_length`.
    #[serde(rename_all = "camelCase")]
    Rope {
        max_length: f32,
        #[serde(default)]
        damping: f32,
        #[serde(default)]
        offset: [f32; 3],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 3]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 3]>,
    },
    /// Rigid distance link constraint.
    #[serde(rename_all = "camelCase")]
    Chain {
        length: f32,
        #[serde(default = "default_true")]
        align_rotation: bool,
        #[serde(default)]
        offset: [f32; 3],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 3]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 3]>,
    },
    /// Rotational hinge with axis and optional angle limits.
    #[serde(rename_all = "camelCase")]
    Hinge {
        #[serde(default = "default_up_vector")]
        axis: [f32; 3],
        min_angle: Option<f32>,
        max_angle: Option<f32>,
        #[serde(default)]
        offset: [f32; 3],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 3]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 3]>,
        #[serde(default)]
        collide_connected: bool,
    },
    /// Torsional / angular spring constraint.
    #[serde(rename_all = "camelCase")]
    AngularSpring {
        #[serde(default)]
        target_angle: f32,
        #[serde(default = "default_angular_stiffness")]
        stiffness: f32,
        #[serde(default = "default_angular_damping")]
        damping: f32,
        #[serde(default = "default_up_vector")]
        axis: [f32; 3],
        min_angle: Option<f32>,
        max_angle: Option<f32>,
        #[serde(default)]
        offset: [f32; 3],
        #[serde(default)]
        local_anchor_origin: Option<[f32; 3]>,
        #[serde(default)]
        local_anchor_target: Option<[f32; 3]>,
        #[serde(default)]
        collide_connected: bool,
    },
    /// Custom constraint evaluated per frame using the Rhai scripting engine.
    #[serde(rename_all = "camelCase")]
    Script { source: String },
}

impl Default for HierarchyConstraint3D {
    fn default() -> Self {
        Self::Fixed {
            offset: [0.0, 0.0, 0.0],
            rotation_offset: None,
            local_anchor_origin: None,
            local_anchor_target: None,
        }
    }
}

/// Dynamic kinematic state for 2D constraints across ticks.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct KinematicState2D {
    pub initialized: bool,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub angle: f32,
    pub w: f32,
}

/// Dynamic kinematic state for 3D constraints across ticks.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct KinematicState3D {
    pub initialized: bool,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
}

/// Represents an anchor node linking an origin entity to a target entity in 2D.
#[derive(Debug, Clone)]
pub struct AnchorNode2D {
    pub target_id: u32,
    pub constraint: HierarchyConstraint2D,
    pub ast: Option<rhai::AST>,
    pub state: KinematicState2D,
    pub managed_by_physics: bool,
}

/// Represents an anchor node linking an origin entity to a target entity in 3D.
#[derive(Debug, Clone)]
pub struct AnchorNode3D {
    pub target_id: u32,
    pub constraint: HierarchyConstraint3D,
    pub ast: Option<rhai::AST>,
    pub state: KinematicState3D,
    pub managed_by_physics: bool,
}

const fn default_true() -> bool {
    true
}

const fn default_spring_stiffness() -> f32 {
    120.0
}

const fn default_spring_damping() -> f32 {
    14.0
}

const fn default_angular_stiffness() -> f32 {
    60.0
}

const fn default_angular_damping() -> f32 {
    6.0
}

const fn default_up_vector() -> [f32; 3] {
    [0.0, 1.0, 0.0]
}
