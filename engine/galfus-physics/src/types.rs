use serde::{Deserialize, Serialize};

/// High-level rigid body simulation type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum RigidBodyType {
    /// Dynamic body simulated with forces, contacts, and gravity.
    #[default]
    Dynamic,
    /// Fixed static obstacle that never moves.
    Fixed,
    /// Kinematic body driven by user-assigned position poses.
    KinematicPosition,
    /// Kinematic body driven by user-assigned velocities.
    KinematicVelocity,
}

/// Descriptor for creating or updating a 2D rigid body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigidBodyDesc2D {
    #[serde(default, alias = "type")]
    pub body_type: RigidBodyType,
    #[serde(default)]
    pub mass: Option<f32>,
    #[serde(default = "default_gravity_scale")]
    pub gravity_scale: f32,
    #[serde(default)]
    pub linear_damping: f32,
    #[serde(default)]
    pub angular_damping: f32,
    #[serde(default)]
    pub linear_velocity: [f32; 2],
    #[serde(default)]
    pub angular_velocity: f32,
    #[serde(default = "default_restitution")]
    pub restitution: f32,
    #[serde(default = "default_friction")]
    pub friction: f32,
    #[serde(default)]
    pub ccd: bool,
    #[serde(default)]
    pub lock_translations: bool,
    #[serde(default)]
    pub lock_rotations: bool,
    #[serde(default)]
    pub initial_position: Option<[f32; 2]>,
    #[serde(default)]
    pub initial_rotation: Option<f32>,
    #[serde(default)]
    pub initial_scale: Option<[f32; 2]>,
}

impl Default for RigidBodyDesc2D {
    fn default() -> Self {
        Self {
            body_type: RigidBodyType::Dynamic,
            mass: None,
            gravity_scale: 1.0,
            linear_damping: 0.0,
            angular_damping: 0.0,
            linear_velocity: [0.0, 0.0],
            angular_velocity: 0.0,
            restitution: 0.2,
            friction: 0.5,
            ccd: false,
            lock_translations: false,
            lock_rotations: false,
            initial_position: None,
            initial_rotation: None,
            initial_scale: None,
        }
    }
}

/// Descriptor for creating or updating a 3D rigid body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigidBodyDesc3D {
    #[serde(default, alias = "type")]
    pub body_type: RigidBodyType,
    #[serde(default)]
    pub mass: Option<f32>,
    #[serde(default = "default_gravity_scale")]
    pub gravity_scale: f32,
    #[serde(default)]
    pub linear_damping: f32,
    #[serde(default)]
    pub angular_damping: f32,
    #[serde(default)]
    pub linear_velocity: [f32; 3],
    #[serde(default)]
    pub angular_velocity: [f32; 3],
    #[serde(default = "default_enabled_rotations")]
    pub enabled_rotations: [bool; 3],
    #[serde(default = "default_restitution")]
    pub restitution: f32,
    #[serde(default = "default_friction")]
    pub friction: f32,
    #[serde(default)]
    pub ccd: bool,
    #[serde(default)]
    pub lock_translations: bool,
    #[serde(default)]
    pub lock_rotations: bool,
    #[serde(default)]
    pub initial_position: Option<[f32; 3]>,
    #[serde(default)]
    pub initial_rotation: Option<[f32; 4]>,
    #[serde(default)]
    pub initial_scale: Option<[f32; 3]>,
}

impl Default for RigidBodyDesc3D {
    fn default() -> Self {
        Self {
            body_type: RigidBodyType::Dynamic,
            mass: None,
            gravity_scale: 1.0,
            linear_damping: 0.0,
            angular_damping: 0.0,
            linear_velocity: [0.0, 0.0, 0.0],
            angular_velocity: [0.0, 0.0, 0.0],
            enabled_rotations: [true, true, true],
            restitution: 0.2,
            friction: 0.5,
            ccd: false,
            lock_translations: false,
            lock_rotations: false,
            initial_position: None,
            initial_rotation: None,
            initial_scale: None,
        }
    }
}

