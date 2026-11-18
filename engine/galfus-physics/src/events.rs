use rapier2d::prelude as r2d;
use rapier3d::prelude as r3d;

pub(crate) struct EventCollector2D {
    pub(crate) events: std::sync::Mutex<Vec<r2d::CollisionEvent>>,
}

impl r2d::EventHandler for EventCollector2D {
    fn handle_collision_event(
        &self,
        _bodies: &r2d::RigidBodySet,
        _colliders: &r2d::ColliderSet,
        event: r2d::CollisionEvent,
        _contact_pair: Option<&r2d::ContactPair>,
    ) {
        if let Ok(mut lock) = self.events.lock() {
            lock.push(event);
        }
    }

    fn handle_contact_force_event(
        &self,
        _dt: f32,
        _bodies: &r2d::RigidBodySet,
        _colliders: &r2d::ColliderSet,
        _contact_pair: &r2d::ContactPair,
        _total_force_magnitude: f32,
    ) {
    }

    fn handle_soft_body_tear_event(
        &self,
        _bodies: &r2d::SoftBodySet,
        _event: &r2d::SoftBodyTearEvent,
    ) {
    }
}

pub(crate) struct EventCollector3D {
    pub(crate) events: std::sync::Mutex<Vec<r3d::CollisionEvent>>,
}

impl r3d::EventHandler for EventCollector3D {
    fn handle_collision_event(
        &self,
        _bodies: &r3d::RigidBodySet,
        _colliders: &r3d::ColliderSet,
        event: r3d::CollisionEvent,
        _contact_pair: Option<&r3d::ContactPair>,
    ) {
        if let Ok(mut lock) = self.events.lock() {
            lock.push(event);
        }
    }

    fn handle_contact_force_event(
        &self,
        _dt: f32,
        _bodies: &r3d::RigidBodySet,
        _colliders: &r3d::ColliderSet,
        _contact_pair: &r3d::ContactPair,
        _total_force_magnitude: f32,
    ) {
    }

    fn handle_soft_body_tear_event(
        &self,
        _bodies: &r3d::SoftBodySet,
        _event: &r3d::SoftBodyTearEvent,
    ) {
    }
}