/// Joint definition for connecting two 2D rigid bodies.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum JointDesc2D {
    Fixed {
        #[serde(default)]
        anchor1: [f32; 2],
        #[serde(default)]
        anchor2: [f32; 2],
    },
    Revolute {
        #[serde(default)]
        anchor1: [f32; 2],
        #[serde(default)]
        anchor2: [f32; 2],
        limits: Option<[f32; 2]>,
        motor: Option<[f32; 3]>,
        #[serde(default)]
        collide_connected: bool,
    },
    Prismatic {
        #[serde(default)]
        anchor1: [f32; 2],
        #[serde(default)]
        anchor2: [f32; 2],
        #[serde(default)]
        axis: [f32; 2],
        limits: Option<[f32; 2]>,
    },
    Rope {
        #[serde(default)]
        anchor1: [f32; 2],
        #[serde(default)]
        anchor2: [f32; 2],
        max_length: f32,
    },
    Spring {
        #[serde(default)]
        anchor1: [f32; 2],
        #[serde(default)]
        anchor2: [f32; 2],
        rest_length: f32,
        stiffness: f32,
        damping: f32,
    },
}

/// Joint definition for connecting two 3D rigid bodies.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum JointDesc3D {
    Fixed {
        #[serde(default)]
        anchor1: [f32; 3],
        #[serde(default)]
        anchor2: [f32; 3],
    },
    Revolute {
        #[serde(default)]
        anchor1: [f32; 3],
        #[serde(default)]
        anchor2: [f32; 3],
        #[serde(default = "default_up_axis")]
        axis: [f32; 3],
        limits: Option<[f32; 2]>,
        motor: Option<[f32; 3]>,
        #[serde(default)]
        collide_connected: bool,
    },
    Prismatic {
        #[serde(default)]
        anchor1: [f32; 3],
        #[serde(default)]
        anchor2: [f32; 3],
        #[serde(default = "default_up_axis")]
        axis: [f32; 3],
        limits: Option<[f32; 2]>,
    },
    Spherical {
        #[serde(default)]
        anchor1: [f32; 3],
        #[serde(default)]
        anchor2: [f32; 3],
    },
    Rope {
        #[serde(default)]
        anchor1: [f32; 3],
        #[serde(default)]
        anchor2: [f32; 3],
        max_length: f32,
    },
    Spring {
        #[serde(default)]
        anchor1: [f32; 3],
        #[serde(default)]
        anchor2: [f32; 3],
        rest_length: f32,
        stiffness: f32,
        damping: f32,
    },
}

/// Collision and sensor contact events between two entities.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsContactEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub entity_a: u32,
    pub entity_b: u32,
    pub sensor: bool,
}

/// Logical ID, position, and rotation of a simulated 3D body.
pub type PhysicsPose3D = (u32, f32, f32, f32, f32, f32, f32, f32);

/// Simulation result payload returned to host after 3D fixed physics tick.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsStepResult3D {
    pub poses: Vec<PhysicsPose3D>,
    pub events: Vec<PhysicsContactEvent>,
}

/// Simulation result payload returned to host after 2D fixed physics tick.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsStepResult2D {
    pub poses: Vec<(u32, f32, f32, f32)>,
    pub events: Vec<PhysicsContactEvent>,
}

const fn default_gravity_scale() -> f32 {
    1.0
}

const fn default_restitution() -> f32 {
    0.2
}

const fn default_friction() -> f32 {
    0.5
}

const fn default_enabled_rotations() -> [bool; 3] {
    [true, true, true]
}

const fn default_up_axis() -> [f32; 3] {
    [0.0, 1.0, 0.0]
}

/// Commands for manipulating an existing simulated body.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BodyCommand2D {
    SetPose { position: [f32; 2], rotation: f32 },
    ImpulseAtPoint { impulse: [f32; 2], point: [f32; 2] },
    ForceAtPoint { force: [f32; 2], point: [f32; 2] },
    Torque { torque: f32 },
    Velocity,
}

/// Commands for manipulating an existing simulated 3D body.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BodyCommand3D {
    SetPose {
        position: [f32; 3],
        rotation: [f32; 4],
    },
    ImpulseAtPoint {
        impulse: [f32; 3],
        point: [f32; 3],
    },
    ForceAtPoint {
        force: [f32; 3],
        point: [f32; 3],
    },
    Torque {
        torque: [f32; 3],
    },
    Velocity,
}
